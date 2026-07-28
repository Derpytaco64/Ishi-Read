import { NextResponse } from "next/server";

import { attemptLogin, createSession, SESSION_COOKIE_NAME } from "@/next-lib/userData/auth";

export const runtime = "nodejs";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  // CLAUDE-ADDED: password may legitimately be "" -- an account with no password yet signs in with
  // the field left blank (see attemptLogin) -- so only username is required to be non-empty here.
  if (typeof username !== "string" || typeof password !== "string" || !username) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const result = attemptLogin(username, password);

  if (!result.ok) {
    if (result.needsPasswordSetup) {
      return NextResponse.json({ needsPasswordSetup: true, userId: result.userId });
    }
    return NextResponse.json({ error: result.error, lockedUntil: result.lockedUntil }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, createSession(result.userId!), {
    httpOnly: true,
    // CLAUDE-ADDED: Only relaxed for local dev over plain http -- a remotely-reachable deployment
    // must run with NODE_ENV=production (which `next start` sets) so this cookie is never sent
    // over an unencrypted connection.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}
