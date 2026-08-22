import { WeeklyBookTypeStats } from "./weeklyStatsTypes";

// CLAUDE-ADDED: offset 0 is the current week; each step below 0 pages back another 7 days -- see the
// server route's own comment for why it's clamped server-side to never go past the current week.
export async function fetchWeeklyStatsFromServer(offset: number): Promise<WeeklyBookTypeStats | null> {
  try {
    const res = await fetch(`/api/userdata/stats/weekly?offset=${ offset }`);
    if (!res.ok) return null;

    return await res.json() as WeeklyBookTypeStats;
  } catch (err) {
    console.error("Failed to load weekly stats from server:", err);
    return null;
  }
}
