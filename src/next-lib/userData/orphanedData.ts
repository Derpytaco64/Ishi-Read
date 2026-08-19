import fs from "fs";
import path from "path";

import { listUsers } from "./auth";
import { getUserDir } from "./paths";
import { scanLibrary } from "./bookIdentity";
import { getBookTitles, removeBookTitles } from "./bookTitles";
import { migrateBookUserData } from "./migrateBookData";

// CLAUDE-ADDED: Every per-book UserData subdirectory (see paths.ts's getXFilePath functions) --
// each holds one `${bookHash}.json` file per book that's ever had that kind of data. Kept in sync
// with migrateBookData.ts's PER_BOOK_FILE_GETTERS (every getter here has a matching subdir) so this
// cleanup sweep and a single-book migration always agree on what's orphaned.
export const PER_BOOK_DATA_SUBDIRS = [
  "positions",
  "highlights",
  "bookmarks",
  "notes",
  "readingTime",
  "completedReadTimes",
  "wordCount",
  "pageCount",
  "dailyReadingHistory",
  "listeningTime",
  "completedListens",
  "dailyListeningHistory"
] as const;

export interface OrphanedBook {
  hash: string;
  // CLAUDE-ADDED: Which of PER_BOOK_DATA_SUBDIRS actually have a file for this hash -- lets the
  // preview UI show e.g. "highlights, notes, reading time" instead of just a bare hash.
  subdirs: string[];
  // CLAUDE-ADDED: Looked up from bookTitles.ts's registry, populated whenever /api/books last saw
  // this hash in the library -- null if the book vanished before that registry ever recorded it
  // (e.g. it was deleted before this feature shipped). Lets the admin preview show what's actually
  // being deleted instead of a bare hash.
  title: string | null;
  manifestUrl: string | null;
}

export interface OrphanedUserData {
  userId: string;
  username: string;
  name: string;
  books: OrphanedBook[];
  fileCount: number;
}

export interface OrphanedDataReport {
  users: OrphanedUserData[];
  totalFiles: number;
}

function findOrphanedBooksForUser(userId: string, libraryHashes: Set<string>): OrphanedBook[] {
  const subdirsByHash = new Map<string, string[]>();

  for (const subdir of PER_BOOK_DATA_SUBDIRS) {
    const dir = path.join(getUserDir(userId), subdir);
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(name => name.endsWith(".json"));
    } catch {
      continue;
    }

    for (const file of files) {
      const hash = file.replace(/\.json$/, "");
      if (libraryHashes.has(hash)) continue;

      const existing = subdirsByHash.get(hash);
      if (existing) existing.push(subdir);
      else subdirsByHash.set(hash, [subdir]);
    }
  }

  const titles = getBookTitles(subdirsByHash.keys());

  return Array.from(subdirsByHash.entries()).map(([hash, subdirs]) => {
    const entry = titles.get(hash);
    return { hash, subdirs, title: entry?.title ?? null, manifestUrl: entry?.manifestUrl ?? null };
  });
}

// CLAUDE-ADDED: Shared by the admin preview (GET) and delete (DELETE) routes so the two can never
// find a different set of orphaned files than what actually gets removed. Scans every user, not just
// the caller, since this is an admin-wide cleanup, not a per-user self-service action.
export function findOrphanedData(): OrphanedDataReport {
  const { libraryHashes } = scanLibrary();
  const users: OrphanedUserData[] = [];

  for (const user of listUsers()) {
    const books = findOrphanedBooksForUser(user.id, libraryHashes);
    if (books.length === 0) continue;

    const fileCount = books.reduce((sum, book) => sum + book.subdirs.length, 0);
    users.push({ userId: user.id, username: user.username, name: user.name, books, fileCount });
  }

  const totalFiles = users.reduce((sum, user) => sum + user.fileCount, 0);
  return { users, totalFiles };
}

// CLAUDE-ADDED: Deletes exactly the files findOrphanedData() would report -- callers should fetch a
// fresh report first (not reuse a stale preview) so what's deleted always matches what a user last
// saw and confirmed, in case a book was added back to the library in between.
export function deleteOrphanedData(): OrphanedDataReport {
  const report = findOrphanedData();
  const deletedHashes = new Set<string>();

  for (const user of report.users) {
    for (const book of user.books) {
      deletedHashes.add(book.hash);
      for (const subdir of book.subdirs) {
        const filePath = path.join(getUserDir(user.userId), subdir, `${ book.hash }.json`);
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Already gone -- nothing left to do.
        }
      }
    }
  }

  // CLAUDE-ADDED: The saved title/manifest for a hash only exists to label its orphaned data in this
  // report -- once that data is actually deleted, nothing else looks it up, so remove it here too
  // rather than leaving it to grow the registry forever.
  if (deletedHashes.size > 0) removeBookTitles(deletedHashes);

  return report;
}

export type MigrateOrphanedResult = { ok: true } | { ok: false; error: string };

// CLAUDE-ADDED: The "recover instead of delete" counterpart to deleteOrphanedData -- carries one
// orphaned book's UserData (for one user) onto a live library entry via migrateBookUserData, then
// removes the now-redundant orphaned files so a re-scan doesn't keep reporting them. Re-validates
// both hashes against a fresh scanLibrary() rather than trusting the caller's last preview, same
// reasoning as deleteOrphanedData re-deriving its own report: a book could have been re-added to the
// library (sourceHash no longer orphaned) or removed (destHash no longer resolvable) in between the
// admin's last scan and clicking migrate. Doesn't touch the bookTitles registry entry for sourceHash
// -- unlike a bulk delete, another user could still have their own orphaned data under the same
// hash (the library is shared, per-user data isn't), so only deleteOrphanedData's full-report sweep
// is safe to prune it.
export function migrateOrphanedBookData(userId: string, sourceHash: string, destHash: string): MigrateOrphanedResult {
  if (sourceHash === destHash) return { ok: false, error: "Source and destination are the same book" };

  const { libraryHashes } = scanLibrary();
  if (libraryHashes.has(sourceHash)) {
    return { ok: false, error: "That data is no longer orphaned -- its book is back in the library. Use Migrate Book Data instead." };
  }
  if (!libraryHashes.has(destHash)) {
    return { ok: false, error: "Destination book isn't in the library" };
  }

  migrateBookUserData(userId, sourceHash, destHash);

  for (const subdir of PER_BOOK_DATA_SUBDIRS) {
    const filePath = path.join(getUserDir(userId), subdir, `${ sourceHash }.json`);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Never had this kind of data -- nothing to remove.
    }
  }

  return { ok: true };
}
