import { NextResponse } from "next/server";

import { createUser, listUsers, getActiveUserIds } from "@/next-lib/userData/auth";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

// CLAUDE-ADDED: Admin-only user management, gated the same way as the server-config settings
// routes -- getCurrentUser() + isAdmin check, since middleware only guarantees "logged in", not
// "logged in as an admin".
function stripSecrets(user: ReturnType<typeof listUsers>[number]) {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...rest } = user;
  return rest;
}

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const activeUserIds = getActiveUserIds();
  const users = listUsers().map((user) => ({ ...stripSecrets(user), isActive: activeUserIds.has(user.id) }));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const username = body?.username;
  const name = body?.name;
  const password: string = typeof body?.password === "string" ? body.password : "";
  const isAdmin = body?.isAdmin === true;

  if (typeof username !== "string" || !USERNAME_PATTERN.test(username.trim())) {
    return NextResponse.json({ error: "Username must be 3-32 characters (letters, numbers, _ . -)" }, { status: 400 });
  }
  // CLAUDE-ADDED: Password is optional for a regular profile (passwordless -- signs in by leaving
  // the field blank on /login, see attemptLogin), but required for an admin account -- letting
  // anyone with network access claim an unclaimed admin account by leaving the password blank is a
  // materially bigger risk than a regular household profile with no password.
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${ MIN_PASSWORD_LENGTH } characters` }, { status: 400 });
  }
  if (isAdmin && !password) {
    return NextResponse.json({ error: "Admin accounts require a password" }, { status: 400 });
  }

  try {
    const user = createUser({ username, name: typeof name === "string" ? name : username, password: password || undefined, isAdmin });
    return NextResponse.json({ user: stripSecrets(user) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create user" }, { status: 400 });
  }
}
