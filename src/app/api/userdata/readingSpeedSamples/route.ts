import { NextResponse } from "next/server";

import { getGlobalReadingSpeedSamplesFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { ReadingSpeedSample } from "@/lib/userData/readingTimeTypes";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: A single global rolling buffer per user (not one per book -- see
// getGlobalReadingSpeedSamplesFilePath), so the live WPM estimate carries over across book switches
// and session resets instead of resetting to "not enough data" every time.

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const samples = readJsonFile<ReadingSpeedSample[]>(getGlobalReadingSpeedSamplesFilePath(userId));

  return NextResponse.json({ samples: samples ?? [] });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const samples = body?.samples;

  if (!Array.isArray(samples)) {
    return NextResponse.json({ error: "samples is required" }, { status: 400 });
  }

  writeJsonFileAtomic(getGlobalReadingSpeedSamplesFilePath(userId), samples);

  return NextResponse.json({ ok: true });
}
