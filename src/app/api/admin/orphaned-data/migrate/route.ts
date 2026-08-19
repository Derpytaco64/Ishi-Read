import { NextResponse } from "next/server";

import { getCurrentUser } from "@/next-lib/userData/session";
import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { migrateOrphanedBookData } from "@/next-lib/userData/orphanedData";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only counterpart to DELETE /api/admin/orphaned-data -- instead of discarding
// an orphaned book's UserData, carries it onto a live library entry (see migrateOrphanedBookData).
// Admin-gated (unlike /api/userdata/migrateBookData, which is self-service) because sourceHash
// belongs to *another* user's UserData dir, identified from the admin's own orphaned-data scan
// rather than something the caller can already prove ownership of via their own session.
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const sourceHash = body?.sourceHash;
  const destManifestUrl = body?.destManifestUrl;

  if (typeof userId !== "string" || !userId ||
      typeof sourceHash !== "string" || !sourceHash ||
      typeof destManifestUrl !== "string" || !destManifestUrl) {
    return NextResponse.json({ error: "userId, sourceHash and destManifestUrl are required" }, { status: 400 });
  }

  const destHash = resolveBookIdentity(destManifestUrl);
  const result = migrateOrphanedBookData(userId, sourceHash, destHash);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
