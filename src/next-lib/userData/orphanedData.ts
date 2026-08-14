import fs from "fs";
import path from "path";

import { listUsers } from "./auth";
import { getUserDir } from "./paths";
import { scanLibrary } from "./bookIdentity";

// CLAUDE-ADDED: Every per-book UserData subdirectory (see paths.ts's getXFilePath functions) --
// each holds one `${bookHash}.json` file per book that's ever had that kind of data. Deliberately
// broader than migrateBookData.ts's PER_BOOK_FILE_GETTERS (which is missing dailyListeningHistory):
// this is a cleanup sweep, not a migration, so it needs to find every file a deleted book could have
// left behind, not just the ones a single-book migration bothers to carry forward.
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

  return Array.from(subdirsByHash.entries()).map(([hash, subdirs]) => ({ hash, subdirs }));
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

  for (const user of report.users) {
    for (const book of user.books) {
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

  return report;
}
