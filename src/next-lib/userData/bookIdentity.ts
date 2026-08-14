import fs from "fs";
import path from "path";
import crypto from "crypto";

import { getPublicationsDir, getReadiumServerUrl } from "./publicationsConfig";
import { computePartialMD5 } from "./kosyncHash";

// CLAUDE-ADDED: In-memory hash cache keyed by resolved file path, stamped with mtime so an
// edited/replaced file is transparently re-hashed -- mirrors the manifest cache in api/books/route.ts.
type CachedIdentity = { mtimeMs: number; hash: string };
const identityCache = new Map<string, CachedIdentity>();

const EBOOK_EXTENSIONS = [".epub", ".pdf", ".cbz"];
const AUDIOBOOK_EXTENSIONS = [".m4b"];
const LIBRARY_EXTENSIONS = [...EBOOK_EXTENSIONS, ...AUDIOBOOK_EXTENSIONS];

export interface LibraryScan {
  booksInLibrary: number;
  audiobooksInLibrary: number;
  // CLAUDE-ADDED: hashes of every audiobook currently on disk, used to split per-user hash-keyed
  // data (which doesn't otherwise know ebook from audiobook) the same way stats/route.ts always has.
  audiobookHashes: Set<string>;
  // CLAUDE-ADDED: hashes of every book (ebook or audiobook) currently on disk -- the membership test
  // for "is this per-user data file still attached to a real library entry, or orphaned by a
  // deleted/moved book." Same computePartialMD5 identity every positions/highlights/etc file is
  // keyed by (see resolveBookIdentity), so a file whose hash isn't in this set has no matching book.
  libraryHashes: Set<string>;
}

// CLAUDE-ADDED: One filesystem walk of the publications dir, shared by the stats route (counts) and
// the admin orphaned-data route (membership) so the two can never disagree about what's "in the
// library." computePartialMD5 is cheap (12 fixed-size samples per file, see kosyncHash.ts) even over
// a large library, so hashing every book -- not just audiobooks, as the original stats-only version
// of this walk did -- is fine to do on every call rather than caching across requests.
export function scanLibrary(): LibraryScan {
  const audiobookHashes = new Set<string>();
  const libraryHashes = new Set<string>();
  let booksInLibrary = 0;
  let audiobooksInLibrary = 0;

  try {
    const publicationsDir = getPublicationsDir();
    const files = fs.readdirSync(publicationsDir, { recursive: true }) as string[];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!LIBRARY_EXTENSIONS.includes(ext)) continue;

      const fullPath = path.join(publicationsDir, file);
      if (!fs.statSync(fullPath).isFile()) continue;

      const isAudiobook = AUDIOBOOK_EXTENSIONS.includes(ext);
      if (isAudiobook) audiobooksInLibrary++;
      else booksInLibrary++;

      try {
        const hash = computePartialMD5(fullPath);
        libraryHashes.add(hash);
        if (isAudiobook) audiobookHashes.add(hash);
      } catch {
        // Unreadable file -- leave it out of the hash sets, its per-user data (if any) will just
        // fall through as orphaned rather than crashing the whole scan.
      }
    }
  } catch {
    // Publications dir missing/unreadable -- counts stay zero, hash sets stay empty.
  }

  return { booksInLibrary, audiobooksInLibrary, audiobookHashes, libraryHashes };
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

// CLAUDE-ADDED: Recovers the on-disk filename from a manifest URL built by api/books/route.ts's
// `${getReadiumServerUrl()}/webpub/${base64UrlEncode(file)}/manifest.json` scheme, so we can hash
// the actual file instead of the URL. Returns null for anything that isn't a local library
// publication (external manifest URLs, or a decoded name that doesn't resolve to a real file).
// CLAUDE-ADDED: Read live (not cached in a module-level constant) since the Readium URL is now a
// user-editable setting -- a manifest URL built before a change was saved must still resolve
// against whatever the setting was at the time it was built, which this always reflects since
// getReadiumServerUrl() itself is the single cached-until-changed source of truth.
export function resolveLocalFile(manifestUrl: string): string | null {
  const prefix = `${ getReadiumServerUrl() }/webpub/`;
  if (!manifestUrl.startsWith(prefix)) return null;

  const rest = manifestUrl.slice(prefix.length);
  const encodedName = rest.split("/")[0];
  if (!encodedName) return null;

  let filename: string;
  try {
    filename = base64UrlDecode(encodedName);
  } catch {
    return null;
  }

  const publicationsDir = getPublicationsDir();
  const resolved = path.join(publicationsDir, filename);
  const relative = path.relative(publicationsDir, resolved);

  // Guard against the decoded name escaping the publications dir via ../
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return fs.existsSync(resolved) ? resolved : null;
}

// CLAUDE-ADDED: Stable per-book identity for the UserData store. Prefers the KOSync content hash of
// the actual local file (survives renames); falls back to hashing the manifest URL itself for
// externally-hosted publications we have no local file for.
export function resolveBookIdentity(manifestUrl: string): string {
  const localFile = resolveLocalFile(manifestUrl);

  if (localFile) {
    const stat = fs.statSync(localFile);
    const cached = identityCache.get(localFile);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.hash;

    const hash = computePartialMD5(localFile);
    identityCache.set(localFile, { mtimeMs: stat.mtimeMs, hash });
    return hash;
  }

  return crypto.createHash("sha1").update(manifestUrl).digest("hex");
}
