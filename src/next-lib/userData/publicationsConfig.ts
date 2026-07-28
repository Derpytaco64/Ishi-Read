import fs from "fs";
import os from "os";
import path from "path";

// CLAUDE-ADDED: Shared between api/books/route.ts and the userData helpers so the library
// listing and the position/settings storage always agree on where publications live.
export const DEFAULT_PUBLICATIONS_DIR = "/home/deck/Documents/epubs";
export const DEFAULT_READIUM_SERVER_URL = "http://localhost:15080";

// CLAUDE-ADDED: The book folder (and now the Readium server URL) are user-configurable from the
// Settings panel, so neither can be a plain exported constant -- both persist here, in a file
// outside PUBLICATIONS_DIR itself (changing the folder must never strand the file that remembers
// what the folder is).
const CONFIG_DIR = path.join(os.homedir(), ".config", "ishi-read");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

let cachedDir: string | null = null;
let cachedReadiumUrl: string | null = null;
// CLAUDE-ADDED: undefined = "haven't checked the config file yet", null = "checked, no override
// configured" -- distinct from cachedDir/cachedReadiumUrl above because the *un-overridden* value
// isn't a fixed default here, it's derived from getPublicationsDir() and needs to keep tracking
// that if the book folder changes later and no explicit UserData folder override was ever set.
let cachedUserDataDirOverride: string | null | undefined = undefined;

function readConfigFile(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// CLAUDE-ADDED: Merges into the existing file rather than overwriting it -- config.json now holds
// two independent keys (publicationsDir, readiumServerUrl), so a plain overwrite by whichever
// setter runs second would silently wipe out the other setting.
function writeConfigFile(patch: Record<string, unknown>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const merged = { ...readConfigFile(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getPublicationsDir(): string {
  if (cachedDir === null) {
    const configured = readConfigFile().publicationsDir;
    cachedDir = typeof configured === "string" ? configured : DEFAULT_PUBLICATIONS_DIR;
  }
  return cachedDir;
}

export function setPublicationsDir(dir: string): void {
  writeConfigFile({ publicationsDir: dir });
  cachedDir = dir;
}

// CLAUDE-ADDED: Only the URL used to build/parse manifest links (see api/books/route.ts and
// bookIdentity.ts) -- this does NOT change what address/port the Readium server process itself
// binds to (see scripts/run-with-readium.mjs), so it's meant for pointing at a reverse proxy in
// front of that same local server, not for making the server itself listen elsewhere.
export function getReadiumServerUrl(): string {
  if (cachedReadiumUrl === null) {
    const configured = readConfigFile().readiumServerUrl;
    cachedReadiumUrl = typeof configured === "string" ? configured : DEFAULT_READIUM_SERVER_URL;
  }
  return cachedReadiumUrl;
}

export function setReadiumServerUrl(url: string): void {
  writeConfigFile({ readiumServerUrl: url });
  cachedReadiumUrl = url;
}

// CLAUDE-ADDED: Defaults to a "UserData" folder nested inside the publications dir (unchanged
// behavior from before this was configurable) unless the user has explicitly set an independent
// location via the Settings panel -- see setUserDataDirOverride, which migrates existing data into
// the new location (src/app/api/settings/user-data-folder/route.ts does the actual file moving).
export function getUserDataDir(): string {
  if (cachedUserDataDirOverride === undefined) {
    const configured = readConfigFile().userDataDir;
    cachedUserDataDirOverride = typeof configured === "string" ? configured : null;
  }
  return cachedUserDataDirOverride ?? path.join(getPublicationsDir(), "UserData");
}

export function setUserDataDirOverride(dir: string): void {
  writeConfigFile({ userDataDir: dir });
  cachedUserDataDirOverride = dir;
}
