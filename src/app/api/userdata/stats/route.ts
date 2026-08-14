import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { getUserDir } from "@/next-lib/userData/paths";
import { scanLibrary } from "@/next-lib/userData/bookIdentity";
import { readJsonFile } from "@/next-lib/userData/jsonStore";
import { StoredCompletedReadTime, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
import { StoredCompletedListen, StoredListeningTime } from "@/lib/userData/listeningTimeTypes";
import { UserStats } from "@/lib/userData/statsTypes";

export const runtime = "nodejs";

// CLAUDE-ADDED: Safety cap on the backward-walk below -- with real data the loop stops at the first
// gap day, this only guards against ever spinning on a pathological/corrupt dataset.
const MAX_STREAK_LOOKBACK_DAYS = 3650;

function listJsonFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(name => name.endsWith(".json"));
  } catch {
    return [];
  }
}

// CLAUDE-ADDED: Only files whose bookHash (the filename minus .json) still matches a book on disk --
// a file left behind by a book that's since been deleted/moved out of the library is orphaned data,
// and its counts/seconds/words shouldn't keep inflating a user's stats forever. See scanLibrary.
function listJsonFilesInLibrary(dir: string, libraryHashes: Set<string>): string[] {
  return listJsonFiles(dir).filter(file => libraryHashes.has(file.replace(/\.json$/, "")));
}

function sumArrayLengths(dir: string, libraryHashes: Set<string>): number {
  return listJsonFilesInLibrary(dir, libraryHashes).reduce((sum, file) => {
    const items = readJsonFile<unknown[]>(path.join(dir, file));
    return sum + (Array.isArray(items) ? items.length : 0);
  }, 0);
}

