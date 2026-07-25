export interface StoredCompletedReadTime {
  id: string;
  seconds: number;
  completedAt: number;
  // CLAUDE-ADDED: The daily buckets accumulated between the previous reset and this one (see
  // DailyReadingBucket, and completeReadingTimer in readingTimeReducer.ts) -- what the Completed
  // Reads tab shows as an indented per-entry breakdown. Optional because entries saved before this
  // field existed have none.
  dailyHistory?: DailyReadingBucket[];
}

// CLAUDE-ADDED: One accepted reading-speed observation -- deltaWords/deltaSeconds between two
// consecutive locator samples (see useReadingSpeedSampler), already past the hard-discard checks
// (backward navigation, non-organic jumps). timestamp is when it was recorded, kept for potential
// future age-based pruning even though the rolling cap (MAX_SPEED_SAMPLES) is what trims it today.
export interface ReadingSpeedSample {
  deltaWords: number;
  deltaSeconds: number;
  timestamp: number;
}

// CLAUDE-ADDED: One calendar day's reading, for the Moon+-style "reading history in days" list --
// unlike ReadingSpeedSample (a rolling buffer for the live "current pace" estimate), these buckets
// belong to the *currently open* accumulation period: cleared on both reset paths (see
// resetReadingTimer/completeReadingTimer), archived onto the new StoredCompletedReadTime in the
// save-and-reset path. seconds/words are raw sums (not a precomputed wpm) so the day's own rate can
// be derived at render time the same way computeCurrentWpm derives the rolling one.
export interface DailyReadingBucket {
  date: string; // YYYY-MM-DD, local calendar day
  seconds: number;
  words: number;
  // CLAUDE-ADDED: Sum of deltaProgression across this day's accepted samples -- how much of the whole
  // book (0-1) was read *on this day*, not a cumulative "you were at X% by day's end" snapshot. The
  // "20%" column shows this, not a running total.
  progressionDelta: number;
}
