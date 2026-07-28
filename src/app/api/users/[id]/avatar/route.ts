import fs from "fs";
import { NextResponse } from "next/server";

import { getUserById } from "@/next-lib/userData/auth";
import { AVATAR_MIME_BY_EXT, getAvatarPath } from "@/next-lib/userData/avatarStorage";

export const runtime = "nodejs";

// CLAUDE-ADDED: Public and unauthenticated on purpose, same reasoning as /api/auth/users -- the
// login page has to be able to render everyone's picture before anyone is logged in. Only ever
// serves the one file path derived from the registry's own recorded extension for this id, never
// an attacker-supplied path.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = getUserById(id);

  if (!user || !user.avatarExt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const data = fs.readFileSync(getAvatarPath(id, user.avatarExt));
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": AVATAR_MIME_BY_EXT[user.avatarExt] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
