import { ThDockingKeys } from "@/preferences/models";

import { combineReducers, configureStore, Reducer } from "@reduxjs/toolkit";

import readerReducer, { ReaderReducerState } from "@/lib/readerReducer";
import settingsReducer, { SettingsReducerState } from "@/lib/settingsReducer";
import themeReducer, { ThemeReducerState, initialState as themeInitialState } from "@/lib/themeReducer";
import actionsReducer, { ActionsReducerState, ActionStateObject } from "@/lib/actionsReducer";
import publicationReducer, { PublicationReducerState } from "./publicationReducer";
import annotationsReducer, { AnnotationsReducerState } from "./annotationsReducer";
import readingTimeReducer, { ReadingTimeReducerState } from "./readingTimeReducer";
import listeningTimeReducer, { ListeningTimeReducerState } from "./listeningTimeReducer";
import preferencesReducer, { PreferencesReducerState } from "./preferencesReducer";
import globalPreferencesReducer, { GlobalPreferencesReducerState } from "./globalPreferencesReducer";
import webPubSettingsReducer, { WebPubSettingsReducerState } from "./webPubSettingsReducer";
import audioSettingsReducer, { AudioSettingsState } from "./audioSettingsReducer";
import playerReducer, { PlayerReducerState } from "./playerReducer";
import imageOverlayReducer, { ImageOverlayState } from "./imageOverlayReducer";

import { fetchSettingsFromServer, saveSettingsToServer } from "@/lib/userData/settingsApi";

import debounce from "debounce";

// CLAUDE-ADDED: Action type used to merge server-loaded settings into the store from outside any
// single slice -- see hydrateFromServer() and the rootReducer wrapper in makeStore() below.
export const HYDRATE_FROM_SERVER = "@@userData/hydrateFromServer";

interface ExternalReducerConfig {
  reducer: any;
  persist?: boolean;
}

// Define the shape of the root state
export type RootState = {
  reader: ReaderReducerState;
  settings: SettingsReducerState;
  theming: ThemeReducerState;
  actions: ActionsReducerState;
  publication: PublicationReducerState;
  annotations: AnnotationsReducerState;
  readingTime: ReadingTimeReducerState;
  listeningTime: ListeningTimeReducerState;
  preferences: PreferencesReducerState;
  globalPreferences: GlobalPreferencesReducerState;
  webPubSettings: WebPubSettingsReducerState;
  audioSettings: AudioSettingsState;
  player: PlayerReducerState;
  imageOverlay: ImageOverlayState;
  [key: string]: any; // For external reducers
};

const DEFAULT_STORAGE_KEY = "thorium-web-state";

// Migrate font family state
const migrateFontFamily = (stateSlice: SettingsReducerState | WebPubSettingsReducerState) => {
  if (stateSlice?.fontFamily && typeof stateSlice.fontFamily === "string") {
    return {
      ...stateSlice,
      fontFamily: {
        default: stateSlice.fontFamily
      }
    };
  }
  return stateSlice;
};


const updateActionsState = (state: ActionsReducerState) => {
  // Check if keys are already profile-keyed
  if (state.keys && typeof state.keys === "object" && ("epub" in state.keys || "webPub" in state.keys || "audio" in state.keys)) {
    // Keys are already profile-keyed, update each profile
    const updatedKeys: any = {};
    for (const profile in state.keys) {
      updatedKeys[profile] = Object.fromEntries(
        Object.entries(state.keys[profile]).map(([key, value]: [string, ActionStateObject | undefined]) => [
          key,
          {
            ...value,
            // Transient/undocked actions should never re-open on load
            // Docked actions reset to null so useDocking re-establishes open state
            // based on the actual breakpoint at load time (avoids opening docked
            // sheets in fullscreen/compact where docking is unavailable)
            isOpen: (value?.docking === ThDockingKeys.transient || value?.docking == null)
              ? false
              : (value?.docking === ThDockingKeys.start || value?.docking === ThDockingKeys.end)
                ? null
                : value?.isOpen,
          },
        ])
      );
    }
    return {
      ...state,
      keys: updatedKeys,
      overflow: {}
    };
  } else {
    // Keys are still flat, update them
    const updatedKeys = Object.fromEntries(
      Object.entries(state.keys).map(([key, value]: [string, ActionStateObject | undefined]) => [
        key,
        {
          ...value,
          isOpen: (value?.docking === ThDockingKeys.transient || value?.docking == null)
            ? false
            : (value?.docking === ThDockingKeys.start || value?.docking === ThDockingKeys.end)
              ? null
              : value?.isOpen,
        },
      ])
    );
    return {
      ...state,
      keys: updatedKeys,
      overflow: {}
    };
  }
};

