import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { CURRENT_USER_ID, ensureUsersRegistry, getReadingSpeedSamplesFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { ReadingSpeedSample } from "@/lib/userData/readingTimeTypes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const samples = readJsonFile<ReadingSpeedSample[]>(getReadingSpeedSamplesFilePath(CURRENT_USER_ID, hash));

  return NextResponse.json({ samples: samples ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const samples = body?.samples;

  if (typeof manifestUrl !== "string" || !manifestUrl || !Array.isArray(samples)) {
    return NextResponse.json({ error: "manifestUrl and samples are required" }, { status: 400 });
  }

  ensureUsersRegistry();
  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getReadingSpeedSamplesFilePath(CURRENT_USER_ID, hash), samples);

  return NextResponse.json({ ok: true });
}
