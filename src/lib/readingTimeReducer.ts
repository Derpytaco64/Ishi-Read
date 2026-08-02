import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { fetchReadingTimeFromServer, saveReadingTimeToServer } from "@/lib/userData/readingTimeApi";
import {
  fetchCompletedReadTimesFromServer,
  saveCompletedReadTimeToServer,
  deleteCompletedReadTimeFromServer
} from "@/lib/userData/completedReadTimesApi";
import { fetchWordCountFromServer, saveWordCountToServer } from "@/lib/userData/wordCountApi";
import { fetchGlobalReadingSpeedSamplesFromServer } from "@/lib/userData/readingSpeedApi";
import { fetchDailyReadingHistoryFromServer, saveDailyReadingHistoryToServer } from "@/lib/userData/dailyReadingHistoryApi";
import { StoredCompletedReadTime, ReadingSpeedSample, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
import type { AppDispatch, RootState } from "@/lib/store";

// CLAUDE-ADDED: Rolling cap on persisted speed samples -- old page-turns age out as new ones arrive
// so the estimate tracks recent pace rather than the whole book's history, and the persisted payload
// never grows unbounded.
export const MAX_SPEED_SAMPLES = 50;

export interface ReadingTimeReducerState {
  manifestUrl: string | null;
  accumulatedSeconds: number;
  isLoaded: boolean;
  completedReadTimes: StoredCompletedReadTime[];
  // CLAUDE-ADDED: null means "not computed/loaded yet" -- distinct from 0, which useBookWordCount
  // could legitimately report for a pathological empty resource set.
  wordCount: number | null;
  // CLAUDE-ADDED: Global (cross-book) rolling WPM sample buffer -- deliberately *not* reset by
  // setManifestUrl/resetReadingTimer/completeReadingTimer below, unlike every other field in this
  // slice. Switching books or resetting/completing a session used to wipe this and force the live pace
  // estimate back to "not enough data" until 5 fresh samples came in; keeping it global means the
  // estimate stays populated across both. speedSamplesLoaded guards the one-time fetch in
  // loadReadingTime so repeated book opens in the same session don't refetch it.
  speedSamples: ReadingSpeedSample[];
  speedSamplesLoaded: boolean;
  // CLAUDE-ADDED: Latest totalProgression seen, updated on every locator change (not just accepted
  // speed samples) -- the only thing the "time left in book" estimate needs beyond wordCount/wpm.
  currentProgression: number | null;
  // CLAUDE-ADDED: The *currently open* period's day-by-day buckets (see DailyReadingBucket) -- cleared
  // on both reset paths, archived onto the new StoredCompletedReadTime in the save-and-reset path.
  dailyReadingHistory: DailyReadingBucket[];
}

const initialState: ReadingTimeReducerState = {
  manifestUrl: null,
  accumulatedSeconds: 0,
  isLoaded: false,
  completedReadTimes: [],
  wordCount: null,
  speedSamples: [],
  speedSamplesLoaded: false,
  currentProgression: null,
  dailyReadingHistory: []
};

export const readingTimeSlice = createSlice({
  name: "readingTime",
  initialState,
  reducers: {
    setManifestUrl: (state, action: PayloadAction<string | null>) => {
      if (state.manifestUrl === action.payload) return;
      state.manifestUrl = action.payload;
      state.accumulatedSeconds = 0;
      state.isLoaded = false;
      state.completedReadTimes = [];
      state.wordCount = null;
      state.currentProgression = null;
      state.dailyReadingHistory = [];
    },
    setReadingTimeLoaded: (state, action: PayloadAction<{
      seconds: number;
      completedReadTimes: StoredCompletedReadTime[];
      wordCount: number | null;
      dailyReadingHistory: DailyReadingBucket[];
    }>) => {
      state.accumulatedSeconds = action.payload.seconds;
      state.completedReadTimes = action.payload.completedReadTimes;
      state.wordCount = action.payload.wordCount;
      state.dailyReadingHistory = action.payload.dailyReadingHistory;
      state.isLoaded = true;
    },
    incrementReadingSeconds: (state, action: PayloadAction<number>) => {
      state.accumulatedSeconds += action.payload;
    },
    resetAccumulatedSeconds: (state) => {
      state.accumulatedSeconds = 0;
    },
    upsertCompletedReadTime: (state, action: PayloadAction<StoredCompletedReadTime>) => {
      state.completedReadTimes = [...state.completedReadTimes, action.payload];
    },
    removeCompletedReadTimeState: (state, action: PayloadAction<string>) => {
      state.completedReadTimes = state.completedReadTimes.filter(item => item.id !== action.payload);
    },
    setWordCount: (state, action: PayloadAction<number>) => {
      state.wordCount = action.payload;
    },
    addSpeedSample: (state, action: PayloadAction<ReadingSpeedSample>) => {
      state.speedSamples = [...state.speedSamples, action.payload].slice(-MAX_SPEED_SAMPLES);
    },
    setSpeedSamples: (state, action: PayloadAction<ReadingSpeedSample[]>) => {
      state.speedSamples = action.payload;
      state.speedSamplesLoaded = true;
    },
    setCurrentProgression: (state, action: PayloadAction<number>) => {
      state.currentProgression = action.payload;
    },
    setDailyReadingHistory: (state, action: PayloadAction<DailyReadingBucket[]>) => {
      state.dailyReadingHistory = action.payload;
    }
  }
});

export const {
  setManifestUrl,
  setReadingTimeLoaded,
  incrementReadingSeconds,
  resetAccumulatedSeconds,
  upsertCompletedReadTime,
  removeCompletedReadTimeState,
  setWordCount,
  addSpeedSample,
  setSpeedSamples,
  setCurrentProgression,
  setDailyReadingHistory
} = readingTimeSlice.actions;

// CLAUDE-ADDED: Same "manifestUrl arrives URL-encoded from the route" decoding as annotationsReducer's
// loadAnnotations -- keeps state.readingTime.manifestUrl in the same clean form so it's directly usable
// as the fetch/save key everywhere else. Fetches the live accumulated total and the Completed Read Times
// history in parallel, same shape as loadAnnotations fetching highlights/bookmarks/notes together.
export const loadReadingTime = (rawManifestUrl: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
  const manifestUrl = decodeURIComponent(rawManifestUrl);
  dispatch(setManifestUrl(manifestUrl));

  const [seconds, completedReadTimes, wordCount, dailyReadingHistory] = await Promise.all([
    fetchReadingTimeFromServer(manifestUrl),
    fetchCompletedReadTimesFromServer(manifestUrl),
    fetchWordCountFromServer(manifestUrl),
    fetchDailyReadingHistoryFromServer(manifestUrl)
  ]);

  dispatch(setReadingTimeLoaded({ seconds: seconds ?? 0, completedReadTimes, wordCount, dailyReadingHistory }));

  // CLAUDE-ADDED: Global buffer, fetched once per session (guarded by speedSamplesLoaded) rather than
  // on every book open -- see the state field's own comment above.
  if (!getState().readingTime.speedSamplesLoaded) {
    const speedSamples = await fetchGlobalReadingSpeedSamplesFromServer();
    dispatch(setSpeedSamples(speedSamples));
  }
};

// CLAUDE-ADDED: Called once by useBookWordCount after it finishes the (one-time-ever) text-extraction
// scan -- a book's word count never changes, so this is the only write this value gets.
export const persistWordCount = (manifestUrl: string, wordCount: number) => (dispatch: AppDispatch) => {
  dispatch(setWordCount(wordCount));
  saveWordCountToServer(manifestUrl, wordCount);
};

// CLAUDE-ADDED: Discards the current session without archiving it -- the "No" path out of the reset
// confirmation dialog. The open period's daily buckets are discarded right along with the seconds
// they came from, same as the seconds themselves. Unlike the daily buckets, the rolling speed-sample
// buffer is *not* touched here -- it's global now (see the state field's own comment), so a reset on
// one book's session no longer blanks the live pace estimate.
export const resetReadingTimer = (manifestUrl: string) => (dispatch: AppDispatch) => {
  dispatch(resetAccumulatedSeconds());
  dispatch(setDailyReadingHistory([]));
  saveReadingTimeToServer(manifestUrl, 0);
  saveDailyReadingHistoryToServer(manifestUrl, []);
};

// CLAUDE-ADDED: The "Yes" path -- archives the current session as a Completed Read Time (with today's
// date), bundling in whatever daily buckets accumulated since the last reset (see DailyReadingBucket)
// so the Completed Reads tab can show them as this entry's own nested breakdown, then clears the live
// buckets. The rolling speed-sample buffer is left alone -- see resetReadingTimer's own comment.
export const completeReadingTimer = (manifestUrl: string, seconds: number) => (dispatch: AppDispatch, getState: () => RootState) => {
  const dailyHistory = getState().readingTime.dailyReadingHistory;

  const item: StoredCompletedReadTime = {
    id: crypto.randomUUID(),
    seconds,
    completedAt: Date.now(),
    dailyHistory
  };

  dispatch(upsertCompletedReadTime(item));
  saveCompletedReadTimeToServer(manifestUrl, item);

  dispatch(resetAccumulatedSeconds());
  dispatch(setDailyReadingHistory([]));
  saveReadingTimeToServer(manifestUrl, 0);
  saveDailyReadingHistoryToServer(manifestUrl, []);
};

// CLAUDE-ADDED: Removes a single archived session -- the confirmed path out of the per-item delete
// confirmation dialog. Same bundled local-update + server-persist shape as deleteBookmark etc.
export const deleteCompletedReadTime = (manifestUrl: string, id: string) => (dispatch: AppDispatch) => {
  dispatch(removeCompletedReadTimeState(id));
  deleteCompletedReadTimeFromServer(manifestUrl, id);
};

export default readingTimeSlice.reducer;
