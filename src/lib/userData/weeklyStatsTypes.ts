// CLAUDE-ADDED: Shape returned by /api/userdata/stats/weekly -- last 7 local calendar days (oldest
// first), each day's reading/listening time split by book type for the stats page's stacked-by-type
// graph. Unlike UserStats (a whole-library lifetime aggregate), this is a fixed 7-row window.
export interface WeeklyBookTypeDay {
  date: string; // YYYY-MM-DD, local calendar day
  epubSeconds: number;
  comicSeconds: number;
  audiobookSeconds: number;
}

export interface WeeklyBookTypeStats {
  days: WeeklyBookTypeDay[];
}
