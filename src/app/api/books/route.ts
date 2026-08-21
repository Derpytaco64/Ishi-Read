import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { parseFile } from "music-metadata";
import { extractCBZMetadata } from "@/next-lib/comicInfo";
import { getPublicationsDir, getReadiumServerUrl } from "@/next-lib/userData/publicationsConfig";
import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { recordBookTitles } from "@/next-lib/userData/bookTitles";
import { getPositionFilePath } from "@/next-lib/userData/paths";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// This API route reads the publications directory and returns a list of books with their metadata so they can be added to the library view dynamically. It fetches the manifest for each publication to extract the title, author, and cover image. If the manifest cannot be fetched or does not contain the necessary metadata, it falls back to using the filename as the title and a generic cover image.

// If connecting to thorium from anything besides localhost, you will need to change the Readium URL (now configurable from the Settings panel, same as the book folder) to the URL of your Readium Web Publication Server. It will most likely need to be proxied to https as well.

// CLAUDE-ADDED: In-memory manifest cache, keyed by filename. Module-scope state survives across requests in the same server process, so revisiting the homepage doesn't re-hit the Readium server (and re-parse the EPUB) for books we've already resolved. Each entry is stamped with a content fingerprint (not mtime) so a file replaced at the same path is transparently re-fetched even if the replacement happens to land on the same mtime (e.g. `cp -p`, or a filesystem with coarse mtime resolution) -- that mtime collision previously let a stale/broken cover survive a file swap.
type Series = { name: string; position?: number };
// CLAUDE-ADDED: Surfaces the same metadata calibre's own book-detail page shows (see the book detail
// panel in calibre-web) -- everything here comes straight out of manifest.metadata except fileSize,
// which is a filesystem stat since EPUB byte size was never part of the manifest to begin with.
type CachedBook = {
  title: string;
  subtitle: string | null;
  author: string;
  narrators: string[];
  cover: string;
  series: Series | null;
  description: string | null;
  publisher: string | null;
  published: string | null;
  modified: string | null;
  language: string | null;
  tags: string[];
  isbn: string | null;
  asin: string | null;
  calibreId: string | null;
  uuid: string | null;
  fileSize: string | null;
  duration: number | null;
};
const manifestCache = new Map<string, { fingerprint: string; data: CachedBook }>();

// CLAUDE-ADDED: fetch() has no built-in timeout, so a Readium server that's slow or hung on one file would previously stall the whole Promise.all response forever. This caps how long we wait per-book before falling back to the default title/cover.
const MANIFEST_FETCH_TIMEOUT_MS = 5000;

// CLAUDE-ADDED: Firing one manifest fetch per book with no concurrency limit meant a large library
// (especially one with deeply nested multi-volume folders) sent every request to the readium
// server at once -- observed in production as manifest fetches timing out under the resulting
// load. Capping how many are in flight at a time keeps the server from being hammered on every
// library load.
const MANIFEST_FETCH_CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// CLAUDE-ADDED: Cheap stand-in for hashing the whole file -- books (especially .m4b audiobooks)
// can be hundreds of MB, and this fingerprint gets recomputed on every books-list request (even
// on cache hits) to actually catch content changes, so a full read would defeat the point of
// caching. Sampling the head, tail, and size is enough to distinguish "same file" from "a
// different file swapped into this path" for the archive/container formats we support (EPUB/CBZ
// are zips, PDF has header/xref-table structure, M4B has MP4 box headers) without reading the
// whole thing.
const FINGERPRINT_SAMPLE_BYTES = 65536;

function computeContentFingerprint(filePath: string, size: number): string {
  const hash = crypto.createHash("sha1");
  const fd = fs.openSync(filePath, "r");
  try {
    const headSize = Math.min(FINGERPRINT_SAMPLE_BYTES, size);
    if (headSize > 0) {
      const headBuf = Buffer.alloc(headSize);
      fs.readSync(fd, headBuf, 0, headSize, 0);
      hash.update(headBuf);
    }

    if (size > FINGERPRINT_SAMPLE_BYTES) {
      const tailSize = Math.min(FINGERPRINT_SAMPLE_BYTES, size);
      const tailBuf = Buffer.alloc(tailSize);
      fs.readSync(fd, tailBuf, 0, tailSize, size - tailSize);
      hash.update(tailBuf);
    }
  } finally {
    fs.closeSync(fd);
  }
  hash.update(String(size));
  return hash.digest("hex");
}

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
function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }

  return unique;
}

