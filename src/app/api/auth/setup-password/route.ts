import { NextResponse } from "next/server";

import { createSession, getUserById, setInitialPassword, SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE } from "@/next-lib/userData/auth";

export const runtime = "nodejs";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 8;

// CLAUDE-ADDED: Only reachable path to a first password for an account that has none yet (fresh
// installs' bootstrap admin, or an admin-created account before its first login). Rejects outright
// once a password already exists -- from then on, changing it goes through change-password
// (self, requires the current one) or the admin reset route, never back through here.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const password = body?.password;

  if (typeof userId !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "userId and password are required" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${ MIN_PASSWORD_LENGTH } characters` }, { status: 400 });
  }

  const user = getUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.passwordHash) return NextResponse.json({ error: "A password is already set for this user" }, { status: 409 });

  setInitialPassword(userId, password);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, createSession(userId), {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}
