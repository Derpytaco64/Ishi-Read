import { NextResponse } from "next/server";

import { getCurrentUser } from "@/next-lib/userData/session";
import { findOrphanedData, deleteOrphanedData } from "@/next-lib/userData/orphanedData";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only preview of per-user data (positions, annotations, reading/listening time,
// etc.) left behind by books no longer in the library -- same shape as DELETE below returns, so the
// admin panel can show one preview list before AND after confirming the actual delete.
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(findOrphanedData());
}

// CLAUDE-ADDED: Actually deletes the orphaned files -- re-scans rather than trusting a client-supplied
// list, so this can never be tricked into deleting more (or less) than what's genuinely orphaned right
// now. Returns the same report shape as GET so the admin panel can confirm exactly what was removed.
export async function DELETE() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(deleteOrphanedData());
}
