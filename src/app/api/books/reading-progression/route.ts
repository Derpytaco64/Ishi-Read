import { NextResponse } from "next/server";
import path from "path";

import { resolveLocalFile } from "@/next-lib/userData/bookIdentity";
import { getCurrentUserId } from "@/next-lib/userData/session";
import { extractCBZMetadata } from "@/next-lib/comicInfo";

export const runtime = "nodejs";

// CLAUDE-ADDED: usePublication.ts fetches the reading manifest straight from the bundled Go readium
// server (no Next.js server in between) -- so it can't read ComicInfo.xml's <Manga> tag itself. This
// gives the client a way to ask, right before it builds the Publication object, whether the CBZ this
// manifest belongs to should read right-to-left, so it can patch the manifest metadata before
// @readium/navigator's page-turn logic ever looks at it.
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
    return NextResponse.json({ readingProgression: null });
  }

  const { readingProgression } = extractCBZMetadata(filePath);
  return NextResponse.json({ readingProgression });
}
