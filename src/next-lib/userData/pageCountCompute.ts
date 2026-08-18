// CLAUDE-ADDED: Server-side counterpart to what used to be a reader-only computation (a hook that
// only ran once a book was actually opened, walking the live Publication's reading order with
// readAsXML). This computes the same thing without ever needing a live Publication or an opened
// reader -- it fetches the manifest and every reading-order resource straight from the Readium
// server (the same one api/books/route.ts already talks to for calibre metadata) and strips markup
// with a regex tag-stripper, the same approach api/books/route.ts's extractDescription already uses
// for calibre's HTML descriptions -- no XML/HTML parser dependency needed just to count characters.

// CLAUDE-ADDED: The API route caches computed page counts to disk keyed by book hash + this version
// number, not by book hash alone -- bump this whenever computePageCountForManifest's algorithm
// changes so every previously-cached value (computed under the old, possibly-wrong logic) is treated
// as a miss and recomputed, instead of serving a stale result forever. (Bumped for the CBZ/Divina
// image-count fix below -- a cache entry from before that fix would otherwise keep serving the
// character-count-of-binary-image-bytes result even after the code itself was corrected.)
export const PAGE_COUNT_ALGORITHM_VERSION = 2;

const RESOURCE_FETCH_TIMEOUT_MS = 5000;

// CLAUDE-ADDED: One page is the original Thorium Reader's own estimate -- see readium-desktop's
// pageBreakBuilder, which defines a page as 1024 characters of extracted text.
const PAGE_LENGTH = 1024;

function stripTags(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const withoutNonVisible = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const stripped = withoutNonVisible.replace(/<[^>]+>/g, "");

  // Decode the handful of entities prose resources actually use -- same set extractDescription
  // already decodes in api/books/route.ts.
  return stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// CLAUDE-ADDED: Works for any reachable manifest URL, local or remote -- unlike resolveBookIdentity's
// hash (which only reads local file bytes, falling back to hashing the URL string otherwise), this
// just fetches over HTTP, so it doesn't care where the publication is actually hosted.
export async function computePageCountForManifest(manifestUrl: string): Promise<number> {
  const manifestRes = await fetch(manifestUrl, { signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
  if (!manifestRes.ok) return 0;

  const manifest = await manifestRes.json();
  const readingOrder: { href?: string; type?: string }[] = Array.isArray(manifest.readingOrder) ? manifest.readingOrder : [];

  // CLAUDE-ADDED: A CBZ/Divina readingOrder is all page images, not prose -- running them through the
  // text-extraction heuristic below would fetch every full-resolution page over HTTP and count raw
  // (mostly-binary, decoded-as-UTF-8) bytes as "characters", producing a wildly inflated page count
  // (confirmed: a 184-page/138MB manga volume came back as ~61,500 "pages"). One page per image is
  // both correct for a comic and far cheaper than fetching the whole archive's worth of images.
  if (readingOrder.length > 0 && readingOrder.every((link) => link.type?.startsWith("image/"))) {
    return readingOrder.length;
  }

  const counts = await Promise.all(
    readingOrder.map(async (link) => {
      if (!link.href) return 0;

      try {
        const resourceUrl = new URL(link.href, manifestUrl).toString();
        const res = await fetch(resourceUrl, { signal: AbortSignal.timeout(RESOURCE_FETCH_TIMEOUT_MS) });
        if (!res.ok) return 0;

        const text = await res.text();
        return stripTags(text).length;
      } catch {
        // CLAUDE-ADDED: A single unreadable resource shouldn't abort the whole scan -- same
        // best-effort fallback the old client-side hook had.
        return 0;
      }
    })
  );

  const totalCharacters = counts.reduce((sum, count) => sum + count, 0);
  return totalCharacters > 0 ? Math.ceil(totalCharacters / PAGE_LENGTH) : 0;
}
