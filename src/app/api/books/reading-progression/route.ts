import { NextResponse } from "next/server";
import path from "path";

import { resolveLocalFile } from "@/next-lib/userData/bookIdentity";
import { getCurrentUserId } from "@/next-lib/userData/session";
import { extractCBZMetadata, extractCBZPageBookmarks } from "@/next-lib/comicInfo";

export const runtime = "nodejs";

// CLAUDE-ADDED: usePublication.ts fetches the reading manifest straight from the bundled Go readium
// server (no Next.js server in between) -- so it can't read ComicInfo.xml itself. This gives the
// client a way to ask, right before it builds the Publication object, both whether the CBZ this
// manifest belongs to should read right-to-left (the <Manga> tag) and its real chapter markers (the
// <Pages> list's Bookmark attributes) -- one request since both come off the same file read.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");
  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const filePath = resolveLocalFile(manifestUrl);
  if (!filePath || path.extname(filePath).toLowerCase() !== ".cbz") {
    return NextResponse.json({ readingProgression: null, bookmarks: [] });
  }

  const { readingProgression } = extractCBZMetadata(filePath);
  const bookmarks = extractCBZPageBookmarks(filePath);
  return NextResponse.json({ readingProgression, bookmarks });
}
