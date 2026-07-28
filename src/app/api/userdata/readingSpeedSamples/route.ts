import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getReadingSpeedSamplesFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { ReadingSpeedSample } from "@/lib/userData/readingTimeTypes";
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
  const samples = readJsonFile<ReadingSpeedSample[]>(getReadingSpeedSamplesFilePath(userId, hash));

  return NextResponse.json({ samples: samples ?? [] });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const samples = body?.samples;

  if (typeof manifestUrl !== "string" || !manifestUrl || !Array.isArray(samples)) {
    return NextResponse.json({ error: "manifestUrl and samples are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getReadingSpeedSamplesFilePath(userId, hash), samples);

  return NextResponse.json({ ok: true });
}
