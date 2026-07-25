import { ReadingSpeedSample } from "./readingTimeTypes";

// CLAUDE-ADDED: Talks to /api/userdata/readingSpeedSamples -- the rolling sample buffer is persisted
// as a single whole-array overwrite (like readingTimeApi.ts's seconds value), not per-item
// upsert/delete (like completedReadTimesApi.ts), since callers always have the full capped array
// in hand already (see useReadingSpeedSampler) and there's no user-facing per-item deletion.

export async function fetchReadingSpeedSamplesFromServer(manifestUrl: string): Promise<ReadingSpeedSample[]> {
  try {
    const res = await fetch(`/api/userdata/readingSpeedSamples?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return [];

    const { samples } = await res.json();
    return Array.isArray(samples) ? samples : [];
  } catch (err) {
    console.error("Failed to load reading speed samples from server:", err);
    return [];
  }
}

// CLAUDE-ADDED: keepalive so this survives a tab close/navigation, same reasoning as
// saveReadingTimeToServer -- callers debounce/flush this the same way (see useReadingSpeedSampler).
export function saveReadingSpeedSamplesToServer(manifestUrl: string, samples: ReadingSpeedSample[]): void {
  fetch("/api/userdata/readingSpeedSamples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, samples }),
    keepalive: true
  }).catch(err => console.error("Failed to save reading speed samples to server:", err));
}
