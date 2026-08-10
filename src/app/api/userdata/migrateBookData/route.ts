import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { migrateBookUserData } from "@/next-lib/userData/migrateBookData";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Carries a book's progress/annotations/reading-time forward onto a different library
// entry -- the scenario this exists for is a metadata edit rewriting the file's bytes, which changes
// its content hash (see resolveBookIdentity) and orphans all of the old entry's UserData under a hash
// no book resolves to anymore. Scoped entirely to the caller's own UserData dir via getCurrentUserId,
// same as every other userdata route -- no admin check needed.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sourceManifestUrl = body?.sourceManifestUrl;
  const destManifestUrl = body?.destManifestUrl;

  if (typeof sourceManifestUrl !== "string" || !sourceManifestUrl ||
      typeof destManifestUrl !== "string" || !destManifestUrl) {
    return NextResponse.json({ error: "sourceManifestUrl and destManifestUrl are required" }, { status: 400 });
  }

  const sourceHash = resolveBookIdentity(sourceManifestUrl);
  const destHash = resolveBookIdentity(destManifestUrl);

  if (sourceHash === destHash) {
    return NextResponse.json({ error: "Source and destination are the same book" }, { status: 400 });
  }

  migrateBookUserData(userId, sourceHash, destHash);

  return NextResponse.json({ ok: true });
}
