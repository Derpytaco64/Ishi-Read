import { NextResponse } from "next/server";

import { getLoginAccentColor, setLoginAccentColor } from "@/next-lib/userData/publicationsConfig";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// CLAUDE-ADDED: Unlike the other settings routes, GET here is public (see proxy.ts's isPublicPath)
// -- /login itself needs to read this before any session exists. It's just a color, not sensitive.
// Only POST requires an admin, checked here since the path itself is allowlisted past proxy.ts.
export async function GET() {
  return NextResponse.json({ loginAccentColor: getLoginAccentColor() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const loginAccentColor = body?.loginAccentColor;

  if (typeof loginAccentColor !== "string" || !HEX_COLOR_RE.test(loginAccentColor)) {
    return NextResponse.json({ error: "A valid hex color (e.g. #2f6fed) is required" }, { status: 400 });
  }

  setLoginAccentColor(loginAccentColor);
  return NextResponse.json({ loginAccentColor });
}
