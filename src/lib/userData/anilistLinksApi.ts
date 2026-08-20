// CLAUDE-ADDED: anilistLinks lives in the same freeform library-prefs blob customShelves does (see
// useCustomShelves.ts/libraryPrefsApi.ts) -- keyed by a normalized series name (mirrors Android's
// Book.aniListSeriesKey()), or a standalone book's own manifestUrl when it has no series metadata.
// One media link + sync toggle per series, shared by every volume, so linking volume 1 also links
// volume 2 without a second search.

import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "./libraryPrefsApi";

export interface AniListLink {
  mediaId: number;
  syncEnabled: boolean;
}

function sanitizeLinks(raw: unknown): Record<string, AniListLink> {
  if (!raw || typeof raw !== "object") return {};

  const result: Record<string, AniListLink> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const mediaId = (value as Partial<AniListLink> | null)?.mediaId;
    if (typeof mediaId === "number") {
      result[key] = { mediaId, syncEnabled: (value as Partial<AniListLink>)?.syncEnabled !== false };
    }
  }
  return result;
}

export async function fetchAniListLinks(): Promise<Record<string, AniListLink>> {
  const prefs = await fetchLibraryPrefsFromServer();
  return sanitizeLinks(prefs?.anilistLinks);
}

/** Always re-reads the full map before writing (rather than trusting a caller's possibly-stale
 *  local copy) -- same "mutate a fresh copy, PATCH in full" convention LibraryPrefsRepository uses
 *  on Android, so a link added from another device/tab in the meantime doesn't get clobbered. Pass
 *  a null [link] to unlink [seriesKey] entirely. */
export async function setAniListLink(seriesKey: string, link: AniListLink | null): Promise<void> {
  const current = await fetchAniListLinks();
  const next = { ...current };
  if (link) next[seriesKey] = link;
  else delete next[seriesKey];
  saveLibraryPrefsToServer({ anilistLinks: next });
}

/** Mirrors Android's Book.aniListSeriesKey() exactly (normalized series name, or the book's own
 *  manifestUrl fallback) so a series linked from either platform is recognized by the other. */
export function aniListSeriesKey(seriesName: string | null | undefined, manifestUrl: string): string {
  const normalized = seriesName?.trim().toLowerCase();
  return normalized || manifestUrl;
}
