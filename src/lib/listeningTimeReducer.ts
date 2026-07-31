import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { fetchListeningTimeFromServer, saveListeningTimeToServer } from "@/lib/userData/listeningTimeApi";
import {
  fetchCompletedListensFromServer,
  saveCompletedListenToServer,
  deleteCompletedListenFromServer
} from "@/lib/userData/completedListensApi";
import { StoredCompletedListen } from "@/lib/userData/listeningTimeTypes";
import type { AppDispatch, RootState } from "@/lib/store";

// CLAUDE-ADDED: Audiobook counterpart to readingTimeReducer.ts -- deliberately simpler, no
// wordCount/speedSamples/dailyHistory equivalents (see listeningTimeTypes.ts). The one structural
// difference from the reading-time model: accumulatedSeconds here is a *lifetime* total for the book,
// never reset on completion, so a Completed Listen archives only {startedAt, completedAt} (per the
// user's own request) without losing "total time listened" for the stats page across repeat listens.
export interface ListeningTimeReducerState {
  manifestUrl: string | null;
  accumulatedSeconds: number;
  // CLAUDE-ADDED: The current listen-through's start marker -- null means nothing is currently in
  // progress (never started, or the last listen-through was already archived/discarded). Set once,
  // the first time playback starts after a load/reset (see ensureListenStarted below).
  startedAt: number | null;
  isLoaded: boolean;
  completedListens: StoredCompletedListen[];
}

const initialState: ListeningTimeReducerState = {
  manifestUrl: null,
  accumulatedSeconds: 0,
  startedAt: null,
  isLoaded: false,
  completedListens: []
};

export const listeningTimeSlice = createSlice({
  name: "listeningTime",
  initialState,
  reducers: {
    setManifestUrl: (state, action: PayloadAction<string | null>) => {
      if (state.manifestUrl === action.payload) return;
      state.manifestUrl = action.payload;
      state.accumulatedSeconds = 0;
      state.startedAt = null;
      state.isLoaded = false;
      state.completedListens = [];
    },
    setListeningTimeLoaded: (state, action: PayloadAction<{
      accumulatedSeconds: number;
      startedAt: number | null;
      completedListens: StoredCompletedListen[];
    }>) => {
      state.accumulatedSeconds = action.payload.accumulatedSeconds;
      state.startedAt = action.payload.startedAt;
      state.completedListens = action.payload.completedListens;
      state.isLoaded = true;
    },
    incrementListeningSeconds: (state, action: PayloadAction<number>) => {
      state.accumulatedSeconds += action.payload;
    },
    setStartedAt: (state, action: PayloadAction<number | null>) => {
      state.startedAt = action.payload;
    },
    upsertCompletedListen: (state, action: PayloadAction<StoredCompletedListen>) => {
      state.completedListens = [...state.completedListens, action.payload];
    },
    removeCompletedListenState: (state, action: PayloadAction<string>) => {
      state.completedListens = state.completedListens.filter(item => item.id !== action.payload);
    }
  }
});

export const {
  setManifestUrl,
  setListeningTimeLoaded,
  incrementListeningSeconds,
  setStartedAt,
  upsertCompletedListen,
  removeCompletedListenState
} = listeningTimeSlice.actions;

// CLAUDE-ADDED: Same decode-and-load shape as readingTimeReducer's loadReadingTime -- dispatched
// unconditionally alongside it from the reader shell pages regardless of format (see
// read/[identifier]/page.tsx and read/manifest/[manifest]/page.tsx), and simply unused for ebooks the
// same way loadReadingTime's data is unused for audiobooks -- only StatefulPlayer ever mounts
// useListeningTimer or dispatches ensureListenStarted/completeListen.
export const loadListeningTime = (rawManifestUrl: string) => async (dispatch: AppDispatch) => {
  const manifestUrl = decodeURIComponent(rawManifestUrl);
  dispatch(setManifestUrl(manifestUrl));

  const [listeningTime, completedListens] = await Promise.all([
    fetchListeningTimeFromServer(manifestUrl),
    fetchCompletedListensFromServer(manifestUrl)
  ]);

  dispatch(setListeningTimeLoaded({
    accumulatedSeconds: listeningTime?.accumulatedSeconds ?? 0,
    startedAt: listeningTime?.startedAt ?? null,
    completedListens
  }));
};

const persistListeningTime = (manifestUrl: string) => (_dispatch: AppDispatch, getState: () => RootState) => {
  const { accumulatedSeconds, startedAt } = getState().listeningTime;
  saveListeningTimeToServer(manifestUrl, { accumulatedSeconds, startedAt });
};

// CLAUDE-ADDED: Called from StatefulPlayer's `play` listener -- a no-op once startedAt is already set,
// so it's safe to call on every play event rather than just the first one for a book.
export const ensureListenStarted = (manifestUrl: string) => (dispatch: AppDispatch, getState: () => RootState) => {
  if (getState().listeningTime.startedAt !== null) return;

  dispatch(setStartedAt(Date.now()));
  dispatch(persistListeningTime(manifestUrl));
};

// CLAUDE-ADDED: The manual "Reset" path -- abandons the current start marker without archiving a
// Completed Listen (e.g. the user pressed play by mistake). accumulatedSeconds is left untouched,
// unlike resetReadingTimer -- it's a lifetime total here, not a per-session counter.
export const discardListenStart = (manifestUrl: string) => (dispatch: AppDispatch) => {
  dispatch(setStartedAt(null));
  dispatch(persistListeningTime(manifestUrl));
};

// CLAUDE-ADDED: Archives the current listen-through as a Completed Listen, dated from its own
// startedAt marker (falling back to now if the book was never seen playing -- e.g. a manual "mark as
// finished" with no detected start), then clears the marker so the next play starts a fresh one.
// Called both automatically (StatefulPlayer's trackEnded, for single-track .m4b files -- see its own
// comment) and manually (the Listening Timer panel's "Mark as Finished" button).
export const completeListen = (manifestUrl: string) => (dispatch: AppDispatch, getState: () => RootState) => {
  const startedAt = getState().listeningTime.startedAt ?? Date.now();

  const item: StoredCompletedListen = {
    id: crypto.randomUUID(),
    startedAt,
    completedAt: Date.now()
  };

  dispatch(upsertCompletedListen(item));
  saveCompletedListenToServer(manifestUrl, item);

  dispatch(setStartedAt(null));
  dispatch(persistListeningTime(manifestUrl));
};

export const deleteCompletedListen = (manifestUrl: string, id: string) => (dispatch: AppDispatch) => {
  dispatch(removeCompletedListenState(id));
  deleteCompletedListenFromServer(manifestUrl, id);
};

export default listeningTimeSlice.reducer;
