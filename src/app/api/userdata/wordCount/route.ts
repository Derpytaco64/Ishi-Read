import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getWordCountFilePath } from "@/next-lib/userData/paths";
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
  const wordCount = readJsonFile<number>(getWordCountFilePath(userId, hash));

  return NextResponse.json({ wordCount });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const wordCount = body?.wordCount;

  if (typeof manifestUrl !== "string" || !manifestUrl || typeof wordCount !== "number") {
    return NextResponse.json({ error: "manifestUrl and wordCount are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getWordCountFilePath(userId, hash), wordCount);

  return NextResponse.json({ ok: true });
}
