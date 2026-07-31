// CLAUDE-ADDED: Audiobook counterpart to readingTimeTypes.ts, deliberately much simpler -- there's no
// word count/wpm equivalent for audio (progress is already exact via the position locator's own
// totalProgression), and a completed listen only needs to answer "when did I start/finish this
// listen-through", not carry a duration or daily breakdown like StoredCompletedReadTime does.
export interface StoredCompletedListen {
  id: string;
  startedAt: number;
  completedAt: number;
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
