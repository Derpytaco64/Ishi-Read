import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { getCurrentUserId } from "@/next-lib/userData/session";
import { getUserDir } from "@/next-lib/userData/paths";
import { scanLibrary } from "@/next-lib/userData/bookIdentity";
import { readJsonFile } from "@/next-lib/userData/jsonStore";
import { StoredCompletedReadTime, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
import { StoredCompletedListen, DailyListeningBucket } from "@/lib/userData/listeningTimeTypes";
import { WeeklyBookTypeDay, WeeklyBookTypeStats } from "@/lib/userData/weeklyStatsTypes";

export const runtime = "nodejs";

const WINDOW_DAYS = 7;

// CLAUDE-ADDED: Same local-calendar-day format DailyReadingBucket/DailyListeningBucket.date are
// written in (see stats/route.ts's own copy of this helper) -- this route and the client must agree
// on it since the window below compares against dates the client already wrote.
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ year }-${ month }-${ day }`;
}

function listJsonFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(name => name.endsWith(".json"));
  } catch {
    return [];
  }
}

function listJsonFilesInLibrary(dir: string, libraryHashes: Set<string>): string[] {
  return listJsonFiles(dir).filter(file => libraryHashes.has(file.replace(/\.json$/, "")));
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userDir = getUserDir(userId);
  const { audiobookHashes, comicHashes, libraryHashes } = scanLibrary();

  // CLAUDE-ADDED: Oldest-first window of the last WINDOW_DAYS local calendar days, today inclusive --
  // the fixed set of rows the response always returns, regardless of how much (if any) tracked data
  // falls on a given day.
  const windowDates: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (WINDOW_DAYS - 1));
  for (let i = 0; i < WINDOW_DAYS; i++) {
    windowDates.push(getLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const secondsByDate = new Map<string, { epub: number; comic: number; audiobook: number }>();
  for (const date of windowDates) secondsByDate.set(date, { epub: 0, comic: 0, audiobook: 0 });

  function creditReading(hash: string, buckets: DailyReadingBucket[]) {
    const field = comicHashes.has(hash) ? "comic" : "epub";
    for (const bucket of buckets) {
      const row = secondsByDate.get(bucket.date);
      if (row) row[field] += bucket.seconds;
    }
  }

  function creditListening(buckets: DailyListeningBucket[]) {
    for (const bucket of buckets) {
      const row = secondsByDate.get(bucket.date);
      if (row) row.audiobook += bucket.seconds;
    }
  }

  // Archived (completed-or-reset) reading sessions, same source stats/route.ts sums for lifetime
  // totals -- here only each session's own dailyHistory buckets matter.
  const completedReadTimesDir = path.join(userDir, "completedReadTimes");
  for (const file of listJsonFiles(completedReadTimesDir)) {
    const hash = file.replace(/\.json$/, "");
    if (audiobookHashes.has(hash) || !libraryHashes.has(hash)) continue;

    const entries = readJsonFile<StoredCompletedReadTime[]>(path.join(completedReadTimesDir, file)) ?? [];
    for (const entry of entries) {
      if (entry.dailyHistory) creditReading(hash, entry.dailyHistory);
    }
  }

  // The currently-open reading accumulation period for every book still being read.
  const dailyReadingHistoryDir = path.join(userDir, "dailyReadingHistory");
  for (const file of listJsonFilesInLibrary(dailyReadingHistoryDir, libraryHashes)) {
    const hash = file.replace(/\.json$/, "");
    const buckets = readJsonFile<DailyReadingBucket[]>(path.join(dailyReadingHistoryDir, file)) ?? [];
    creditReading(hash, buckets);
  }

  // Archived (completed) listen-throughs -- each one's own dailyHistory buckets.
  const completedListensDir = path.join(userDir, "completedListens");
  for (const file of listJsonFilesInLibrary(completedListensDir, libraryHashes)) {
    const entries = readJsonFile<StoredCompletedListen[]>(path.join(completedListensDir, file)) ?? [];
    for (const entry of entries) {
      if (entry.dailyHistory) creditListening(entry.dailyHistory);
    }
  }

  // The currently-open listening accumulation period for every audiobook still being listened to.
  const dailyListeningHistoryDir = path.join(userDir, "dailyListeningHistory");
  for (const file of listJsonFilesInLibrary(dailyListeningHistoryDir, libraryHashes)) {
    const buckets = readJsonFile<DailyListeningBucket[]>(path.join(dailyListeningHistoryDir, file)) ?? [];
    creditListening(buckets);
  }

  const days: WeeklyBookTypeDay[] = windowDates.map(date => {
    const row = secondsByDate.get(date)!;
    return { date, epubSeconds: row.epub, comicSeconds: row.comic, audiobookSeconds: row.audiobook };
  });

  const stats: WeeklyBookTypeStats = { days };
  return NextResponse.json(stats);
}
