import { NextResponse } from "next/server";

import { getAniListClientId, setAniListClientId, getAniListClientSecret, setAniListClientSecret } from "@/next-lib/userData/anilistConfig";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only, same reasoning as readium-url/book-folder -- this is the instance-wide
// AniList app registration (one client_id/client_secret shared by every user's PIN-flow exchange),
// not a per-user setting. GET never echoes the stored secret back, even to an admin -- only whether
// one is set, same principle as a password field always rendering blank/masked.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    clientId: getAniListClientId(),
    clientSecretSet: getAniListClientSecret() !== null
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const clientId = body?.clientId;
  const clientSecret = body?.clientSecret;

  if (typeof clientId !== "string" || clientId.trim() === "") {
    return NextResponse.json({ error: "A client ID is required" }, { status: 400 });
  }
  setAniListClientId(clientId);

  // CLAUDE-ADDED: clientSecret is optional on this request -- omitting it (rather than sending an
  // empty string) leaves whatever's already stored untouched, so re-saving just the client ID
  // doesn't force re-entering the secret every time.
  if (typeof clientSecret === "string" && clientSecret.trim() !== "") {
    setAniListClientSecret(clientSecret);
  }

  return NextResponse.json({ clientId: getAniListClientId(), clientSecretSet: getAniListClientSecret() !== null });
}
