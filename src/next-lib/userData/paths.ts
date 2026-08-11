import path from "path";

import { getUserDataDir } from "./publicationsConfig";

export { getUserDataDir };

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

// CLAUDE-ADDED: Unlike the other per-book files above, this is a single file per user, not one per
// bookHash -- the rolling WPM sample buffer is a cross-book pace estimate (see readingTimeReducer.ts),
// not tied to any one book's progress.
export function getGlobalReadingSpeedSamplesFilePath(userId: string): string {
  return path.join(getUserDir(userId), "globalReadingSpeedSamples.json");
}

export function getDailyReadingHistoryFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "dailyReadingHistory", `${ bookHash }.json`);
}

export function getListeningTimeFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "listeningTime", `${ bookHash }.json`);
}

export function getCompletedListensFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "completedListens", `${ bookHash }.json`);
}

export function getDailyListeningHistoryFilePath(userId: string, bookHash: string): string {
  return path.join(getUserDir(userId), "dailyListeningHistory", `${ bookHash }.json`);
}

