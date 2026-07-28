import fs from "fs";
import os from "os";
import path from "path";

// CLAUDE-ADDED: Shared between api/books/route.ts and the userData helpers so the library
// listing and the position/settings storage always agree on where publications live.
export const DEFAULT_PUBLICATIONS_DIR = "/home/deck/Documents/epubs";
export const DEFAULT_READIUM_SERVER_URL = "http://localhost:15080";
// CLAUDE-ADDED: Matches accentColorStorage.ts's DEFAULT_ACCENT_COLOR (the per-user library accent)
// so a first-ever install's login/admin screens look identical to before this was configurable --
// this is a deliberately separate, admin-only setting though, not read from that per-user value,
// since /login runs before any session exists and shouldn't depend on any one user's preference.
export const DEFAULT_LOGIN_ACCENT_COLOR = "#2f6fed";

// CLAUDE-ADDED: The book folder (and now the Readium server URL, accent color, etc.) are
// admin-configurable, so none of them can be plain exported constants -- all persist here, in a
// file outside PUBLICATIONS_DIR itself (changing the folder must never strand the file that
// remembers what the folder is).
const CONFIG_DIR = path.join(os.homedir(), ".config", "ishi-read");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function readConfigFileUncached(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// CLAUDE-ADDED: mtime-checked cache for the whole config file (a cheap fs.statSync on every call,
// only re-reading+parsing when the mtime actually changed) rather than a plain "cache forever,
// setters poke it" cache per field. That simpler version broke first-run setup: proxy.ts is
// bundled as its own separate module graph from the API routes (confirmed earlier with auth.ts's
// sessions/users cache, same root cause here) -- /api/setup's module instance would update *its
// own* cached value and the file on disk, but proxy.ts's already-warmed cache never saw it and
// kept redirecting to /setup forever within that server run. Checking mtime means any module
// instance picks up another instance's write on its very next call instead of never.
let cachedConfig: Record<string, unknown> | null = null;
let cachedConfigMtimeMs: number | null = null;

function readConfigFile(): Record<string, unknown> {
  let currentMtimeMs: number | null;
  try {
    currentMtimeMs = fs.statSync(CONFIG_FILE).mtimeMs;
  } catch {
    currentMtimeMs = null;
  }

  if (cachedConfig === null || currentMtimeMs !== cachedConfigMtimeMs) {
    cachedConfig = readConfigFileUncached();
    cachedConfigMtimeMs = currentMtimeMs;
  }

  return cachedConfig;
}

// CLAUDE-ADDED: Merges into the existing file rather than overwriting it -- config.json holds
// several independent keys, so a plain overwrite by whichever setter runs second would silently
// wipe out every other setting.
function writeConfigFile(patch: Record<string, unknown>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const merged = { ...readConfigFileUncached(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  // CLAUDE-ADDED: Updates this module instance's own cache immediately rather than waiting for the
  // next call's mtime check -- purely a micro-optimization (skips one redundant read+parse in the
  // same instance that just wrote), not required for correctness across instances.
  cachedConfig = merged;
  cachedConfigMtimeMs = null;
  try {
    cachedConfigMtimeMs = fs.statSync(CONFIG_FILE).mtimeMs;
  } catch {
    cachedConfigMtimeMs = null;
  }
}

export function getPublicationsDir(): string {
  const configured = readConfigFile().publicationsDir;
  return typeof configured === "string" ? configured : DEFAULT_PUBLICATIONS_DIR;
}

export function setPublicationsDir(dir: string): void {
  writeConfigFile({ publicationsDir: dir });
}

// CLAUDE-ADDED: Only the URL used to build/parse manifest links (see api/books/route.ts and
// bookIdentity.ts) -- this does NOT change what address/port the Readium server process itself
// binds to (see scripts/run-with-readium.mjs), so it's meant for pointing at a reverse proxy in
// front of that same local server, not for making the server itself listen elsewhere.
export function getReadiumServerUrl(): string {
  const configured = readConfigFile().readiumServerUrl;
  return typeof configured === "string" ? configured : DEFAULT_READIUM_SERVER_URL;
}

export function setReadiumServerUrl(url: string): void {
  writeConfigFile({ readiumServerUrl: url });
}

// CLAUDE-ADDED: Shared by /api/settings/readium-url and /api/setup so both validate the same way
// instead of two copies of this logic drifting apart. Trailing slash stripped so it concatenates
// cleanly with the "/webpub/..." path api/books/route.ts builds (a trailing slash would otherwise
// produce a double slash there).
export function normalizeReadiumUrl(url: string): { url?: string; error?: string } {
  const trimmed = url.trim().replace(/\/+$/, "");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "That doesn't look like a valid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "The URL must start with http:// or https://" };
  }

  return { url: trimmed };
}

// CLAUDE-ADDED: Drives both /login and /admin's --th-color-accent -- a single shared setting
// rather than two, since both pages render before/outside any per-user session and read it
// straight off disk server-side (no client fetch, no flash of the wrong color).
export function getLoginAccentColor(): string {
  const configured = readConfigFile().loginAccentColor;
  return typeof configured === "string" ? configured : DEFAULT_LOGIN_ACCENT_COLOR;
}

export function setLoginAccentColor(hex: string): void {
  writeConfigFile({ loginAccentColor: hex });
}

// CLAUDE-ADDED: Same WCAG relative-luminance formula/threshold as isLightColor in
// preferences/helpers/themeGeneration.ts, and layout.tsx's own inline duplicate of it -- that
// module transitively pulls in a "use client" file (useTheming.ts) plus a Canvas-based color
// library (colorthief), so it can't be imported into a plain server-rendered page like /login or
// /admin either. Keep this in sync with those two if the threshold ever changes.
function isLightColor(hex: string): boolean {
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179;
}

export function getLoginAccentTextColor(): string {
  return isLightColor(getLoginAccentColor()) ? "#101010" : "#fff";
}

// CLAUDE-ADDED: Defaults to a "UserData" folder nested inside the publications dir (unchanged
// behavior from before this was configurable) unless the user has explicitly set an independent
// location via the Settings panel -- see setUserDataDirOverride, which migrates existing data into
// the new location (src/app/api/settings/user-data-folder/route.ts does the actual file moving).
export function getUserDataDir(): string {
  const configured = readConfigFile().userDataDir;
  return typeof configured === "string" ? configured : path.join(getPublicationsDir(), "UserData");
}

export function setUserDataDirOverride(dir: string): void {
  writeConfigFile({ userDataDir: dir });
}

// CLAUDE-ADDED: Gates the whole app behind /setup (see proxy.ts) until an admin has chosen the
// books folder/userData folder/Readium URL, for a genuinely fresh install with nothing configured
// yet. An install that predates this flag (like this repo's own dev instance) already has a real
// users.json -- that's treated as proof setup already happened, so an existing, already-in-use
// install is never unexpectedly forced through the wizard on its next start.
export function isSetupCompleted(): boolean {
  if (readConfigFile().setupCompleted === true) return true;

  const alreadyHasUsers = fs.existsSync(path.join(getUserDataDir(), "users.json"));
  if (alreadyHasUsers) writeConfigFile({ setupCompleted: true });
  return alreadyHasUsers;
}

export function markSetupCompleted(): void {
  writeConfigFile({ setupCompleted: true });
}
