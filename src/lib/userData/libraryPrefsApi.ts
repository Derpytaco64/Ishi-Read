// CLAUDE-ADDED: Talks to /api/userdata/library-prefs -- the library-page counterpart of
// settingsApi.ts's fetchSettingsFromServer/saveSettingsToServer. Deliberately a separate endpoint
// and file from the reader's settings.json: that one is fetched wholesale by the Redux store's
// hydrateFromServer, which merges every top-level key straight into RootState, so shelfPrefs/
// coverSize/accentColor/theme can't live there without tripping combineReducers' unknown-key
// warning.

// CLAUDE-ADDED: accentColor, coverSize, theme, and shelfPrefs/shelfOrder are each owned by a
// different hook/component, but they all fetch this same endpoint on mount -- without dedup that's
// up to four redundant round trips for identical data on every page load. Sharing one in-flight
// promise collapses concurrent callers onto a single request; it clears once settled so a later
// remount still gets a fresh fetch.
let inFlightFetch: Promise<Record<string, unknown> | null> | null = null;

export function fetchLibraryPrefsFromServer(): Promise<Record<string, unknown> | null> {
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const res = await fetch("/api/userdata/library-prefs");
      if (!res.ok) return null;
      const { libraryPrefs } = await res.json();
      return libraryPrefs ?? null;
    } catch (err) {
      console.error("Failed to load library preferences from server:", err);
      return null;
    }
  })();

  inFlightFetch.finally(() => { inFlightFetch = null; });

  return inFlightFetch;
}

export function saveLibraryPrefsToServer(patch: Record<string, unknown>): void {
  fetch("/api/userdata/library-prefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(err => console.error("Failed to save library preferences to server:", err));
}
