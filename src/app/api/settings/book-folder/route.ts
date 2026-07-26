import fs from "fs";

import { NextResponse } from "next/server";

import { getPublicationsDir, setPublicationsDir } from "@/next-lib/userData/publicationsConfig";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ bookFolder: getPublicationsDir() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const bookFolder = body?.bookFolder;

  if (typeof bookFolder !== "string" || bookFolder.trim() === "") {
    return NextResponse.json({ error: "A folder path is required" }, { status: 400 });
  }

  const trimmed = bookFolder.trim();

  // CLAUDE-ADDED: Reject upfront rather than letting a bad path silently take effect -- the next
  // /api/books GET would otherwise fail with an opaque fs error and no way back to a working folder
  // from the Settings UI.
  let stat: fs.Stats;
  try {
    stat = fs.statSync(trimmed);
  } catch {
    return NextResponse.json({ error: "That folder doesn't exist" }, { status: 400 });
  }

  if (!stat.isDirectory()) {
    return NextResponse.json({ error: "That path isn't a folder" }, { status: 400 });
  }

  setPublicationsDir(trimmed);

  return NextResponse.json({ bookFolder: trimmed });
}
