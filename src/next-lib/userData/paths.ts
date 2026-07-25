import fs from "fs";
import path from "path";

import { PUBLICATIONS_DIR } from "./publicationsConfig";

export const USER_DATA_DIR = path.join(PUBLICATIONS_DIR, "UserData");

// CLAUDE-ADDED: No auth system yet -- every request is attributed to this single stand-in user
// until real sessions land. Isolated here so swapping it for a session lookup later is a small diff.
export const CURRENT_USER_ID = "DT";

export function getUserDir(userId: string): string {
  return path.join(USER_DATA_DIR, userId);
}

export function getSettingsFilePath(userId: string): string {
  return path.join(getUserDir(userId), "settings.json");
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

export function getReadingSpeedSamplesFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "readingSpeedSamples", `${ bookHash }.json`);
}

export function getDailyReadingHistoryFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "dailyReadingHistory", `${ bookHash }.json`);
}

function getUsersRegistryPath(): string {
  return path.join(USER_DATA_DIR, "users.json");
}

// CLAUDE-ADDED: Stub registry for a future auth system -- one real entry (DT) today, shape ready
// for more rows later. Created lazily on first write so a fresh install doesn't need manual setup.
export function ensureUsersRegistry(): void {
  const registryPath = getUsersRegistryPath();
  if (fs.existsSync(registryPath)) return;

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(
    registryPath,
    JSON.stringify([{ id: CURRENT_USER_ID, name: "DT" }], null, 2)
  );
}
