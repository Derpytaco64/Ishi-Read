// CLAUDE-ADDED: Talks to /api/anilist/search and /api/anilist/list-entry -- the per-user AniList
// tracking proxy routes (see anilist_sync_design memory / api/anilist/**). Distinct from the
// connect/disconnect PIN flow in StatefulUserMenu, which talks to /api/auth/anilist instead.
// Manga-only, same as those routes' own format_in filter.

export interface AniListTitle {
  romaji: string | null;
  english: string | null;
}

export interface AniListCoverImage {
  medium: string | null;
}

export interface AniListSearchResult {
  id: number;
  title: AniListTitle;
  coverImage: AniListCoverImage | null;
  format: string | null;
  chapters: number | null;
}

export interface AniListFuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListMediaListEntry {
  id: number;
  status: string;
  score: number;
  progress: number;
  repeat: number;
  startedAt: AniListFuzzyDate | null;
  completedAt: AniListFuzzyDate | null;
}

export interface AniListMedia {
  id: number;
  chapters: number | null;
  title: AniListTitle;
  coverImage: AniListCoverImage | null;
  mediaListEntry: AniListMediaListEntry | null;
}

// CLAUDE-ADDED: Only the keys actually present are sent -- the server does a presence-based patch
// (an omitted key means "don't change this field", an explicit null clears it, e.g. clearing
// completedAt). JSON.stringify already drops `undefined` values and keeps explicit `null`s, so
// callers get that semantic for free just by only setting the fields that actually changed.
export interface AniListSaveEntryPatch {
  mediaId: number;
  status?: string;
  score?: number;
  progress?: number;
  repeat?: number;
  startedAt?: AniListFuzzyDate | null;
  completedAt?: AniListFuzzyDate | null;
}

export async function searchAniList(query: string): Promise<AniListSearchResult[]> {
  try {
    const res = await fetch(`/api/anilist/search?query=${ encodeURIComponent(query) }`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch (err) {
    console.error("Failed to search AniList:", err);
    return [];
  }
}

export async function fetchAniListEntry(mediaId: number): Promise<AniListMedia | null> {
  try {
    const res = await fetch(`/api/anilist/list-entry?mediaId=${ mediaId }`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.media ?? null;
  } catch (err) {
    console.error("Failed to load AniList entry:", err);
    return null;
  }
}

// CLAUDE-ADDED: Returns { entry } on success, { error } on a handled failure (bad status code with
// a JSON error body) so the caller can tell "AniList/the server rejected this" apart from "request
// never landed" -- same distinction TrackingViewModel's ApiResult gives the Android app, just
// without a shared result type on this side.
export async function saveAniListEntry(patch: AniListSaveEntryPatch): Promise<{ entry: AniListMediaListEntry | null; error: string | null }> {
  try {
    const res = await fetch("/api/anilist/list-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { entry: null, error: data?.error || "Couldn't save to AniList" };
    return { entry: data?.entry ?? null, error: null };
  } catch (err) {
    console.error("Failed to save AniList entry:", err);
    return { entry: null, error: "Couldn't save to AniList" };
  }
}
