import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getPageCountFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { computePageCountForManifest } from "@/next-lib/userData/pageCountCompute";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Unlike every other userdata GET route, this one computes-and-caches on a miss instead
// of just returning null. A book's page count is a fixed property of its own text (not tied to any
// reading session), so it's keyed by the same book hash positions/annotations/etc use and can be
// derived the first time anyone asks -- e.g. opening the library's book-detail sheet -- without ever
// requiring the reader to have been opened.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const filePath = getPageCountFilePath(userId, hash);
  const cached = readJsonFile<number>(filePath);
  if (cached !== null) {
    return NextResponse.json({ pageCount: cached });
  }

  try {
    const pageCount = await computePageCountForManifest(manifestUrl);
    writeJsonFileAtomic(filePath, pageCount);
    return NextResponse.json({ pageCount });
  } catch (err) {
    console.error(`Failed to compute page count for ${ manifestUrl }:`, err);
    return NextResponse.json({ pageCount: null });
  }
}
