import { cookies } from "next/headers";

import { getUserById, resolveSession, SESSION_COOKIE_NAME, UserRecord } from "./auth";

// CLAUDE-ADDED: Single place every route handler asks "who's logged in" -- reads the session
// cookie via next/headers (works in any Route Handler without threading the Request through) and
// resolves it against the file-backed session store in auth.ts. Returns null rather than throwing
// so callers decide their own 401 shape; proxy.ts is what actually keeps unauthenticated requests
// from reaching these routes at all, this is the defense-in-depth check inside them.
export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return resolveSession(token);
}

// CLAUDE-ADDED: Used by the handful of routes that need more than just "who" -- admin-gated routes
// (server config, user management) check .isAdmin off this instead of duplicating the
// getCurrentUserId + getUserById lookup themselves.
export async function getCurrentUser(): Promise<UserRecord | null> {
  const userId = await getCurrentUserId();
  return userId ? getUserById(userId) : null;
}