function extractAuthor(author: unknown): string {
  return dedupeNames(collectAuthorNames(author)).join(", ");
}

// CLAUDE-ADDED: manifest.metadata.narrator is Contributor-shaped per the RWPM spec, same as author —
// reuses the same string-or-object-or-array handling and dedup, just kept as a list instead of a
// joined string since the detail panel renders narrators as individual chips.
function extractNarrators(narrator: unknown): string[] {
  return dedupeNames(collectAuthorNames(narrator));
}

// CLAUDE-ADDED: The position file is rewritten every time the reader saves reading progress, so its
// mtime doubles as a de facto "last read" timestamp -- there's no dedicated field for this anywhere
// else in UserData. Returns null for a book that's never been opened (no position file yet).
function getLastReadAt(userId: string, manifestUrl: string): number | null {
  try {
    const bookHash = resolveBookIdentity(manifestUrl);
    const positionPath = getPositionFilePath(userId, bookHash);
    return fs.statSync(positionPath).mtimeMs;
  } catch {
    return null;
  }
}

// CLAUDE-ADDED: manifest.metadata.belongsTo.series is a Readium webpub Contributor-shaped value —
// per spec it can be a single object or an array (mirrors how author is handled above); "name" can
// itself be a plain string or a localized-string map. Only the first series entry is used since a
// book belonging to multiple series is rare and the "last series read" shelf only needs one.
//
// calibre never writes the EPUB3 belongs-to-collection property it'd take to populate belongsTo.series
// -- it always stamps its own calibre:series/calibre:series_index OPF meta instead (confirmed against
// the bundled Readium binary directly: feeding it a calibre-tagged EPUB2 surfaces the series name as a
// flat "https://calibre-ebook.com#series" metadata key, not under belongsTo at all). So this falls back
// to that raw namespaced key when belongsTo.series is absent.
function extractSeries(metadata: any): Series | null {
  const series = metadata?.belongsTo?.series;
  const entry = Array.isArray(series) ? series[0] : series;
  if (entry) {
    const name = typeof entry === "string" ? entry : extractName(entry.name);
    const position = typeof entry?.position === "number" ? entry.position : undefined;
    if (name) return { name, position };
  }

  const calibreSeries = metadata?.["https://calibre-ebook.com#series"];
  if (typeof calibreSeries === "string" && calibreSeries.trim()) {
    const rawIndex = metadata?.["https://calibre-ebook.com#series_index"];
    const position = typeof rawIndex === "string" ? Number(rawIndex) : typeof rawIndex === "number" ? rawIndex : NaN;
    return { name: calibreSeries.trim(), position: Number.isFinite(position) ? position : undefined };
  }

  return null;
}

// CLAUDE-ADDED: EPUB series positions come from Calibre's series_index, which Calibre itself
// auto-increments -- always present, always distinct. CBZ/manga series positions come from
// ComicInfo.xml's <Volume>/<Number> tags instead (see extractCBZMetadata), which scanlation/
// tagging tools frequently leave missing, or set to the same value (e.g. Number=1) on every
// volume. Android's Home screen sorts each series group by position and special-cases index 0/
// lastIndex to stick the shelf to an edge instead of centering -- with duplicate/missing
// positions, the stable sort falls back to arrival order (this directory's own unsorted
// fs.readdirSync enumeration), so that special case doesn't land on the true first/last volume.
// This repairs any series group whose positions aren't fully defined and distinct by
// renumbering it 1..N in natural (numeric-aware) filename order, which matches true volume order
// for the vast majority of consistently-named manga libraries. Groups that already have usable
// positions (virtually all EPUB/Calibre series) are left untouched.
function repairSeriesPositions(books: { series: Series | null; isAudiobook: boolean }[], files: string[]): void {
  const groups = new Map<string, number[]>();
  books.forEach((book, i) => {
    if (!book.series) return;
    const key = `${book.series.name}|${book.isAudiobook}`;
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  });

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const positions = indices.map((i) => books[i].series!.position);
    const usable =
      positions.every((p) => typeof p === "number" && Number.isFinite(p)) &&
      new Set(positions).size === positions.length;
    if (usable) continue;

    const sorted = [...indices].sort((a, b) =>
      files[a].localeCompare(files[b], undefined, { numeric: true, sensitivity: "base" })
    );
    sorted.forEach((i, order) => {
      books[i] = { ...books[i], series: { name: books[i].series!.name, position: order + 1 } };
    });
  }
}

