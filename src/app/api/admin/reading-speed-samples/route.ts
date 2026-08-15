import { NextResponse } from "next/server";

import { getCurrentUser } from "@/next-lib/userData/session";
import { clearAllGlobalReadingSpeedSamples } from "@/next-lib/userData/readingSpeedSamplesAdmin";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only reset of every user's rolling WPM sample buffer (globalReadingSpeedSamples.json,
// see paths.ts) -- distinct from Orphaned Data Cleanup, which only touches per-book files for books no
// longer in the library. This buffer isn't tied to any book, so it needs its own admin action.
export async function DELETE() {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clearedCount = clearAllGlobalReadingSpeedSamples();

  return NextResponse.json({ clearedCount });
}
