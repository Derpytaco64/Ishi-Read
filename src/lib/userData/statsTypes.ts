// CLAUDE-ADDED: Shape returned by /api/userdata/stats -- a whole-library aggregate for the current
// user (unlike every other userData type here, which is keyed to a single book).
export interface UserStats {
  booksInLibrary: number;
  booksStarted: number;
  booksFinished: number;
  totalReadingSeconds: number;
  totalWordsRead: number;
  // CLAUDE-ADDED: null means no organic reading-speed samples exist yet (see computeCurrentWpm's
  // same convention), not a rate of zero.
  averageWpm: number | null;
  currentStreakDays: number;
  highlightsCount: number;
  bookmarksCount: number;
  notesCount: number;
  // CLAUDE-ADDED: Audiobook counterparts to the ebook fields above -- deliberately kept separate
  // (not folded into booksInLibrary/booksStarted/etc.) so the stats page can show them as their own
  // section instead of mixing formats. See listeningTimeTypes.ts for why there's no averageWpm/
  // totalWordsRead/currentStreakDays equivalent here.
  audiobooksInLibrary: number;
  audiobooksStarted: number;
  audiobooksFinished: number;
  totalListeningSeconds: number;
}
