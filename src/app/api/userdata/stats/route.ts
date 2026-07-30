import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { getUserDir } from "@/next-lib/userData/paths";
import { getPublicationsDir } from "@/next-lib/userData/publicationsConfig";
import { readJsonFile } from "@/next-lib/userData/jsonStore";
import { StoredCompletedReadTime, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
import { UserStats } from "@/lib/userData/statsTypes";

export const runtime = "nodejs";

const LIBRARY_EXTENSIONS = [".epub", ".pdf", ".cbz"];
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

function sumArrayLengths(dir: string): number {
  return listJsonFiles(dir).reduce((sum, file) => {
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
  // this is library-wide size, not a per-user count of books owned.
  let booksInLibrary = 0;
  try {
    const publicationsDir = getPublicationsDir();
    booksInLibrary = (fs.readdirSync(publicationsDir, { recursive: true }) as string[])
      .filter(file =>
        LIBRARY_EXTENSIONS.includes(path.extname(file).toLowerCase()) &&
        fs.statSync(path.join(publicationsDir, file)).isFile()
      )
      .length;
  } catch {
    booksInLibrary = 0;
  }

  const booksStarted = listJsonFiles(path.join(userDir, "positions")).length;

  const highlightsCount = sumArrayLengths(path.join(userDir, "highlights"));
  const bookmarksCount = sumArrayLengths(path.join(userDir, "bookmarks"));
  const notesCount = sumArrayLengths(path.join(userDir, "notes"));

  // In-progress accumulated seconds, one number per book that's currently mid-read.
  const readingTimeDir = path.join(userDir, "readingTime");
  const inProgressSeconds = listJsonFiles(readingTimeDir).reduce((sum, file) => {
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
  for (const file of listJsonFiles(dailyHistoryDir)) {
    const buckets = readJsonFile<DailyReadingBucket[]>(path.join(dailyHistoryDir, file)) ?? [];
    dailyBuckets.push(...buckets);
  }

  const totalReadingSeconds = inProgressSeconds + completedSeconds;

  // CLAUDE-ADDED: deltaWords is progression * wordCount (a float), so the raw sum needs rounding
  // for display -- this is a "words read" count, not a rate, so it still counts every bucket.
  const totalWordsRead = Math.round(dailyBuckets.reduce((sum, bucket) => sum + bucket.words, 0));

  // CLAUDE-ADDED: Same sample-weighted rate as computeCurrentWpm's weightedRate (Σwords/Σseconds,
  // not an average of per-bucket rates), just over every day ever tracked instead of a rolling
  // per-book buffer. Unlike the live estimate, there are no individual samples left to run
  // computeCurrentWpm's median/MAD trim over -- buckets are already pre-summed per day -- so a
  // single sample that slipped past the per-sample jump-discard check (a ~5% progression jump
  // landing in a very short accumulated-seconds window, see JUMP_DISCARD_THRESHOLD in
  // useReadingSpeedSampler) can blow out that whole day's rate to thousands of wpm. The coarsest
  // safeguard available at this granularity is dropping any day whose own rate exceeds plausible
  // human reading speed from the pace average -- its words still count toward Words Read above,
  // just not toward the pace. null means no eligible day exists yet, not a rate of zero.
  const PLAUSIBLE_WPM_CEILING = 1000;
  const paceEligibleBuckets = dailyBuckets.filter(bucket =>
    bucket.seconds > 0 && (bucket.words / (bucket.seconds / 60)) <= PLAUSIBLE_WPM_CEILING
  );
  const paceWords = paceEligibleBuckets.reduce((sum, bucket) => sum + bucket.words, 0);
  const paceSeconds = paceEligibleBuckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const averageWpm = paceSeconds > 0 ? Math.round(paceWords / (paceSeconds / 60)) : null;

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
    notesCount
  };

  return NextResponse.json(stats);
}
