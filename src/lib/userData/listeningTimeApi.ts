// CLAUDE-ADDED: Talks to /api/userdata/listeningTime -- same manifestUrl-keyed server-file pattern as
// readingTimeApi.ts, but a small {accumulatedSeconds, startedAt} object instead of a bare number,
// since audiobooks need both.

import { StoredListeningTime } from "./listeningTimeTypes";

export async function fetchListeningTimeFromServer(manifestUrl: string): Promise<StoredListeningTime | null> {
  try {
    const res = await fetch(`/api/userdata/listeningTime?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return null;

    const { data } = await res.json();
    return data ?? null;
  } catch (err) {
    console.error("Failed to load listening time from server:", err);
    return null;
  }
}

// CLAUDE-ADDED: keepalive lets this survive a tab close/navigation -- called from the flush-on-hide
// and flush-on-unmount paths in useListeningTimer, exactly when the page may be disappearing mid-request.
export function saveListeningTimeToServer(manifestUrl: string, data: StoredListeningTime): void {
  fetch("/api/userdata/listeningTime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, ...data }),
    keepalive: true
  }).catch(err => console.error("Failed to save listening time to server:", err));
}
