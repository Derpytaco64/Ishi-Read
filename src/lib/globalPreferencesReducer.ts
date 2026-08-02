import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// CLAUDE-ADDED: One flag per reader chrome element the "UI Element Visibility" settings menu can pin
// on (see StatefulUIVisibilityToggles.tsx). Undefined/missing (the default, "not toggled") means that
// element keeps its original immersive-mode hiding/fading behavior; `true` ("toggled") pins it always
// visible, the same way keepChromeVisible already does -- these are the same "chrome visibility"
// family, just one flag per element instead of one global flag. There's deliberately no `false` state
// distinct from undefined (this isn't a hide switch): every render site checks truthiness, not
// `!== false`.
export interface UIElementVisibility {
  backLink?: boolean;
  runningHead?: boolean;
  readingTimer?: boolean;
  overflowMenu?: boolean;
  progression?: boolean;
  pagination?: boolean;
}

// CLAUDE-ADDED: The header/footer chrome fades as one shared CSS transform (see getReaderClassNames'
// callers), not as independently-transformed elements -- so pinning any single element visible has to
// keep the whole bar from sliding away, the same way keepChromeVisible alone already does. Per-element
// toggles additionally blank just their own content when *not* pinned (see
// StatefulReaderProgression.tsx/StatefulReaderRunningHead.tsx's own isHovering merge), but can't fade
// independently of the bar while pinned.
export const anyUIElementPinned = (uiElementVisibility?: UIElementVisibility): boolean =>
  !!uiElementVisibility && Object.values(uiElementVisibility).some(Boolean);

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
