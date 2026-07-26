import fs from "fs";
import path from "path";
import crypto from "crypto";

import { getPublicationsDir, READIUM_SERVER_URL } from "./publicationsConfig";
import { computePartialMD5 } from "./kosyncHash";

// CLAUDE-ADDED: In-memory hash cache keyed by resolved file path, stamped with mtime so an
// edited/replaced file is transparently re-hashed -- mirrors the manifest cache in api/books/route.ts.
type CachedIdentity = { mtimeMs: number; hash: string };
const identityCache = new Map<string, CachedIdentity>();

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

// CLAUDE-ADDED: Recovers the on-disk filename from a manifest URL built by api/books/route.ts's
// `${READIUM_SERVER_URL}/webpub/${base64UrlEncode(file)}/manifest.json` scheme, so we can hash the
// actual file instead of the URL. Returns null for anything that isn't a local library publication
// (external manifest URLs, or a decoded name that doesn't resolve to a real file).
function resolveLocalFile(manifestUrl: string): string | null {
  const prefix = `${ READIUM_SERVER_URL }/webpub/`;
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
