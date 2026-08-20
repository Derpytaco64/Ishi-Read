import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { setAniListLink } from "@/next-lib/userData/auth";
import { getAniListClientId, getAniListClientSecret } from "@/next-lib/userData/anilistConfig";
import { exchangeAniListCode, anilistGraphQL, AniListAuthError, AniListApiError } from "@/next-lib/anilist/client";

export const runtime = "nodejs";

interface ViewerResponse {
  Viewer: { id: number; mediaListOptions: { scoreFormat: string } };
}

const VIEWER_QUERY = `
  query {
    Viewer {
      id
      mediaListOptions { scoreFormat }
    }
  }
`;

// CLAUDE-ADDED: The PIN-flow completion step -- the user approved the app in their browser, landed
// on AniList's own /oauth/pin page, and pasted the resulting code here. userId is always taken from
// the session cookie (getCurrentUserId), never from the request body, so this can only ever link
// the AniList account to whichever Ishi-Read account is currently signed in -- pasting a code you
// didn't generate yourself just links a stranger's AniList account to your own Ishi-Read account,
// not someone else's.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = getAniListClientId();
  const clientSecret = getAniListClientSecret();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "AniList isn't configured on this server yet -- ask your admin to set it up first." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const code = body?.code;
  if (typeof code !== "string" || code.trim() === "") {
    return NextResponse.json({ error: "Paste the code AniList gave you" }, { status: 400 });
  }

  try {
    const accessToken = await exchangeAniListCode(code.trim(), clientId, clientSecret);
    const viewer = await anilistGraphQL<ViewerResponse>(VIEWER_QUERY, {}, accessToken);

    setAniListLink(userId, {
      accessToken,
      anilistUserId: viewer.Viewer.id,
      scoreFormat: viewer.Viewer.mediaListOptions.scoreFormat
    });

    return NextResponse.json({ connected: true, anilistUserId: viewer.Viewer.id, scoreFormat: viewer.Viewer.mediaListOptions.scoreFormat });
  } catch (err) {
    if (err instanceof AniListAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof AniListApiError) return NextResponse.json({ error: err.message }, { status: 502 });
    return NextResponse.json({ error: "Failed to connect to AniList" }, { status: 500 });
  }
}
