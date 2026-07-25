import { DailyReadingBucket } from "./readingTimeTypes";

// CLAUDE-ADDED: Talks to /api/userdata/dailyReadingHistory -- same whole-array-overwrite pattern as
// readingSpeedApi.ts. This is the *currently open* period's buckets only (see DailyReadingBucket);
// completeReadingTimer archives them onto a StoredCompletedReadTime and then persists an empty array
// here to start the next period.

export async function fetchDailyReadingHistoryFromServer(manifestUrl: string): Promise<DailyReadingBucket[]> {
  try {
    const res = await fetch(`/api/userdata/dailyReadingHistory?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return [];

    const { buckets } = await res.json();
    return Array.isArray(buckets) ? buckets : [];
  } catch (err) {
    console.error("Failed to load daily reading history from server:", err);
    return [];
  }
}

export function saveDailyReadingHistoryToServer(manifestUrl: string, buckets: DailyReadingBucket[]): void {
  fetch("/api/userdata/dailyReadingHistory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, buckets }),
    keepalive: true
  }).catch(err => console.error("Failed to save daily reading history to server:", err));
}
