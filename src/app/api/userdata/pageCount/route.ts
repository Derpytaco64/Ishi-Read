import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getPageCountFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { computePageCountForManifest, PAGE_COUNT_ALGORITHM_VERSION } from "@/next-lib/userData/pageCountCompute";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: version tags which algorithm produced pageCount -- readJsonFile<CachedPageCount> on an
// old cache file (a bare number, pre-versioning) comes back as a number, not an object, so
// cached?.version will be undefined and safely fail the === check below rather than throwing.
type CachedPageCount = { version: number; pageCount: number };

// CLAUDE-ADDED: Unlike every other userdata GET route, this one computes-and-caches on a miss instead
// of just returning null. A book's page count is a fixed property of its own text (not tied to any
// reading session), so it's keyed by the same book hash positions/annotations/etc use and can be
// derived the first time anyone asks -- e.g. opening the library's book-detail sheet -- without ever
// requiring the reader to have been opened. The cache is versioned (see PAGE_COUNT_ALGORITHM_VERSION)
// rather than permanent, so a future fix to the computation itself doesn't get stuck behind a
// wrong value computed under the old logic -- it's still a cache (no repeat work for a version that
// hasn't changed), just one that can't outlive the code that produced it.
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
  const cached = readJsonFile<CachedPageCount>(filePath);
  if (cached !== null && cached.version === PAGE_COUNT_ALGORITHM_VERSION) {
    return NextResponse.json({ pageCount: cached.pageCount });
  }

  try {
    const pageCount = await computePageCountForManifest(manifestUrl);
    writeJsonFileAtomic(filePath, { version: PAGE_COUNT_ALGORITHM_VERSION, pageCount });
    return NextResponse.json({ pageCount });
  } catch (err) {
    console.error(`Failed to compute page count for ${ manifestUrl }:`, err);
    return NextResponse.json({ pageCount: null });
  }
}
