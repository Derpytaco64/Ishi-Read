import { NextResponse } from "next/server";

import { getCurrentUserId } from "../userData/session";
import { getAniListAccessToken } from "../userData/auth";
import { checkAniListRateLimit } from "./rateLimit";

// CLAUDE-ADDED: Shared guard for every route that proxies a call to AniList on the signed-in user's
// behalf -- session check, "is this user actually connected", and the rate-limit gate all live here
// once instead of being copy-pasted into search/list-entry and drifting apart.
export async function requireAniListAccess(): Promise<{ userId: string; accessToken: string } | NextResponse> {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accessToken = getAniListAccessToken(userId);
  if (!accessToken) return NextResponse.json({ error: "Connect your AniList account first" }, { status: 401 });

  const rateLimit = checkAniListRateLimit(userId);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many AniList requests -- try again shortly" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) } }
    );
  }

  return { userId, accessToken };
}