// CLAUDE-ADDED: Everything below is read directly off the M4B file's own MP4 tags via music-metadata,
// rather than through Readium's manifest -- confirmed against the bundled Go server (v0.15.1), its
// M4B parser only surfaces title/author/description/duration/chapters, none of the calibre-style
// fields (series, narrators, subtitle, ASIN, genre, publisher, language, year) audiobook tools embed
// in the file itself. One parseFile call covers all of them instead of one per field.
type AudiobookFileMetadata = {
  series: Series | null;
  narrators: string[];
  subtitle: string | null;
  asin: string | null;
  tags: string[];
  publisher: string | null;
  language: string | null;
  published: string | null;
};

const EMPTY_AUDIOBOOK_METADATA: AudiobookFileMetadata = {
  series: null, narrators: [], subtitle: null, asin: null, tags: [], publisher: null, language: null, published: null
};

// CLAUDE-ADDED: M4B has no dedicated subtitle atom either (only the freeform "----:com.apple.iTunes:
// SUBTITLE", which most audiobook rips don't set) -- verified against a real Audible-sourced M4B
// (Dungeon Crawler Carl) that instead puts the full "Title: Subtitle" text in the Album tag while
// Title itself stays bare ("Dungeon Crawler Carl" vs. album "Dungeon Crawler Carl: A LitRPG/Gamelit
// Adventure"). Strips the redundant title prefix so the subtitle chip doesn't repeat what's already
// shown as the book's title; returns null when there's nothing beyond the title to show.
function deriveSubtitleFromAlbum(album: string | undefined, title: string): string | null {
  const trimmedAlbum = album?.trim();
  if (!trimmedAlbum) return null;
  const trimmedTitle = title.trim();
  if (trimmedAlbum.toLowerCase() === trimmedTitle.toLowerCase()) return null;

  const prefix = `${trimmedTitle}:`;
  if (trimmedAlbum.toLowerCase().startsWith(prefix.toLowerCase())) {
    return trimmedAlbum.slice(prefix.length).trim() || null;
  }
  return trimmedAlbum;
}

