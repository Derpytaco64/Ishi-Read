import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { getUserDataDir, setUserDataDirOverride } from "@/next-lib/userData/publicationsConfig";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ userDataFolder: getUserDataDir() });
}

// CLAUDE-ADDED: True when child is nested anywhere inside parent (or is parent itself) -- used to
// reject a new folder that's inside the current one (or vice versa). Without this,
// mkdirSync(newDir) would create newDir *inside* oldDir when newDir is a subpath of it, and the
// loop below would then try to copy that very folder into itself (ERR_FS_CP_EINVAL) once
// readdirSync(oldDir) picked it up as one of oldDir's own entries.
function isSameOrSubPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// CLAUDE-ADDED: Moves everything out of oldDir into newDir (creating newDir first) rather than a
// plain fs.renameSync -- rename() alone fails across filesystems/mount points (EXDEV), and could
// also collide with same-named entries already sitting in newDir, so each top-level entry falls
// back to a recursive copy+remove when a direct rename doesn't work. oldDir itself is left in
// place (now empty) rather than removed -- only its contents move.
function moveDirContents(oldDir: string, newDir: string): void {
  fs.mkdirSync(newDir, { recursive: true });

  for (const entry of fs.readdirSync(oldDir)) {
    const src = path.join(oldDir, entry);
    const dest = path.join(newDir, entry);

    try {
      fs.renameSync(src, dest);
    } catch {
      fs.cpSync(src, dest, { recursive: true, force: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userDataFolder = body?.userDataFolder;

  if (typeof userDataFolder !== "string" || userDataFolder.trim() === "") {
    return NextResponse.json({ error: "A folder path is required" }, { status: 400 });
  }

  const trimmed = userDataFolder.trim();
  const currentDir = getUserDataDir();
  const resolvedCurrent = path.resolve(currentDir);
  const resolvedNext = path.resolve(trimmed);

  if (resolvedNext === resolvedCurrent) {
    return NextResponse.json({ userDataFolder: trimmed });
  }

  if (isSameOrSubPath(resolvedCurrent, resolvedNext) || isSameOrSubPath(resolvedNext, resolvedCurrent)) {
    return NextResponse.json({
      error: "The new folder can't be inside the current one, or contain it"
    }, { status: 400 });
  }

  if (fs.existsSync(trimmed) && !fs.statSync(trimmed).isDirectory()) {
    return NextResponse.json({ error: "That path isn't a folder" }, { status: 400 });
  }

  // CLAUDE-ADDED: Migrate existing data into the new location *before* persisting the config
  // change below -- if this throws, the app keeps pointing at the old (still-intact) folder
  // instead of ending up configured to look somewhere that doesn't actually have the data.
  try {
    if (fs.existsSync(currentDir)) {
      moveDirContents(currentDir, trimmed);
    } else {
      fs.mkdirSync(trimmed, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to migrate user data folder:", error);
    return NextResponse.json({ error: "Failed to move existing data to the new folder" }, { status: 500 });
  }

  setUserDataDirOverride(trimmed);

  return NextResponse.json({ userDataFolder: trimmed });
}