const migrateDockStateToProfileKeyed = (state: ActionsReducerState): ActionsReducerState => {
  // Check if dock state is in old format (not profile-keyed)
  if (state.dock && typeof state.dock === "object" && !("epub" in state.dock || "webPub" in state.dock || "audio" in state.dock)) {
    // Old format: dock has direct start/end keys
    const oldDock = state.dock as any;
    if (oldDock[ThDockingKeys.start] || oldDock[ThDockingKeys.end]) {
      // Migrate to new profile-keyed format, only for epub profile
      const newDock: any = {};
      newDock["epub"] = {
        [ThDockingKeys.start]: oldDock[ThDockingKeys.start] || { actionKey: null, active: false, collapsed: false },
        [ThDockingKeys.end]: oldDock[ThDockingKeys.end] || { actionKey: null, active: false, collapsed: false }
      };
      return {
        ...state,
        dock: newDock
      };
    }
  }
  return state;
};

const migrateKeysStateToProfileKeyed = (state: ActionsReducerState): ActionsReducerState => {
  // If keys is not profile-keyed, migrate to profile-keyed format
  // Old format: keys is a flat object like { [key]: ActionStateObject }
  // New format: keys is profile-keyed like { epub: { [key]: ActionStateObject }, webPub: { ... }, audio: { ... } }
  if (!state.keys) {
    return state;
  }
  
  // Check if keys is already profile-keyed by looking for known profile keys
  const isProfileKeyed = "epub" in state.keys || "webPub" in state.keys || "audio" in state.keys;
  
  if (!isProfileKeyed) {
    // Old flat format - migrate to epub profile
    const oldKeys = state.keys as any;
    const newKeys: any = {
      epub: { ...oldKeys },
      webPub: {},
      audio: {}
    };
    return {
      ...state,
      keys: newKeys
    };
  }
  
  // Ensure all profile keys exist even if some are missing
  const migratedKeys: any = {
    epub: state.keys.epub || {},
    webPub: state.keys.webPub || {},
    audio: state.keys.audio || {}
  };
  
  return {
    ...state,
    keys: migratedKeys
  };
};

const loadState = (storageKey: string = DEFAULT_STORAGE_KEY) => {
  try {
    const resolvedKey = storageKey || DEFAULT_STORAGE_KEY;
    const serializedState = localStorage.getItem(resolvedKey);
    if (serializedState === null) {
      return {
        actions: undefined,
        settings: undefined,
        theming: undefined,
        preferences: undefined,
        globalPreferences: undefined,
        webPubSettings: undefined,
        audioSettings: undefined
      };
    }
    
    // Parse the state
    let state = JSON.parse(serializedState);
    
    // Apply migrations
    if (state && state.actions) {
      state.actions = migrateDockStateToProfileKeyed(state.actions);
      state.actions = migrateKeysStateToProfileKeyed(state.actions);
      state.actions = updateActionsState(state.actions);
    }
    if (state) {
      if (state.settings) {
        state.settings = migrateFontFamily(state.settings);
      }
      if (state.webPubSettings) {
        state.webPubSettings = migrateFontFamily(state.webPubSettings);
      }
      if (state.actions) {
        state.actions = updateActionsState(state.actions);
        // Migrate dock state to profile-keyed format if needed
        // Old dock state only applied to epub profile
        state.actions = migrateDockStateToProfileKeyed(state.actions);
      }
    }
    
    return state;
  } catch (_err) {
    return {
      actions: undefined,
      settings: undefined,
      theming: undefined,
      preferences: undefined,
      globalPreferences: undefined,
      webPubSettings: undefined
    };
  }
};

