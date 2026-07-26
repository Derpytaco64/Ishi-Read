import { NextResponse } from "next/server";

import { CURRENT_USER_ID, ensureUsersRegistry, getLibraryPrefsFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";

export const runtime = "nodejs";

export async function GET() {
  const libraryPrefs = readJsonFile(getLibraryPrefsFilePath(CURRENT_USER_ID));
  return NextResponse.json({ libraryPrefs });
}

// CLAUDE-ADDED: Shallow top-level merge, not an overwrite -- shelfPrefs, shelfOrder, coverSize,
// accentColor, and theme each save independently (see the hooks in src/app -- useCoverSize,
// useAccentColor, page.tsx, StatefulLibraryMenu), so a plain overwrite would let whichever saves
// last wipe out the others' keys.
export async function POST(request: Request) {
  const patch = await request.json().catch(() => null);

  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }

  ensureUsersRegistry();

  const filePath = getLibraryPrefsFilePath(CURRENT_USER_ID);
  const existing = readJsonFile<Record<string, unknown>>(filePath) ?? {};
  writeJsonFileAtomic(filePath, { ...existing, ...patch });

  return NextResponse.json({ ok: true });
}
