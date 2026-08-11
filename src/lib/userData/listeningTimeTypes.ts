// CLAUDE-ADDED: Audiobook counterpart to readingTimeTypes.ts, deliberately much simpler -- there's no
// word count/wpm equivalent for audio (progress is already exact via the position locator's own
// totalProgression), so DailyListeningBucket below carries seconds + progressionDelta only, no words.
export interface StoredCompletedListen {
  id: string;
  startedAt: number;
  completedAt: number;
  // CLAUDE-ADDED: The daily buckets accumulated during this listen-through (see
  // DailyListeningBucket, cleared once archived here) -- audiobook counterpart of
  // StoredCompletedReadTime's own dailyHistory. Optional because entries saved before this field
  // existed have none.
  dailyHistory?: DailyListeningBucket[];
}

// CLAUDE-ADDED: One calendar day's listening, for the same Moon+-style "history in days" list
// DailyReadingBucket backs -- seconds is raw elapsed listening time; progressionDelta is how much
// of the whole audiobook (0-1) was listened through *on this day*, not a cumulative snapshot.
export interface DailyListeningBucket {
  date: string; // YYYY-MM-DD, local calendar day
  seconds: number;
  progressionDelta: number;
}

// CLAUDE-ADDED: accumulatedSeconds is a lifetime total for this book (unlike readingTime's own
// accumulatedSeconds, it is never reset on completion -- see completeListen in
// listeningTimeReducer.ts) so the stats page's "time listened" figure survives repeat listens.
// startedAt is the current listen-through's start marker, null when nothing is currently in
// progress (never started, or the last listen-through was already archived).
export interface StoredListeningTime {
  accumulatedSeconds: number;
  startedAt: number | null;
}