// CLAUDE-ADDED: Extracted out of saveState so the exact same "which reducers count as settings"
// logic can also be sent to the server, instead of duplicating the field list.
const buildPersistedState = (state: any, externalReducers: Record<string, ExternalReducerConfig> = {}) => {
  const stateToPersist: any = {};

  // Internal reducers to persist
  if (state.actions) stateToPersist.actions = state.actions;
  if (state.settings) stateToPersist.settings = state.settings;
  // CLAUDE-ADDED: theming mixes one real user choice (theme.reflow/fxl/audio) with fields that are
  // pure live environment detection -- monochrome, colorScheme, prefersContrast, forcedColors,
  // prefersReducedMotion/Transparency, breakpoint, containerBreakpoint. Those get redetected from
  // matchMedia/ResizeObserver every time a reader mounts (see useTheming's onXChange callbacks in
  // StatefulReaderWrapper.tsx), so persisting them was pure churn: every OS dark-mode flip or window
  // resize re-saved (and re-uploaded) the whole settings blob for a value that gets overwritten again
  // on the very next load anyway. Only the actual choice is worth keeping.
  if (state.theming) stateToPersist.theming = { theme: state.theming.theme };
  if (state.preferences) stateToPersist.preferences = state.preferences;
  if (state.globalPreferences) stateToPersist.globalPreferences = state.globalPreferences;
  if (state.webPubSettings) stateToPersist.webPubSettings = state.webPubSettings;
  if (state.audioSettings) stateToPersist.audioSettings = state.audioSettings;

  // External reducers to persist
  Object.entries(externalReducers).forEach(([key, config]) => {
    if (config.persist && state[key] !== undefined) {
      stateToPersist[key] = state[key];
    }
  });

  return stateToPersist;
};

// CLAUDE-ADDED: Only theme and font family are meant to roam across devices -- everything else in
// settings/webPubSettings (font size, spacing, columns, alignment, hyphens, ligatures, etc.) is a
// device-local display preference now (a phone and a desktop want different values, same rationale
// as useCoverSize.ts), so it stays in buildPersistedState's localStorage blob but is deliberately
// excluded from what gets sent to the server.
const buildServerSyncedState = (state: any) => {
  const stateToSync: any = {};

  if (state.theming) stateToSync.theming = { theme: state.theming.theme };
  if (state.settings?.fontFamily !== undefined) stateToSync.settings = { fontFamily: state.settings.fontFamily };
  if (state.webPubSettings?.fontFamily !== undefined) stateToSync.webPubSettings = { fontFamily: state.webPubSettings.fontFamily };

  return stateToSync;
};

const persistState = (stateToPersist: any, storageKey?: string) => {
  try {
    const resolvedKey = storageKey || DEFAULT_STORAGE_KEY;

    // CLAUDE-ADDED: localStorage remains the instant synchronous boot path (see makeStore) and now
    // also the sole store for device-local settings -- server sync happens separately, and only for
    // the theme/fontFamily subset (see buildServerSyncedState + saveStateDebounced).
    localStorage.setItem(resolvedKey, JSON.stringify(stateToPersist));
  } catch (err) {
    console.error(err);
  }
};

// CLAUDE-ADDED: Fetches the server-persisted settings blob and merges it into the store via
// HYDRATE_FROM_SERVER. Fire-and-forget from ThStoreProvider on mount -- the store already rendered
// from the synchronous localStorage-seeded state, this just reconciles shortly after.
export const hydrateFromServer = async (store: { dispatch: (action: { type: string; payload: unknown }) => void }) => {
  const settings = await fetchSettingsFromServer();
  if (settings) {
    store.dispatch({ type: HYDRATE_FROM_SERVER, payload: settings });
  }
};

