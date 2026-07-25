// CLAUDE-ADDED: Shared between AnnotationsContent.tsx's list entries and NoteOverlay.tsx's header, so
// both display a note's timestamp in the same format.
export function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

// CLAUDE-ADDED: Date-only (no time-of-day) -- for the reading-history day buckets, which are already
// day-granularity (see DailyReadingBucket), unlike the moment-in-time timestamps formatTimestamp above
// is for. Takes a Date rather than a Date-constructible string/number so callers parse their own
// YYYY-MM-DD key explicitly instead of relying on Date's inconsistent string-parsing behavior.
export function formatDateOnly(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
