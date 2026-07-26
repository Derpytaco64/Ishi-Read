import fs from "fs";
import os from "os";
import path from "path";

// CLAUDE-ADDED: Shared between api/books/route.ts and the userData helpers so the library
// listing and the position/settings storage always agree on where publications live.
export const DEFAULT_PUBLICATIONS_DIR = "/home/deck/Documents/epubs";
export const READIUM_SERVER_URL = "http://localhost:15080";

// CLAUDE-ADDED: The book folder is now user-configurable from the Settings panel, so it can no
// longer be a plain exported constant -- it's persisted here, in a file outside PUBLICATIONS_DIR
// itself (changing the folder must never strand the file that remembers what the folder is).
const CONFIG_DIR = path.join(os.homedir(), ".config", "ishi-read");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

let cachedDir: string | null = null;

function readConfiguredDir(): string | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed?.publicationsDir === "string" ? parsed.publicationsDir : null;
  } catch {
    return null;
  }
}

export function getPublicationsDir(): string {
  if (cachedDir === null) {
    cachedDir = readConfiguredDir() ?? DEFAULT_PUBLICATIONS_DIR;
  }
  return cachedDir;
}

export function setPublicationsDir(dir: string): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ publicationsDir: dir }, null, 2));
  cachedDir = dir;
}
