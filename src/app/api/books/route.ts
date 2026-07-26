import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getPublicationsDir, READIUM_SERVER_URL } from "@/next-lib/userData/publicationsConfig";
import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { CURRENT_USER_ID, getPositionFilePath } from "@/next-lib/userData/paths";

export const runtime = "nodejs";

// This API route reads the publications directory and returns a list of books with their metadata so they can be added to the library view dynamically. It fetches the manifest for each publication to extract the title, author, and cover image. If the manifest cannot be fetched or does not contain the necessary metadata, it falls back to using the filename as the title and a generic cover image.

// If connecting to thorium from anything besiges localhost, you will need to change READIUM_SERVER_URL to the URL of your Readium Web Publication Server (the book folder itself is configurable from the Settings panel). It will most likely need to be proxyed to https as well.

// CLAUDE-ADDED: In-memory manifest cache, keyed by filename. Module-scope state survives across requests in the same server process, so revisiting the homepage doesn't re-hit the Readium server (and re-parse the EPUB) for books we've already resolved. Each entry is stamped with the file's mtime so an edited/replaced file is transparently re-fetched.
type Series = { name: string; position?: number };
// CLAUDE-ADDED: Surfaces the same metadata calibre's own book-detail page shows (see the book detail
// panel in calibre-web) -- everything here comes straight out of manifest.metadata except fileSize,
// which is a filesystem stat since EPUB byte size was never part of the manifest to begin with.
type CachedBook = {
  title: string;
  author: string;
  cover: string;
  series: Series | null;
  description: string | null;
  publisher: string | null;
  published: string | null;
  modified: string | null;
  language: string | null;
  tags: string[];
  isbn: string | null;
  calibreId: string | null;
  uuid: string | null;
  fileSize: string | null;
};
const manifestCache = new Map<string, { mtimeMs: number; data: CachedBook }>();

// CLAUDE-ADDED: fetch() has no built-in timeout, so a Readium server that's slow or hung on one file would previously stall the whole Promise.all response forever. This caps how long we wait per-book before falling back to the default title/cover.
const MANIFEST_FETCH_TIMEOUT_MS = 5000;

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// CLAUDE-ADDED: A Contributor's "name" can itself be a plain string or a localized-string map (e.g. { "en": "Herman Melville" }); this picks a displayable string out of either.
function extractName(name: unknown): string {
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const first = Object.values(name as Record<string, unknown>)[0];
    if (typeof first === "string") return first;
  }
  return "";
}

// CLAUDE-ADDED: manifest.metadata.author can be a string, a single Contributor object, or an array of either (Readium Web Publication Manifest spec) — the previous code only handled the first two, so array-form authors (the common case) always came back empty.
function collectAuthorNames(author: unknown): string[] {
  if (!author) return [];
  if (typeof author === "string") return [author];
  if (Array.isArray(author)) return author.flatMap(collectAuthorNames);
  if (typeof author === "object") {
    const name = extractName((author as { name?: unknown }).name);
    return name ? [name] : [];
  }
  return [];
}

// CLAUDE-ADDED: Some manifests (e.g. calibre-exported ones) list the same contributor multiple times under slightly different casing/sortAs — dedupe case-insensitively, keeping the first-seen casing, so the card doesn't show "You Shiina, quof, ..., You Shiina, Quof, ...".
function extractAuthor(author: unknown): string {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const name of collectAuthorNames(author)) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }

  return unique.join(", ");
}

// CLAUDE-ADDED: The position file is rewritten every time the reader saves reading progress, so its
// mtime doubles as a de facto "last read" timestamp -- there's no dedicated field for this anywhere
// else in UserData. Returns null for a book that's never been opened (no position file yet).
function getLastReadAt(manifestUrl: string): number | null {
  try {
    const bookHash = resolveBookIdentity(manifestUrl);
    const positionPath = getPositionFilePath(CURRENT_USER_ID, bookHash);
    return fs.statSync(positionPath).mtimeMs;
  } catch {
    return null;
  }
}

// CLAUDE-ADDED: manifest.metadata.belongsTo.series is a Readium webpub Contributor-shaped value —
// per spec it can be a single object or an array (mirrors how author is handled above); "name" can
// itself be a plain string or a localized-string map. Only the first series entry is used since a
// book belonging to multiple series is rare and the "last series read" shelf only needs one.
function extractSeries(belongsTo: any): Series | null {
  const series = belongsTo?.series;
  if (!series) return null;

  const entry = Array.isArray(series) ? series[0] : series;
  if (!entry) return null;

  const name = typeof entry === "string" ? entry : extractName(entry.name);
  if (!name) return null;

  const position = typeof entry?.position === "number" ? entry.position : undefined;
  return { name, position };
}

// CLAUDE-ADDED: manifest.metadata.subject is either an array of plain strings or an array of
// Subject objects ({ name }) per the Readium Web Publication Manifest spec -- mirrors the
// string-or-object handling extractAuthor/extractSeries already do for their own fields.
function extractSubjects(subject: unknown): string[] {
  if (!subject) return [];
  const list = Array.isArray(subject) ? subject : [subject];
  return list
    .map((entry) => (typeof entry === "string" ? entry : extractName((entry as { name?: unknown })?.name)))
    .filter((name): name is string => !!name);
}

