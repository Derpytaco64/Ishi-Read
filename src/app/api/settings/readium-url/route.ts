import { NextResponse } from "next/server";

import { getReadiumServerUrl, setReadiumServerUrl } from "@/next-lib/userData/publicationsConfig";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ readiumUrl: getReadiumServerUrl() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const readiumUrl = body?.readiumUrl;

  if (typeof readiumUrl !== "string" || readiumUrl.trim() === "") {
    return NextResponse.json({ error: "A URL is required" }, { status: 400 });
  }

  // CLAUDE-ADDED: Trailing slash stripped so it concatenates cleanly with the "/webpub/..." path
  // api/books/route.ts builds (a trailing slash would otherwise produce a double slash there).
  const trimmed = readiumUrl.trim().replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "The URL must start with http:// or https://" }, { status: 400 });
  }

  setReadiumServerUrl(trimmed);

  return NextResponse.json({ readiumUrl: trimmed });
}
