import { NextResponse } from "next/server";

import { setAvatar } from "@/next-lib/userData/auth";
import { saveAvatarFromDataUrl } from "@/next-lib/userData/avatarStorage";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const image = body?.image;
  if (typeof image !== "string") {
    return NextResponse.json({ error: "Image data is required" }, { status: 400 });
  }

  try {
    const ext = saveAvatarFromDataUrl(userId, image);
    setAvatar(userId, ext);
    // CLAUDE-ADDED: Cache-busting query param -- the avatar URL itself (/api/users/{id}/avatar)
    // never changes when a user re-uploads, so without this the browser (and any <img> already on
    // screen) would keep showing the old cached image.
    return NextResponse.json({ avatarUrl: `/api/users/${ userId }/avatar?v=${ Date.now() }` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save avatar" }, { status: 400 });
  }
}
