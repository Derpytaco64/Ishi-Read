import { readJsonFile, writeJsonFileAtomic } from "./jsonStore";
import {
  getPositionFilePath,
  getHighlightsFilePath,
  getBookmarksFilePath,
  getNotesFilePath,
  getReadingTimeFilePath,
  getCompletedReadTimesFilePath,
  getWordCountFilePath,
  getPageCountFilePath,
  getDailyReadingHistoryFilePath,
  getListeningTimeFilePath,
  getCompletedListensFilePath,
  getDailyListeningHistoryFilePath
} from "./paths";

// CLAUDE-ADDED: Every per-book UserData file getter from paths.ts except
// getGlobalReadingSpeedSamplesFilePath, which is a cross-book buffer keyed by user, not by
// bookHash -- there's nothing book-specific in it to migrate.
const PER_BOOK_FILE_GETTERS = [
  getPositionFilePath,
  getHighlightsFilePath,
  getBookmarksFilePath,
  getNotesFilePath,
  getReadingTimeFilePath,
  getCompletedReadTimesFilePath,
  getWordCountFilePath,
  getPageCountFilePath,
  getDailyReadingHistoryFilePath,
  getListeningTimeFilePath,
  getCompletedListensFilePath,
  getDailyListeningHistoryFilePath
];

// CLAUDE-ADDED: Copies every per-book UserData file (position, annotations, reading/listening time,
// completed reads/listens, word/page count) from sourceHash to destHash, overwriting whatever the
// destination already has. Used to carry a book's progress forward after a metadata edit changes its
// content hash (see resolveBookIdentity/computePartialMD5) and it ends up as a second library entry.
// The source file is left in place -- this is a copy, not a move -- since the caller decides
// separately whether the old library entry/file should be cleaned up.
export function migrateBookUserData(userId: string, sourceHash: string, destHash: string): void {
  for (const getFilePath of PER_BOOK_FILE_GETTERS) {
    const sourcePath = getFilePath(userId, sourceHash);
    const data = readJsonFile(sourcePath);
    // A type this book never used (e.g. no bookmarks yet) has no source file -- leave whatever the
    // destination already has for that type untouched rather than wiping it.
    if (data === null) continue;

    writeJsonFileAtomic(getFilePath(userId, destHash), data);
  }
}
