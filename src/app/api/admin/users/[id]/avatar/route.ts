import { NextResponse } from "next/server";

import { getUserById, setAvatar } from "@/next-lib/userData/auth";
import { saveAvatarFromDataUrl } from "@/next-lib/userData/avatarStorage";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

/** Admin-scoped counterpart to api/auth/avatar -- lets an admin set *another* user's avatar,
 *  same data-URL body/response shape, just targeting `id` from the route instead of the caller's
 *  own session. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!getUserById(id)) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const image = body?.image;
  if (typeof image !== "string") {
    return NextResponse.json({ error: "Image data is required" }, { status: 400 });
  }

  try {
    const ext = saveAvatarFromDataUrl(id, image);
    setAvatar(id, ext);
    return NextResponse.json({ avatarUrl: `/api/users/${id}/avatar?v=${Date.now()}` });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save avatar" }, { status: 400 });
  }
}
