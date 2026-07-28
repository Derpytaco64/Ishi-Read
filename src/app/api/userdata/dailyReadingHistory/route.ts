import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getDailyReadingHistoryFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
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
  const buckets = readJsonFile<DailyReadingBucket[]>(getDailyReadingHistoryFilePath(userId, hash));

  return NextResponse.json({ buckets: buckets ?? [] });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const buckets = body?.buckets;

  if (typeof manifestUrl !== "string" || !manifestUrl || !Array.isArray(buckets)) {
    return NextResponse.json({ error: "manifestUrl and buckets are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getDailyReadingHistoryFilePath(userId, hash), buckets);

  return NextResponse.json({ ok: true });
}
