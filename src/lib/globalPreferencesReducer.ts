import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// CLAUDE-ADDED: One flag per reader chrome element the "UI Element Visibility" settings menu can
// toggle off (see StatefulUIVisibilityToggles.tsx). Undefined/missing means visible -- every render
// site checks `!== false` rather than `=== true` so a freshly-added key here defaults to visible
// without needing a matching default entry.
export interface UIElementVisibility {
  backLink?: boolean;
  runningHead?: boolean;
  readingTimer?: boolean;
  overflowMenu?: boolean;
  progression?: boolean;
  pagination?: boolean;
}

export interface GlobalPreferencesReducerState {
  locale?: string;
  // CLAUDE-ADDED: Keeps the chapter/page indicator and the return-to-position button visible instead
  // of fading with the rest of the chrome in immersive mode -- a device display preference (not a
  // Readium rendering preference), so this slice is the right home: already persisted locally and,
  // per store.ts's buildServerSyncedState, deliberately excluded from server sync like every other
  // reader display setting except theme/fontFamily.
  keepChromeVisible?: boolean;
  // CLAUDE-ADDED: See UIElementVisibility above -- same rationale as keepChromeVisible for living in
  // this slice (device display preference, not a Readium rendering preference).
  uiElementVisibility?: UIElementVisibility;
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
    setUIElementVisibility: (state, action: PayloadAction<{ key: keyof UIElementVisibility; value: boolean }>) => {
      state.uiElementVisibility = {
        ...state.uiElementVisibility,
        [action.payload.key]: action.payload.value
      };
    },
  },
});

export const { setLocale, setKeepChromeVisible, setUIElementVisibility } = globalPreferencesSlice.actions;

export default globalPreferencesSlice.reducer;