async function extractAudiobookMetadata(filePath: string, title: string): Promise<AudiobookFileMetadata> {
  try {
    const { common } = await parseFile(filePath, { duration: false, skipCovers: true });

    // CLAUDE-ADDED: MP4/M4B has no dedicated series atom -- Audiobookshelf/Plex/etc. convention is to
    // stash "Series Name #N" or "Series Name, Book N" in the "grouping" (©grp) tag. Falls back to the
    // file's own track number for position when the grouping text has no embedded number (still
    // labeled a series, just unordered within it).
    let series: Series | null = null;
    const grouping = common.grouping?.trim();
    if (grouping) {
      const match = grouping.match(/^(.*?),?\s*(?:#|Book\s+)(\d+(?:\.\d+)?)\s*$/i);
      if (match && match[1].trim()) {
        series = { name: match[1].trim(), position: Number(match[2]) };
      } else {
        const trackNo = common.track?.no;
        series = { name: grouping, position: typeof trackNo === "number" ? trackNo : undefined };
      }
    }

    // CLAUDE-ADDED: MP4 also has no dedicated narrator atom -- the established audiobook-tagging
    // convention (m4b-tool, Audiobookshelf, AAXtoMP3, and Apple/iTunes' own audiobook handling, which
    // labels this field "Narrated by" in its UI) is to store narrator names in the Composer tag.
    const narrators = common.composer ?? [];

    // CLAUDE-ADDED: Verified against a real Audible-sourced M4B (Dungeon Crawler Carl) -- its ©gen
    // atom holds one string of multiple genres joined with "; " ("Literature & Fiction; Mystery,
    // Thriller & Suspense; Science Fiction & Fantasy"), not one atom instance per genre. Splitting
    // keeps them as separate chips instead of one run-on pill; flatMap also handles the case where a
    // tagger *did* write separate instances (multiple already-split array entries).
    const tags = (common.genre ?? []).flatMap((entry) => entry.split(";").map((g) => g.trim()).filter(Boolean));

    return {
      series,
      narrators,
      subtitle: common.subtitle?.[0] ?? deriveSubtitleFromAlbum(common.album, title),
      asin: common.asin ?? null,
      tags,
      // CLAUDE-ADDED: No dedicated publisher atom either -- falls back to the copyright tag (©cpy/
      // cprt) when there's no explicit label, since Audible-sourced files (that same Dungeon Crawler
      // Carl file) put the actual publisher/production company there ("Audible Studios") instead.
      publisher: common.label?.[0] ?? common.copyright ?? null,
      language: common.language ?? null,
      published: common.year ? String(common.year) : common.date ?? null
    };
  } catch (err) {
    console.error(`Could not read audiobook tags for ${filePath}:`, err);
    return EMPTY_AUDIOBOOK_METADATA;
  }
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
function extractAltIdentifiers(altIdentifier: unknown): { isbn: string | null; asin: string | null; calibreId: string | null; uuid: string | null } {
  const result = { isbn: null as string | null, asin: null as string | null, calibreId: null as string | null, uuid: null as string | null };
  if (!Array.isArray(altIdentifier)) return result;

  for (const entry of altIdentifier) {
    if (typeof entry !== "string") continue;
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex === -1) continue;

    const scheme = entry.slice(0, separatorIndex);
    const value = entry.slice(separatorIndex + 1);
    if (scheme === "isbn") result.isbn = value;
    else if (scheme === "asin") result.asin = value;
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
  // CLAUDE-ADDED: Audiobook (M4B) manifests from the Readium server have no `resources` array --
  // the cover link lives directly on the top-level `links` array instead, so it has to be checked
  // too or every audiobook falls back to the generic cover.
  const collections = [manifest.resources, manifest.readingOrder, manifest.links];

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
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const publicationsDir = getPublicationsDir();
    const readiumServerUrl = getReadiumServerUrl();
    // recursive readdirSync returns paths relative to publicationsDir (e.g.
    // "Series/Book 1.epub"), directories included -- isFile() below drops the directory entries
    // themselves. The Readium server already resolves these relative paths fine (confirmed against
    // the bundled binary): its base64url-encoded manifest URL segment is the whole relative path,
    // slashes and all, so nothing downstream (base64UrlEncode, path.join for stat, etc.) needs to
    // change to support subfolders.
    const files = fs.readdirSync(publicationsDir, { recursive: true }) as string[];
    const supportedExtensions = [".epub", ".pdf", ".cbz", ".m4b"];

    const epubFiles = files.filter((file) =>
      supportedExtensions.includes(path.extname(file).toLowerCase()) &&
      fs.statSync(path.join(publicationsDir, file)).isFile()
    );

    // CLAUDE-ADDED: Collected below as each book resolves, then flushed to bookTitles.ts's registry
    // in one batched write after the whole request is done -- see recordBookTitles at the bottom of
    // this handler for why that's a single call rather than one per book.
    const titleEntries: { hash: string; title: string; manifestUrl: string }[] = [];

    // CLAUDE-ADDED: mapWithConcurrency (rather than Promise.allSettled(epubFiles.map(...))) both
    // bounds how many books are resolved at once (see MANIFEST_FETCH_CONCURRENCY above) and keeps
    // the same allSettled-style guarantee -- a book whose per-file processing throws outside the
    // inner try/catch (e.g. a stat() failure) can't take down the whole response, it just falls
    // back below instead of rejecting the entire batch.
    const results = await mapWithConcurrency(
      epubFiles,
      MANIFEST_FETCH_CONCURRENCY,
      async (file) => {
        const encodedFilename = base64UrlEncode(file);
        const manifestUrl = `${readiumServerUrl}/webpub/${encodedFilename}/manifest.json`;
        const encodedManifestUrl = encodeURIComponent(manifestUrl);
        const fallbackTitle = path.parse(file).name;
        // CLAUDE-ADDED: Drives the homepage's Books/Audiobooks tab split -- the manifest itself
        // doesn't carry a stable "is this an audiobook" flag callers can filter on, but the file
        // extension already does (only .m4b is audio among supportedExtensions).
        const isAudiobook = path.extname(file).toLowerCase() === ".m4b";
        // CLAUDE-ADDED: Same rationale as isAudiobook -- drives the ComicInfo.xml fallback below and
        // the "Comic" rendition badge, since the manifest alone can't tell CBZ apart from any other
        // webpub.
        const isCBZ = path.extname(file).toLowerCase() === ".cbz";

        let title = fallbackTitle;
        let subtitle: string | null = null;
        let author = "";
        let narrators: string[] = [];
        let cover = "/images/genericCover.png";
        let series: Series | null = null;
        let description: string | null = null;
        let publisher: string | null = null;
        let published: string | null = null;
        let modified: string | null = null;
        let language: string | null = null;
        let tags: string[] = [];
        let isbn: string | null = null;
        let asin: string | null = null;
        let calibreId: string | null = null;
        let uuid: string | null = null;
        // CLAUDE-ADDED: Not manifest data (no filesystem info makes it into a Readium manifest) --
        // this is the one field here that comes from stat() instead, to match calibre's own
        // "File sizes" field on the book detail page this is otherwise mirroring.
        let fileSize: string | null = null;
        // CLAUDE-ADDED: RWPM's metadata.duration (seconds) -- the one M4B field the Go server does
        // surface (see extractAudiobookMetadata's comment), so this comes straight off the manifest
        // rather than needing a file-tag fallback.
        let duration: number | null = null;

        // CLAUDE-ADDED: Check the manifest cache before hitting the Readium server. Keyed by filename +
        // content fingerprint, so a cache hit only happens if the file's actual content (not just its
        // mtime, which a copy/restore can coincidentally preserve or collide on) matches what we last resolved.
        const filePath = path.join(publicationsDir, file);
        const stat = fs.statSync(filePath);
        fileSize = formatFileSize(stat.size);
        const fingerprint = computeContentFingerprint(filePath, stat.size);
        const cached = manifestCache.get(file);
        if (cached && cached.fingerprint === fingerprint) {
          title = cached.data.title;
          subtitle = cached.data.subtitle;
          author = cached.data.author;
          narrators = cached.data.narrators;
          cover = cached.data.cover;
          series = cached.data.series;
          description = cached.data.description;
          publisher = cached.data.publisher;
          published = cached.data.published;
          modified = cached.data.modified;
          language = cached.data.language;
          tags = cached.data.tags;
          isbn = cached.data.isbn;
          asin = cached.data.asin;
          calibreId = cached.data.calibreId;
          uuid = cached.data.uuid;
          duration = cached.data.duration;
          // fileSize is recomputed above from the current stat rather than read from cache -- it's
          // the one field that isn't gated by the manifest's own fingerprint-keyed cache validity.
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
              subtitle = typeof manifest.metadata?.subtitle === "string" ? manifest.metadata.subtitle : null;

              if (manifest.metadata?.author) {
                author = extractAuthor(manifest.metadata.author);
              }
              narrators = manifest.metadata?.narrator ? extractNarrators(manifest.metadata.narrator) : [];

              series = extractSeries(manifest.metadata);
              description = extractDescription(manifest.metadata?.description);
              // publisher is Contributor-shaped per the RWPM spec, same as author -- reuse that
              // extraction rather than assuming it's always a plain string.
              publisher = manifest.metadata?.publisher ? extractAuthor(manifest.metadata.publisher) || null : null;
              published = typeof manifest.metadata?.published === "string" ? manifest.metadata.published : null;
              modified = typeof manifest.metadata?.modified === "string" ? manifest.metadata.modified : null;
              language = extractLanguage(manifest.metadata?.language);
              tags = extractSubjects(manifest.metadata?.subject);
              ({ isbn, asin, calibreId, uuid } = extractAltIdentifiers(manifest.metadata?.altIdentifier));
              duration = typeof manifest.metadata?.duration === "number" ? manifest.metadata.duration : null;

              // CLAUDE-ADDED: The Go server's M4B support doesn't surface any of series/narrators/
              // subtitle/ASIN/genre/publisher/language/year onto the manifest (see
              // extractAudiobookMetadata's comment) -- read them straight off the file's own MP4 tags
              // instead, filling in only what the manifest left empty above.
              if (isAudiobook) {
                const fileMeta = await extractAudiobookMetadata(path.join(publicationsDir, file), title);
                series = fileMeta.series;
                if (narrators.length === 0) narrators = fileMeta.narrators;
                if (subtitle === null) subtitle = fileMeta.subtitle;
                if (asin === null) asin = fileMeta.asin;
                if (tags.length === 0) tags = fileMeta.tags;
                if (publisher === null) publisher = fileMeta.publisher;
                if (language === null) language = fileMeta.language;
                if (published === null) published = fileMeta.published;
              }

              // CLAUDE-ADDED: Mirrors the M4B fallback above -- the bundled Go server's CBZ/Divina
              // parser doesn't read ComicInfo.xml at all, so series/author/genre/publisher/language/
              // description come straight off the file's embedded ComicInfo.xml instead, filling in
              // only what the manifest left empty.
              if (isCBZ) {
                const fileMeta = extractCBZMetadata(filePath);
                // CLAUDE-ADDED: The Go server's CBZ/Divina parser sets manifest.metadata.title to the
                // raw filename, extension included (confirmed against the bundled binary directly) --
                // prefer ComicInfo.xml's own <Title> when present, and otherwise strip a stray ".cbz"
                // off whatever title we ended up with so it never leaks into the UI.
                if (fileMeta.title) title = fileMeta.title;
                else if (title.toLowerCase().endsWith(".cbz")) title = title.slice(0, -4);
                if (series === null) series = fileMeta.series;
                if (!author) author = fileMeta.author;
                if (tags.length === 0) tags = fileMeta.tags;
                if (publisher === null) publisher = fileMeta.publisher;
                if (language === null) language = fileMeta.language;
                if (description === null) description = fileMeta.description;
              }

              const coverHref = findCoverHref(manifest);
              if (coverHref) {
                // Resolve relative hrefs against the manifest's own URL
                cover = new URL(coverHref, manifestUrl).toString();
              }

              // CLAUDE-ADDED: Populate the cache so the next request for this file (same content fingerprint) skips the Readium server round-trip entirely.
              manifestCache.set(file, {
                fingerprint,
                data: { title, subtitle, author, narrators, cover, series, description, publisher, published, modified, language, tags, isbn, asin, calibreId, uuid, fileSize, duration }
              });
            }
          } catch (err) {
            console.error(`Could not fetch manifest for ${file}:`, err);
          }
        }

        titleEntries.push({ hash: resolveBookIdentity(manifestUrl), title, manifestUrl });

        return {
          title,
          subtitle,
          author,
          narrators,
          cover,
          url: `/read/manifest/${encodedManifestUrl}`,
          rendition: isAudiobook ? "Audiobook" : isCBZ ? "Comic" : undefined,
          isAudiobook,
          // CLAUDE-ADDED: birthtime isn't supported on every filesystem (some report 0 or fall back to
          // ctime); mtime is always populated, so it's the safety net for "date added".
          addedAt: stat.birthtimeMs || stat.mtimeMs,
          lastReadAt: getLastReadAt(userId, manifestUrl),
          series,
          description,
          publisher,
          published,
          modified,
          language,
          tags,
          isbn,
          asin,
          calibreId,
          uuid,
          fileSize,
          duration
        };
      }
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
        const manifestUrl = `${readiumServerUrl}/webpub/${base64UrlEncode(file)}/manifest.json`;
        lastReadAt = getLastReadAt(userId, manifestUrl);
        titleEntries.push({ hash: resolveBookIdentity(manifestUrl), title: path.parse(file).name, manifestUrl });
      } catch {
        // Keep the defaults above.
      }

      const isAudiobook = path.extname(file).toLowerCase() === ".m4b";

      return {
        title: path.parse(file).name,
        subtitle: null,
        author: "",
        narrators: [],
        cover: "/images/genericCover.png",
        url: `/read/manifest/${encodeURIComponent(`${readiumServerUrl}/webpub/${base64UrlEncode(file)}/manifest.json`)}`,
        rendition: isAudiobook ? "Audiobook" : "Reflowable EPUB",
        isAudiobook,
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
        asin: null,
        calibreId: null,
        uuid: null,
        fileSize: null,
        duration: null
      };
    });

    repairSeriesPositions(books, epubFiles);

    if (titleEntries.length > 0) recordBookTitles(titleEntries);

    return NextResponse.json({ books });
  } catch (error) {
    console.error("Error reading publications directory:", error);
    return NextResponse.json({ books: [], error: "Failed to read directory" }, { status: 500 });
  }
}

// CLAUDE-ADDED: Manual escape hatch for manifestCache, exposed via the "Refresh Manifest Cache"
// item in the user menu. The content-fingerprint check above already catches a file being
// replaced, but not every stale-cache case -- e.g. the Readium server itself returning an
// incomplete manifest for a moment while a large file is still being written into the book
// folder, which then gets cached under the *finished* file's fingerprint since stat/hash both run
// after the fetch. This lets a user force everything to be re-resolved without restarting the
// server.
export async function DELETE() {
  const clearedCount = manifestCache.size;
  manifestCache.clear();
  return NextResponse.json({ clearedCount });
}