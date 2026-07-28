import { NextResponse } from "next/server";

import { getReadiumServerUrl, setReadiumServerUrl, normalizeReadiumUrl } from "@/next-lib/userData/publicationsConfig";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only -- same reasoning as book-folder.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ readiumUrl: getReadiumServerUrl() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const readiumUrl = body?.readiumUrl;

  if (typeof readiumUrl !== "string" || readiumUrl.trim() === "") {
    return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  }

  const { url: trimmed, error } = normalizeReadiumUrl(readiumUrl);
  if (error) return NextResponse.json({ error }, { status: 400 });

  setReadiumServerUrl(trimmed!);

  return NextResponse.json({ readiumUrl: trimmed });
}
