import { PUBLICATION_MANIFESTS } from "@/config/publications";
import { fetchPositionFromServer } from "@/lib/userData/positionApi";

// CLAUDE-ADDED: Mirrors the /read/manifest/[manifest] and /read/[identifier] routes' own resolution logic (see usePublication.ts's selfHref and page.tsx's PUBLICATION_MANIFESTS lookup) so this reconstructs the exact manifest URL the reader uses to key its saved position. Exported (not just used internally below) so other callers keyed by manifestUrl -- e.g. StatefulBookSheet's reading-timer fetches -- can resolve it from a Publication's own url without duplicating this logic.
export function getManifestUrlFromBookUrl(bookUrl: string): string | null {
  const manifestMatch = bookUrl.match(/^\/read\/manifest\/(.+)$/);
  if (manifestMatch) {
    try {
      return decodeURIComponent(manifestMatch[1]);
    } catch {
      return null;
    }
  }

  const identifierMatch = bookUrl.match(/^\/read\/([^/]+)$/);
  if (identifierMatch) {
    const identifier = identifierMatch[1];
    return PUBLICATION_MANIFESTS[identifier as keyof typeof PUBLICATION_MANIFESTS] ?? identifier;
  }

  return null;
}

// CLAUDE-ADDED: Reads the Locator the reader last saved server-side (see useServerPosition.ts /
// positionApi.ts -- positions moved off localStorage) and returns its overall progress as a
// percentage rounded to one decimal place, or null if the book has never been opened.
export async function getBookProgressPercent(bookUrl: string): Promise<number | null> {
  const manifestUrl = getManifestUrlFromBookUrl(bookUrl);
  if (!manifestUrl) return null;

  const locator = await fetchPositionFromServer(manifestUrl);
  const totalProgression = locator?.locations.totalProgression;
  if (typeof totalProgression !== "number") return null;

  return Math.round(Math.min(1, Math.max(0, totalProgression)) * 1000) / 10;
}