export const makeStore = (storageKey?: string, externalReducers: Record<string, ExternalReducerConfig> = {}) => {
  // Combine internal and external reducers
  const combinedReducers = {
    reader: readerReducer,
    settings: settingsReducer,
    theming: themeReducer,
    actions: actionsReducer,
    publication: publicationReducer,
    annotations: annotationsReducer,
    readingTime: readingTimeReducer,
    listeningTime: listeningTimeReducer,
    preferences: preferencesReducer,
    globalPreferences: globalPreferencesReducer,
    webPubSettings: webPubSettingsReducer,
    audioSettings: audioSettingsReducer,
    player: playerReducer,
    imageOverlay: imageOverlayReducer,
    ...Object.entries(externalReducers).reduce((acc, [key, config]) => ({
      ...acc,
      [key]: config.reducer
    }), {})
  };

  // Get persisted state for internal reducers
  const persistedState = loadState(storageKey);
  
  // Create preloaded state with persisted values
  // CLAUDE-ADDED: Merge over themeInitialState rather than using persistedState.theming as-is --
  // only `theme` is ever persisted now (see buildPersistedState), and any older cache still holding
  // the full slice (colorScheme, monochrome, breakpoint, ...) shouldn't seed those either, since
  // they're liable to be stale (e.g. an OS dark-mode flip since the last save) until useTheming's
  // onXChange callbacks redetect and correct them moments later anyway.
  const persistedTheme = persistedState.theming?.theme;

  const preloadedState: any = {
    actions: persistedState.actions,
    settings: persistedState.settings,
    theming: persistedTheme ? { ...themeInitialState, theme: persistedTheme } : undefined,
    preferences: persistedState.preferences,
    globalPreferences: persistedState.globalPreferences,
    webPubSettings: persistedState.webPubSettings,
    audioSettings: persistedState.audioSettings,
    // Include persisted state for external reducers that have it
    ...Object.entries(externalReducers).reduce((acc, [key, config]) => {
      if (config.persist && persistedState[key] !== undefined) {
        return { ...acc, [key]: persistedState[key] };
      }
      return acc;
    }, {})
  };

  // CLAUDE-ADDED: combineReducers is called explicitly (rather than handing configureStore the map
  // object directly) so HYDRATE_FROM_SERVER can be intercepted here and merged across every slice at
  // once, instead of having to teach each individual slice reducer about it.
  const appReducer = combineReducers(combinedReducers) as unknown as Reducer<RootState>;
  const rootReducer: Reducer<RootState> = (state, action) => {
    if (action.type === HYDRATE_FROM_SERVER && state) {
      const payload = (action as unknown as { payload: Partial<RootState> }).payload;
      state = {
        ...state,
        ...payload,
        // CLAUDE-ADDED: theming needs a narrower merge than every other slice here -- the server's
        // copy only ever carries the persisted `theme` choice (buildPersistedState strips the rest),
        // never the live-detected fields (colorScheme, monochrome, breakpoint, ...) that useTheming
        // may have already set by the time this hydrate lands. A wholesale spread would blow those
        // back to undefined instead of leaving them alone.
        ...(payload.theming ? { theming: { ...state.theming, theme: payload.theming.theme } } : {}),
        // CLAUDE-ADDED: Same narrow-merge reasoning as theming above -- the server payload's settings/
        // webPubSettings now only ever carry fontFamily (see buildServerSyncedState), never the rest of
        // the slice, so a wholesale spread would blow every other, now device-local field back to
        // undefined instead of leaving the localStorage-loaded values alone.
        ...(payload.settings?.fontFamily !== undefined ? { settings: { ...state.settings, fontFamily: payload.settings.fontFamily } } : {}),
        ...(payload.webPubSettings?.fontFamily !== undefined ? { webPubSettings: { ...state.webPubSettings, fontFamily: payload.webPubSettings.fontFamily } } : {})
      };
    }
    return appReducer(state, action);
  };

  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
  });

  // CLAUDE-ADDED: store.subscribe fires on every dispatch, including ones that only touch
  // non-persisted slices (e.g. publication's fontLanguage/coverTheme) -- skip the write entirely
  // when the persisted subset hasn't actually changed, instead of re-saving identical data to
  // localStorage and re-uploading it to the server on every unrelated action.
  let lastPersistedSnapshot: string | null = null;
  // CLAUDE-ADDED: Separate dedupe snapshot for the server-synced subset -- without it, any change to a
  // device-local-only setting (font size, spacing, ...) would still change buildPersistedState's full
  // blob and trip the localStorage snapshot check, but that's unrelated to whether theme/fontFamily
  // actually changed, so a shared snapshot would trigger a pointless server POST on every such change.
  let lastServerSyncedSnapshot: string | null = null;

  const saveStateDebounced = debounce(() => {
    const state = store.getState();

    const stateToPersist = buildPersistedState(state, externalReducers);
    const serialized = JSON.stringify(stateToPersist);
    if (serialized !== lastPersistedSnapshot) {
      lastPersistedSnapshot = serialized;
      persistState(stateToPersist, storageKey);
    }

    const stateToSync = buildServerSyncedState(state);
    const serializedSync = JSON.stringify(stateToSync);
    if (serializedSync !== lastServerSyncedSnapshot) {
      lastServerSyncedSnapshot = serializedSync;
      saveSettingsToServer(stateToSync);
    }
  }, 250);

  store.subscribe(saveStateDebounced);

  return store;
}

// Infer the type of makeStore
export type AppStore = ReturnType<typeof makeStore>;
// Infer the `RootState` and `AppDispatch` types from the store itself
// Export the RootState type for external use
export type AppState = RootState;
export type AppDispatch = AppStore["dispatch"];