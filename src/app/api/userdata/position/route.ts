import fs from "fs";
import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getPositionFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const filePath = getPositionFilePath(userId, hash);
  const locator = readJsonFile(filePath);

  // CLAUDE-ADDED: The write below goes through writeJsonFileAtomic's temp-file-then-rename, which
  // preserves the temp file's mtime (set at the writeFileSync that created it) across the rename --
  // so this is the real "when was this position last saved" moment, with no separate timestamp
  // field to keep in sync in the stored JSON itself. Clients (the Android app) use this to resolve
  // sync conflicts by recency instead of by furthest-progress, so an intentional re-read backwards
  // isn't clobbered by an older, further-along save. Omitted (not 0) when the file doesn't exist,
  // so "never saved anywhere" isn't confused with "saved at the epoch."
  let updatedAt: number | null = null;
  try {
    updatedAt = fs.statSync(filePath).mtimeMs;
  } catch {
    updatedAt = null;
  }

  return NextResponse.json({ locator, updatedAt });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const locator = body?.locator;

  if (typeof manifestUrl !== "string" || !manifestUrl || !locator) {
    return NextResponse.json({ error: "manifestUrl and locator are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getPositionFilePath(userId, hash), locator);

  return NextResponse.json({ ok: true });
}
