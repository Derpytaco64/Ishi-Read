import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getListeningTimeFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { getCurrentUserId } from "@/next-lib/userData/session";
import { StoredListeningTime } from "@/lib/userData/listeningTimeTypes";

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
  const data = readJsonFile<StoredListeningTime>(getListeningTimeFilePath(userId, hash));

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const accumulatedSeconds = body?.accumulatedSeconds;
  const startedAt = body?.startedAt;

  if (
    typeof manifestUrl !== "string" || !manifestUrl ||
    typeof accumulatedSeconds !== "number" ||
    (startedAt !== null && typeof startedAt !== "number")
  ) {
    return NextResponse.json({ error: "manifestUrl, accumulatedSeconds and startedAt are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const data: StoredListeningTime = { accumulatedSeconds, startedAt };
  writeJsonFileAtomic(getListeningTimeFilePath(userId, hash), data);

  return NextResponse.json({ ok: true });
}
