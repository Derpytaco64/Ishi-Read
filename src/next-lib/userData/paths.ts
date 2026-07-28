import fs from "fs";
import path from "path";

import { getUserDataDir } from "./publicationsConfig";

export { getUserDataDir };

// CLAUDE-ADDED: No auth system yet -- every request is attributed to this single stand-in user
// until real sessions land. Isolated here so swapping it for a session lookup later is a small diff.
export const CURRENT_USER_ID = "DT";

export function getUserDir(userId: string): string {
  return path.join(getUserDataDir(), userId);
}

export function getSettingsFilePath(userId: string): string {
  return path.join(getUserDir(userId), "settings.json");
}

// CLAUDE-ADDED: Deliberately a separate file from settings.json -- that one is fetched wholesale by
// the reader's Redux store (hydrateFromServer merges every top-level key straight into RootState),
// so library-page preferences (shelves, cover size, accent color, theme) can't share it without
// tripping combineReducers' unknown-key warning. This file is only ever read/written by the library
// page's own hooks.
export function getLibraryPrefsFilePath(userId: string): string {
  return path.join(getUserDir(userId), "libraryPrefs.json");
}

export function getPositionFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "positions", `${ bookHash }.json`);
}

export function getHighlightsFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "highlights", `${ bookHash }.json`);
}

export function getBookmarksFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "bookmarks", `${ bookHash }.json`);
}

export function getNotesFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "notes", `${ bookHash }.json`);
}

export function getReadingTimeFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "readingTime", `${ bookHash }.json`);
}

export function getCompletedReadTimesFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "completedReadTimes", `${ bookHash }.json`);
}

export function getWordCountFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "wordCount", `${ bookHash }.json`);
}

export function getPageCountFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "pageCount", `${ bookHash }.json`);
}

export function getReadingSpeedSamplesFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "readingSpeedSamples", `${ bookHash }.json`);
}

export function getDailyReadingHistoryFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "dailyReadingHistory", `${ bookHash }.json`);
}

function getUsersRegistryPath(): string {
  return path.join(getUserDataDir(), "users.json");
}

// CLAUDE-ADDED: Stub registry for a future auth system -- one real entry (DT) today, shape ready
// for more rows later. Created lazily on first write so a fresh install doesn't need manual setup.
export function ensureUsersRegistry(): void {
  const registryPath = getUsersRegistryPath();
  if (fs.existsSync(registryPath)) return;

  fs.mkdirSync(getUserDataDir(), { recursive: true });
  fs.writeFileSync(
    registryPath,
    JSON.stringify([{ id: CURRENT_USER_ID, name: "DT" }], null, 2)
  );
}