// CLAUDE-ADDED: Same local-calendar-day format DailyReadingBucket.date is written in (see
// useReadingSpeedSampler.ts's getLocalDateKey) -- this route and the client must agree on it since
// the streak walk below compares against dates the client already wrote.
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ year }-${ month }-${ day }`;
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userDir = getUserDir(userId);

  // CLAUDE-ADDED: The publications directory is shared by every user (see api/books/route.ts) --
  // booksInLibrary/audiobooksInLibrary are library-wide sizes, not a per-user count of books owned.
  // libraryHashes is the membership test every per-user hash-keyed collection below is filtered
  // through, so a file left behind by a book that's since been deleted/moved out of the library
  // (orphaned data) doesn't keep inflating these stats -- see scanLibrary.
  const { booksInLibrary, audiobooksInLibrary, audiobookHashes, libraryHashes } = scanLibrary();

  const positionHashes = listJsonFilesInLibrary(path.join(userDir, "positions"), libraryHashes)
    .map(file => file.replace(/\.json$/, ""));
  const booksStarted = positionHashes.filter(hash => !audiobookHashes.has(hash)).length;
  const audiobooksStarted = positionHashes.filter(hash => audiobookHashes.has(hash)).length;

  const highlightsCount = sumArrayLengths(path.join(userDir, "highlights"), libraryHashes);
  const bookmarksCount = sumArrayLengths(path.join(userDir, "bookmarks"), libraryHashes);
  const notesCount = sumArrayLengths(path.join(userDir, "notes"), libraryHashes);

  // In-progress accumulated seconds, one number per book that's currently mid-read.
  const readingTimeDir = path.join(userDir, "readingTime");
  const inProgressSeconds = listJsonFilesInLibrary(readingTimeDir, libraryHashes).reduce((sum, file) => {
    const seconds = readJsonFile<number>(path.join(readingTimeDir, file));
    return sum + (typeof seconds === "number" ? seconds : 0);
  }, 0);

  // CLAUDE-ADDED: Archived (completed-or-reset) sessions -- both their raw seconds and each
  // session's own daily breakdown, which is the only place words-read survives past a book's
  // rolling reading-speed buffer being cleared on completion (see completeReadingTimer).
  const completedReadTimesDir = path.join(userDir, "completedReadTimes");
  let completedSeconds = 0;
  let booksFinished = 0;
  const dailyBuckets: DailyReadingBucket[] = [];

  for (const file of listJsonFiles(completedReadTimesDir)) {
    // CLAUDE-ADDED: Defensive -- audiobooks never write to completedReadTimes (they get their own
    // completedListens, see below), but skip by hash anyway rather than assume that invariant holds.
    // Also skip anything orphaned by a since-deleted/moved book, same as every other dir below.
    const hash = file.replace(/\.json$/, "");
    if (audiobookHashes.has(hash) || !libraryHashes.has(hash)) continue;

    const entries = readJsonFile<StoredCompletedReadTime[]>(path.join(completedReadTimesDir, file)) ?? [];
    if (entries.length > 0) booksFinished++;
    for (const entry of entries) {
      completedSeconds += entry.seconds;
      if (entry.dailyHistory) dailyBuckets.push(...entry.dailyHistory);
    }
  }

  // The currently-open accumulation period for every book still being read (cleared to [] on
  // completion/reset, so this never overlaps with the archived buckets collected above).
  const dailyHistoryDir = path.join(userDir, "dailyReadingHistory");
  for (const file of listJsonFilesInLibrary(dailyHistoryDir, libraryHashes)) {
    const buckets = readJsonFile<DailyReadingBucket[]>(path.join(dailyHistoryDir, file)) ?? [];
    dailyBuckets.push(...buckets);
  }

  const totalReadingSeconds = inProgressSeconds + completedSeconds;

  // CLAUDE-ADDED: Same sample-weighted rate as computeCurrentWpm's weightedRate (Σwords/Σseconds,
  // not an average of per-bucket rates), just over every day ever tracked instead of a rolling
  // per-book buffer. Unlike the live estimate, there are no individual samples left to run
  // computeCurrentWpm's median/MAD trim over -- buckets are already pre-summed per day -- so a
  // single sample that slipped past the per-sample jump-discard check (a ~5% progression jump
  // landing in a very short accumulated-seconds window, see JUMP_DISCARD_THRESHOLD in
  // useReadingSpeedSampler) can blow out that whole day's rate to thousands of wpm. The coarsest
  // safeguard available at this granularity is dropping any day whose own rate exceeds plausible
  // human reading speed -- both from the pace average AND from Words Read below, since a day that
  // wasn't really read at that rate wasn't really read that many words either. null averageWpm means
  // no eligible day exists yet, not a rate of zero.
  const PLAUSIBLE_WPM_CEILING = 1000;
  const paceEligibleBuckets = dailyBuckets.filter(bucket =>
    bucket.seconds > 0 && (bucket.words / (bucket.seconds / 60)) <= PLAUSIBLE_WPM_CEILING
  );
  const paceWords = paceEligibleBuckets.reduce((sum, bucket) => sum + bucket.words, 0);
  const paceSeconds = paceEligibleBuckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const averageWpm = paceSeconds > 0 ? Math.round(paceWords / (paceSeconds / 60)) : null;

  // CLAUDE-ADDED: deltaWords is progression * wordCount (a float), so the raw sum needs rounding for
  // display. Summed over paceEligibleBuckets (not every dailyBucket) so the same implausible-rate days
  // excluded from averageWpm above don't inflate this count either.
  const totalWordsRead = Math.round(paceWords);

  // CLAUDE-ADDED: Current streak -- consecutive local calendar days, ending today, with any tracked
  // reading time on any book, merged by date across the whole library.
  const secondsByDate = new Map<string, number>();
  for (const bucket of dailyBuckets) {
    secondsByDate.set(bucket.date, (secondsByDate.get(bucket.date) ?? 0) + bucket.seconds);
  }

  let currentStreakDays = 0;
  const cursor = new Date();
  while (
    currentStreakDays < MAX_STREAK_LOOKBACK_DAYS &&
    (secondsByDate.get(getLocalDateKey(cursor)) ?? 0) > 0
  ) {
    currentStreakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // CLAUDE-ADDED: accumulatedSeconds is a lifetime total per book (see StoredListeningTime), so
  // unlike totalReadingSeconds above there's no separate "completed" bucket to add in -- summing
  // every book's own listeningTime file already covers both in-progress and finished audiobooks.
  const listeningTimeDir = path.join(userDir, "listeningTime");
  const totalListeningSeconds = listJsonFilesInLibrary(listeningTimeDir, libraryHashes).reduce((sum, file) => {
    const data = readJsonFile<StoredListeningTime>(path.join(listeningTimeDir, file));
    return sum + (typeof data?.accumulatedSeconds === "number" ? data.accumulatedSeconds : 0);
  }, 0);

  const completedListensDir = path.join(userDir, "completedListens");
  let audiobooksFinished = 0;
  for (const file of listJsonFilesInLibrary(completedListensDir, libraryHashes)) {
    const entries = readJsonFile<StoredCompletedListen[]>(path.join(completedListensDir, file)) ?? [];
    if (entries.length > 0) audiobooksFinished++;
  }

  const stats: UserStats = {
    booksInLibrary,
    booksStarted,
    booksFinished,
    totalReadingSeconds,
    totalWordsRead,
    averageWpm,
    currentStreakDays,
    highlightsCount,
    bookmarksCount,
    notesCount,
    audiobooksInLibrary,
    audiobooksStarted,
    audiobooksFinished,
    totalListeningSeconds
  };

  return NextResponse.json(stats);
}
