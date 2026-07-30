import { NextResponse } from "next/server";

import { listUsers, toPublicUser } from "@/next-lib/userData/auth";

export const runtime = "nodejs";

// CLAUDE-ADDED: Public and unauthenticated on purpose -- the login page's avatar picker needs this
// before anyone is logged in. Deliberately trims the response down to what a profile picker needs
// (id/username/name/avatar) rather than passing toPublicUser's full shape straight through, so
// things like isAdmin/needsPasswordSetup are never exposed to an unauthenticated caller. Disabled
// accounts are filtered out entirely -- they can't sign in (see attemptLogin), so showing them here
// would just be a dead end that also leaks who has been disabled to anyone on the login screen.
export async function GET() {
  const users = listUsers()
    .filter((u) => !u.disabled)
    .map(toPublicUser)
    .map(({ id, username, name, avatarUrl }) => ({ id, username, name, avatarUrl }));
  return NextResponse.json({ users });
}
