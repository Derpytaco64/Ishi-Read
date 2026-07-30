import { NextResponse } from "next/server";

import { getLibraryPrefsFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const libraryPrefs = readJsonFile(getLibraryPrefsFilePath(userId));
  return NextResponse.json({ libraryPrefs });
}

// CLAUDE-ADDED: Shallow top-level merge, not an overwrite -- shelfPrefs, shelfOrder,
// accentColor, and theme each save independently (see the hooks in src/app --
// useAccentColor, page.tsx, StatefulLibraryMenu), so a plain overwrite would let whichever saves
// last wipe out the others' keys.
//
// CLAUDE-ADDED: The read-modify-write itself is serialized through this module-level queue -- those
// same independent hooks can all patch different fields within the same tick (e.g. on first load,
// each seeding the server with a field it found missing), and without serializing, two concurrent
// requests could both read the same pre-patch `existing` and each write back a version missing the
// other's field, silently dropping it.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch = await request.json().catch(() => null);

  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ error: "A JSON object is required" }, { status: 400 });
  }

  const filePath = getLibraryPrefsFilePath(userId);
  writeQueue = writeQueue.then(() => {
    const existing = readJsonFile<Record<string, unknown>>(filePath) ?? {};
    writeJsonFileAtomic(filePath, { ...existing, ...patch });
  });
  await writeQueue;

  return NextResponse.json({ ok: true });
}
