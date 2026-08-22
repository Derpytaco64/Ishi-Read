import { DailyListeningBucket } from "./listeningTimeTypes";

// CLAUDE-ADDED: Talks to /api/userdata/dailyListeningHistory -- audiobook counterpart of
// dailyReadingHistoryApi.ts, same whole-array-overwrite pattern. This is the *currently open*
// period's buckets only (see DailyListeningBucket); completeListen archives them onto a
// StoredCompletedListen and then persists an empty array here to start the next period.

export async function fetchDailyListeningHistoryFromServer(manifestUrl: string): Promise<DailyListeningBucket[]> {
  try {
    const res = await fetch(`/api/userdata/dailyListeningHistory?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return [];

    const { buckets } = await res.json();
    return Array.isArray(buckets) ? buckets : [];
  } catch (err) {
    console.error("Failed to load daily listening history from server:", err);
    return [];
  }
}

export function saveDailyListeningHistoryToServer(manifestUrl: string, buckets: DailyListeningBucket[]): void {
  fetch("/api/userdata/dailyListeningHistory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, buckets }),
    keepalive: true
  }).catch(err => console.error("Failed to save daily listening history to server:", err));
}
