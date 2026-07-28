import { NextResponse } from "next/server";

import { listPublicUsers } from "@/next-lib/userData/auth";

export const runtime = "nodejs";

// CLAUDE-ADDED: Public and unauthenticated on purpose -- the login page's avatar picker needs this
// before anyone is logged in. Deliberately trims the response down to what a profile picker needs
// (id/username/name/avatar) rather than passing toPublicUser's full shape straight through, so
// things like isAdmin/needsPasswordSetup are never exposed to an unauthenticated caller.
export async function GET() {
  const users = listPublicUsers().map(({ id, username, name, avatarUrl }) => ({ id, username, name, avatarUrl }));
  return NextResponse.json({ users });
}
