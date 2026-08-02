import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface GlobalPreferencesReducerState {
  locale?: string;
  // CLAUDE-ADDED: Keeps the chapter/page indicator and the return-to-position button visible instead
  // of fading with the rest of the chrome in immersive mode -- a device display preference (not a
  // Readium rendering preference), so this slice is the right home: already persisted locally and,
  // per store.ts's buildServerSyncedState, deliberately excluded from server sync like every other
  // reader display setting except theme/fontFamily.
  keepChromeVisible?: boolean;
}

const initialState: GlobalPreferencesReducerState = {};

export const globalPreferencesSlice = createSlice({
  name: "globalPreferences",
  initialState,
  reducers: {
    setLocale: (state, action: PayloadAction<string | undefined>) => {
      state.locale = action.payload;
    },
    setKeepChromeVisible: (state, action: PayloadAction<boolean>) => {
      state.keepChromeVisible = action.payload;
    },
  },
});

export const { setLocale, setKeepChromeVisible } = globalPreferencesSlice.actions;

export default globalPreferencesSlice.reducer;
