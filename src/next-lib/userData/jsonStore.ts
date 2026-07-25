import fs from "fs";
import path from "path";
import crypto from "crypto";

export function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

// CLAUDE-ADDED: Write via a temp file + rename (same directory, so the rename is atomic on the same
// filesystem) so a crash or concurrent read mid-write never observes a partially-written JSON file.
export function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = path.join(dir, `.${ path.basename(filePath) }.${ crypto.randomUUID() }.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}
