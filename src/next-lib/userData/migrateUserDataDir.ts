import fs from "fs";
import path from "path";

// CLAUDE-ADDED: Shared by /api/settings/user-data-folder (ongoing admin changes) and /api/setup
// (first-run) so there's exactly one implementation of "move existing user data to a new folder,
// safely" instead of two copies of this fs-move logic that could drift apart.

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

// CLAUDE-ADDED: Returns {} on success, { error } on a rejected/failed move -- callers persist the
// config change themselves, and only after this returns cleanly (so a failed move never leaves the
// app pointing at a folder that doesn't actually have the data).
export function migrateUserDataDir(currentDir: string, nextDir: string): { error?: string } {
  const resolvedCurrent = path.resolve(currentDir);
  const resolvedNext = path.resolve(nextDir);

  if (resolvedNext === resolvedCurrent) return {};

  if (isSameOrSubPath(resolvedCurrent, resolvedNext) || isSameOrSubPath(resolvedNext, resolvedCurrent)) {
    return { error: "The new folder can't be inside the current one, or contain it" };
  }

  if (fs.existsSync(nextDir) && !fs.statSync(nextDir).isDirectory()) {
    return { error: "That path isn't a folder" };
  }

  try {
    if (fs.existsSync(currentDir)) {
      moveDirContents(currentDir, nextDir);
    } else {
      fs.mkdirSync(nextDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to migrate user data folder:", error);
    return { error: "Failed to move existing data to the new folder" };
  }

  return {};
}
