import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { clearAniListLink } from "@/next-lib/userData/auth";

export const runtime = "nodejs";

// CLAUDE-ADDED: Forgets the stored token on this server only -- AniList has no revocation endpoint
// this app can call, so a user wanting the token itself invalidated (not just forgotten here) needs
// to revoke it from AniList's own "Apps" settings. Worth surfacing that in the UI copy, not just
// here.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  clearAniListLink(userId);
  return NextResponse.json({ connected: false });
}
