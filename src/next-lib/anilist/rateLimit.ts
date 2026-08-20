// CLAUDE-ADDED: In-memory sliding-window limiter shared by every route that calls out to AniList.
// One instance's client_id/client_secret (and, per-request, one user's access token) is shared
// infrastructure -- without this, one user hammering the search box (or a buggy client retry loop)
// could burn through the whole instance's AniList budget (90 req/min normally, 30 req/min while
// AniList is degraded, as of Aug 2026) and break sync for every other user on the same server.
// In-memory and per-process is fine here: this app isn't horizontally scaled, and losing the
// counters on a restart just means a brief grace period, not an exploitable gap.
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_MAX_PER_WINDOW = 25; // headroom under AniList's degraded 30/min floor
const PER_USER_WINDOW_MS = 10_000;
const PER_USER_MAX_PER_WINDOW = 8;

let globalTimestamps: number[] = [];
const perUserTimestamps = new Map<string, number[]>();

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter((t) => now - t < windowMs);
}

export function checkAniListRateLimit(userId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  globalTimestamps = prune(globalTimestamps, GLOBAL_WINDOW_MS, now);
  const userTimestamps = prune(perUserTimestamps.get(userId) ?? [], PER_USER_WINDOW_MS, now);

  if (globalTimestamps.length >= GLOBAL_MAX_PER_WINDOW) {
    return { ok: false, retryAfterMs: GLOBAL_WINDOW_MS - (now - globalTimestamps[0]) };
  }
  if (userTimestamps.length >= PER_USER_MAX_PER_WINDOW) {
    return { ok: false, retryAfterMs: PER_USER_WINDOW_MS - (now - userTimestamps[0]) };
  }

  globalTimestamps.push(now);
  userTimestamps.push(now);
  perUserTimestamps.set(userId, userTimestamps);
  return { ok: true };
}
