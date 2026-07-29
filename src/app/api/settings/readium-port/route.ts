import { NextResponse } from "next/server";

import { getReadiumServerPort, setReadiumServerPort, normalizeReadiumPort } from "@/next-lib/userData/publicationsConfig";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only -- same reasoning as book-folder/readium-url.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ readiumPort: getReadiumServerPort() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const readiumPort = body?.readiumPort;

  if (typeof readiumPort !== "string" || readiumPort.trim() === "") {
    return NextResponse.json({ error: "A port is required" }, { status: 400 });
  }

  const { port, error } = normalizeReadiumPort(readiumPort);
  if (error) return NextResponse.json({ error }, { status: 400 });

  setReadiumServerPort(port!);

  return NextResponse.json({ readiumPort: port });
}