// CLAUDE-ADDED: manifest.metadata.language can be a single BCP-47 tag or an array of them; only the
// first is shown (a book's detail panel needs one language label, not a full list). Intl.DisplayNames
// turns "en" into "English" the same way calibre's own UI shows a language name rather than a code.
function extractLanguage(language: unknown): string | null {
  const tag = Array.isArray(language) ? language[0] : language;
  if (typeof tag !== "string" || !tag) return null;

  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

// CLAUDE-ADDED: calibre-exported manifests stash calibre's own database id, the book's UUID, and
// alternate identifier schemes (ISBN, Hardcover, Goodreads, etc.) in metadata.altIdentifier as
// "scheme:value" strings -- there's no dedicated field for any of these in the RWPM spec itself,
// this is calibre's own convention. Only ISBN is surfaced as a chip for now (the identifiers calibre
// shows as clickable badges, like "Hardcover", are external lookup links we have no destination for
// here without also carrying calibre's own URL templates).
function extractAltIdentifiers(altIdentifier: unknown): { isbn: string | null; calibreId: string | null; uuid: string | null } {
  const result = { isbn: null as string | null, calibreId: null as string | null, uuid: null as string | null };
  if (!Array.isArray(altIdentifier)) return result;

  for (const entry of altIdentifier) {
    if (typeof entry !== "string") continue;
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) continue;

    const scheme = entry.slice(0, separatorIndex);
    const value = entry.slice(separatorIndex + 1);
    if (scheme === "isbn") result.isbn = value;
    else if (scheme === "calibre") result.calibreId = value;
    else if (scheme === "uuid") result.uuid = value;
  }

  return result;
}

// CLAUDE-ADDED: manifest.metadata.description carries through the EPUB's raw (calibre-generated)
// HTML unchanged -- rendering that directly would mean dangerouslySetInnerHTML on markup that
// ultimately comes from whatever wrote the EPUB file, an XSS risk for a self-hosted library reading
// arbitrary files. This strips it down to plain text instead of pulling in an HTML sanitizer
// dependency for what's normally just a handful of <p>/<br> tags; paragraph breaks are preserved as
// blank lines before the strip so multi-paragraph descriptions don't run together into one block.
function extractDescription(description: unknown): string | null {
  if (typeof description !== "string" || !description) return null;

  const withBreaks = description
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");

  // Decode the handful of entities calibre/epub descriptions actually use.
  const decoded = stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return decoded.replace(/\n{3,}/g, "\n\n").trim() || null;
}

// CLAUDE-ADDED: Matches calibre's own "31.4 MiB" style (binary units, one decimal place) rather than
// decimal MB, since that's the format shown in the reference calibre-web detail panel this is meant
// to mirror.
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function findCoverHref(manifest: any): string | null {
  const collections = [manifest.resources, manifest.readingOrder];

  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;

    for (const link of collection) {
      const rel = link.rel;
      const isCover = rel === "cover" || (Array.isArray(rel) && rel.includes("cover"));
      if (isCover && link.href) {
        return link.href;
      }
    }
  }

  return null;
}

