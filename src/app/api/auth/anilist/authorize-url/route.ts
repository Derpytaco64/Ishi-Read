import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { getAniListClientId } from "@/next-lib/userData/anilistConfig";
import { buildAniListAuthorizeUrl } from "@/next-lib/anilist/client";

export const runtime = "nodejs";

// CLAUDE-ADDED: Any signed-in user (not admin-gated, unlike /api/settings/anilist) -- every user
// connects their own AniList account independently, so they need this URL without needing to know
// the instance's client_id themselves (that stays server-side, see anilistConfig.ts). Returns a
// null url rather than an error when the instance hasn't configured AniList yet, so the client can
// show "ask your admin to set this up" instead of a generic failure.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = getAniListClientId();
  return NextResponse.json({ url: clientId ? buildAniListAuthorizeUrl(clientId) : null });
}
