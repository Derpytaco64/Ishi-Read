// CLAUDE-ADDED: Talks to /api/userdata/readingTime, same manifestUrl-keyed server-file pattern as
// positionApi.ts -- a single accumulated-seconds value per book rather than a list of entries.

export async function fetchReadingTimeFromServer(manifestUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/userdata/readingTime?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return null;

    const { seconds } = await res.json();
    return typeof seconds === "number" ? seconds : null;
  } catch (err) {
    console.error("Failed to load reading time from server:", err);
    return null;
  }
}

// CLAUDE-ADDED: keepalive lets this survive a tab close/navigation -- it's called from the flush-on-hide
// and flush-on-unmount paths in useReadingTimer, exactly when the page may be disappearing mid-request.
export function saveReadingTimeToServer(manifestUrl: string, seconds: number): void {
  fetch("/api/userdata/readingTime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, seconds }),
    keepalive: true
  }).catch(err => console.error("Failed to save reading time to server:", err));
}
