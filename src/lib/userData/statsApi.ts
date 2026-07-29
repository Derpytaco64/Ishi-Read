import { UserStats } from "@/lib/userData/statsTypes";

// CLAUDE-ADDED: Single whole-library aggregate, no manifestUrl -- unlike every other userData
// fetch wrapper here (fetchReadingTimeFromServer et al.), which is keyed to one open book.
export async function fetchStatsFromServer(): Promise<UserStats | null> {
  try {
    const res = await fetch("/api/userdata/stats");
    if (!res.ok) return null;

    return await res.json() as UserStats;
  } catch (err) {
    console.error("Failed to load stats from server:", err);
    return null;
  }
}
