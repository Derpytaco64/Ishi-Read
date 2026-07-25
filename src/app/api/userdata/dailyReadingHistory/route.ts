import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { CURRENT_USER_ID, ensureUsersRegistry, getDailyReadingHistoryFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { DailyReadingBucket } from "@/lib/userData/readingTimeTypes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const buckets = readJsonFile<DailyReadingBucket[]>(getDailyReadingHistoryFilePath(CURRENT_USER_ID, hash));

  return NextResponse.json({ buckets: buckets ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const buckets = body?.buckets;

  if (typeof manifestUrl !== "string" || !manifestUrl || !Array.isArray(buckets)) {
    return NextResponse.json({ error: "manifestUrl and buckets are required" }, { status: 400 });
  }

  ensureUsersRegistry();
  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getDailyReadingHistoryFilePath(CURRENT_USER_ID, hash), buckets);

  return NextResponse.json({ ok: true });
}