export async function GET() {
  try {
    const publicationsDir = getPublicationsDir();
    const files = fs.readdirSync(publicationsDir);
    const supportedExtensions = [".epub", ".pdf", ".cbz"];

    const epubFiles = files.filter((file) =>
      supportedExtensions.includes(path.extname(file).toLowerCase())
    );

    // CLAUDE-ADDED: Promise.allSettled (rather than Promise.all) so that a book whose per-file processing throws outside the inner try/catch (e.g. a stat() failure) can't take down the whole response — it just falls back below instead of rejecting the entire batch.
    const results = await Promise.allSettled(
      epubFiles.map(async (file) => {
        const encodedFilename = base64UrlEncode(file);
        const manifestUrl = `${READIUM_SERVER_URL}/webpub/${encodedFilename}/manifest.json`;
        const encodedManifestUrl = encodeURIComponent(manifestUrl);
        const fallbackTitle = path.parse(file).name;

        let title = fallbackTitle;
        let author = "";
        let cover = "/images/genericCover.png";
        let series: Series | null = null;
        let description: string | null = null;
        let publisher: string | null = null;
        let published: string | null = null;
        let modified: string | null = null;
        let language: string | null = null;
        let tags: string[] = [];
        let isbn: string | null = null;
        let calibreId: string | null = null;
        let uuid: string | null = null;
        // CLAUDE-ADDED: Not manifest data (no filesystem info makes it into a Readium manifest) --
        // this is the one field here that comes from stat() instead, to match calibre's own
        // "File sizes" field on the book detail page this is otherwise mirroring.
        let fileSize: string | null = null;

        // CLAUDE-ADDED: Check the manifest cache before hitting the Readium server. Keyed by filename + mtime, so a cache hit only happens if the file on disk hasn't changed since we last resolved it.
        const stat = fs.statSync(path.join(publicationsDir, file));
        fileSize = formatFileSize(stat.size);
        const cached = manifestCache.get(file);
        if (cached && cached.mtimeMs === stat.mtimeMs) {
          title = cached.data.title;
          author = cached.data.author;
          cover = cached.data.cover;
          series = cached.data.series;
          description = cached.data.description;
          publisher = cached.data.publisher;
          published = cached.data.published;
          modified = cached.data.modified;
          language = cached.data.language;
          tags = cached.data.tags;
          isbn = cached.data.isbn;
          calibreId = cached.data.calibreId;
          uuid = cached.data.uuid;
          // fileSize is recomputed above from the current stat rather than read from cache -- it's
          // the one field that isn't gated by the manifest's own mtime-keyed cache validity.
        } else {
          try {
            // CLAUDE-ADDED: AbortSignal.timeout() aborts the request if the Readium server hasn't responded in time, instead of hanging indefinitely.
            const manifestRes = await fetch(manifestUrl, {
              signal: AbortSignal.timeout(MANIFEST_FETCH_TIMEOUT_MS),
            });
            if (manifestRes.ok) {
              const manifest = await manifestRes.json();

              if (manifest.metadata?.title) {
                title = manifest.metadata.title;
              }

              if (manifest.metadata?.author) {
                author = extractAuthor(manifest.metadata.author);
              }

              series = extractSeries(manifest.metadata?.belongsTo);
              description = extractDescription(manifest.metadata?.description);
              // publisher is Contributor-shaped per the RWPM spec, same as author -- reuse that
              // extraction rather than assuming it's always a plain string.
              publisher = manifest.metadata?.publisher ? extractAuthor(manifest.metadata.publisher) || null : null;
              published = typeof manifest.metadata?.published === "string" ? manifest.metadata.published : null;
              modified = typeof manifest.metadata?.modified === "string" ? manifest.metadata.modified : null;
              language = extractLanguage(manifest.metadata?.language);
              tags = extractSubjects(manifest.metadata?.subject);
              ({ isbn, calibreId, uuid } = extractAltIdentifiers(manifest.metadata?.altIdentifier));

              const coverHref = findCoverHref(manifest);
              if (coverHref) {
                // Resolve relative hrefs against the manifest's own URL
                cover = new URL(coverHref, manifestUrl).toString();
              }

              // CLAUDE-ADDED: Populate the cache so the next request for this file (same mtime) skips the Readium server round-trip entirely.
              manifestCache.set(file, {
                mtimeMs: stat.mtimeMs,
                data: { title, author, cover, series, description, publisher, published, modified, language, tags, isbn, calibreId, uuid, fileSize }
              });
            }
          } catch (err) {
            console.error(`Could not fetch manifest for ${file}:`, err);
          }
        }

        return {
          title,
          author,
          cover,
          url: `/read/manifest/${encodedManifestUrl}`,
          // CLAUDE-ADDED: birthtime isn't supported on every filesystem (some report 0 or fall back to
          // ctime); mtime is always populated, so it's the safety net for "date added".
          addedAt: stat.birthtimeMs || stat.mtimeMs,
          lastReadAt: getLastReadAt(manifestUrl),
          series,
          description,
          publisher,
          published,
          modified,
          language,
          tags,
          isbn,
          calibreId,
          uuid,
          fileSize
        };
      })
    );

    // CLAUDE-ADDED: Unwrap allSettled results, substituting a minimal fallback entry for any book whose promise actually rejected.
    const books = results.map((result, i) => {
      if (result.status === "fulfilled") return result.value;

      const file = epubFiles[i];
      console.error(`Failed to process ${file}:`, result.reason);

      // CLAUDE-ADDED: Best-effort stat/identity for the fallback entry too, so a book that failed
      // manifest resolution still sorts sensibly into the recently-added/recently-read shelves
      // instead of silently dropping out of them.
      let addedAt = Date.now();
      let lastReadAt: number | null = null;
      try {
        addedAt = fs.statSync(path.join(publicationsDir, file)).mtimeMs;
        const manifestUrl = `${READIUM_SERVER_URL}/webpub/${base64UrlEncode(file)}/manifest.json`;
        lastReadAt = getLastReadAt(manifestUrl);
      } catch {
        // Keep the defaults above.
      }

      return {
        title: path.parse(file).name,
        author: "",
        cover: "/images/genericCover.png",
        url: `/read/manifest/${encodeURIComponent(`${READIUM_SERVER_URL}/webpub/${base64UrlEncode(file)}/manifest.json`)}`,
        rendition: "Reflowable EPUB",
        addedAt,
        lastReadAt,
        series: null,
        description: null,
        publisher: null,
        published: null,
        modified: null,
        language: null,
        tags: [],
        isbn: null,
        calibreId: null,
        uuid: null,
        fileSize: null
      };
    });

    return NextResponse.json({ books });
  } catch (error) {
    console.error("Error reading publications directory:", error);
    return NextResponse.json({ books: [], error: "Failed to read directory" }, { status: 500 });
  }
}