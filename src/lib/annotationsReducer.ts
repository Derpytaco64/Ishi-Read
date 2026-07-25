import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import { StoredHighlight, StoredBookmark, StoredNote } from "@/lib/userData/annotationTypes";
import { fetchHighlightsFromServer, saveHighlightToServer, deleteHighlightFromServer } from "@/lib/userData/highlightsApi";
import { fetchBookmarksFromServer, saveBookmarkToServer, deleteBookmarkFromServer } from "@/lib/userData/bookmarksApi";
import { fetchNotesFromServer, saveNoteToServer, deleteNoteFromServer } from "@/lib/userData/notesApi";
import type { AppDispatch } from "@/lib/store";

// CLAUDE-ADDED: `existing` distinguishes a fresh text selection (new highlight/bookmark) from a tap on
// an already-rendered highlight decoration (edit color / delete) -- both open the same SelectionPopover,
// positioned from x/y/width/height. Tapping an existing *note* decoration instead opens NoteOverlay (see
// noteOverlay state below) -- a note is read first, not dropped straight into an editable textarea.
export interface PendingSelection {
  locator: unknown;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  existing?: {
    type: "highlight";
    id: string;
  };
}

// CLAUDE-ADDED: Set when the reader taps an existing note decoration in the text; NoteOverlay reads this
// to know which note to show and whether it opened straight into edit mode. "view" first (read the note,
// offer a begin-editing button) rather than "edit" matches how the annotations list's own edit button
// works -- editing is always an explicit second step, never the default landing state.
export interface NoteOverlayState {
  noteId: string;
  mode: "view" | "edit";
}

export interface AnnotationsReducerState {
  manifestUrl: string | null;
  highlights: StoredHighlight[];
  bookmarks: StoredBookmark[];
  notes: StoredNote[];
  isLoaded: boolean;
  pendingSelection: PendingSelection | null;
  noteOverlay: NoteOverlayState | null;
  // CLAUDE-ADDED: flashLocator briefly re-decorates a jump target so it's visible after navigating from
  // the Annotations panel; returnLocator is the position we jumped *from*, so the footer can offer a way
  // back. Both are cleared once consumed (see StatefulReader.tsx and StatefulReaderFooter.tsx).
  flashLocator: unknown | null;
  returnLocator: unknown | null;
}

const initialState: AnnotationsReducerState = {
  manifestUrl: null,
  highlights: [],
  bookmarks: [],
  notes: [],
  isLoaded: false,
  pendingSelection: null,
  noteOverlay: null,
  flashLocator: null,
  returnLocator: null
};

function upsert<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex(existing => existing.id === item.id);
  if (index === -1) return [...items, item];

  const next = [...items];
  next[index] = item;
  return next;
}

export const annotationsSlice = createSlice({
  name: "annotations",
  initialState,
  reducers: {
    setManifestUrl: (state, action: PayloadAction<string | null>) => {
      if (state.manifestUrl === action.payload) return;
      state.manifestUrl = action.payload;
      state.highlights = [];
      state.bookmarks = [];
      state.notes = [];
      state.isLoaded = false;
    },
    setAnnotationsLoaded: (state, action: PayloadAction<{ highlights: StoredHighlight[]; bookmarks: StoredBookmark[]; notes: StoredNote[] }>) => {
      state.highlights = action.payload.highlights;
      state.bookmarks = action.payload.bookmarks;
      state.notes = action.payload.notes;
      state.isLoaded = true;
    },
    upsertHighlight: (state, action: PayloadAction<StoredHighlight>) => {
      state.highlights = upsert(state.highlights, action.payload);
    },
    removeHighlightState: (state, action: PayloadAction<string>) => {
      state.highlights = state.highlights.filter(item => item.id !== action.payload);
    },
    upsertBookmark: (state, action: PayloadAction<StoredBookmark>) => {
      state.bookmarks = upsert(state.bookmarks, action.payload);
    },
    removeBookmarkState: (state, action: PayloadAction<string>) => {
      state.bookmarks = state.bookmarks.filter(item => item.id !== action.payload);
    },
    upsertNote: (state, action: PayloadAction<StoredNote>) => {
      state.notes = upsert(state.notes, action.payload);
    },
    removeNoteState: (state, action: PayloadAction<string>) => {
      state.notes = state.notes.filter(item => item.id !== action.payload);
    },
    setPendingSelection: (state, action: PayloadAction<PendingSelection | null>) => {
      state.pendingSelection = action.payload;
    },
    openNoteOverlay: (state, action: PayloadAction<string>) => {
      state.noteOverlay = { noteId: action.payload, mode: "view" };
    },
    closeNoteOverlay: (state) => {
      state.noteOverlay = null;
    },
    setNoteOverlayMode: (state, action: PayloadAction<"view" | "edit">) => {
      if (state.noteOverlay) state.noteOverlay.mode = action.payload;
    },
    setFlashLocator: (state, action: PayloadAction<unknown | null>) => {
      state.flashLocator = action.payload;
    },
    setReturnLocator: (state, action: PayloadAction<unknown | null>) => {
      state.returnLocator = action.payload;
    }
  }
});

export const {
  setManifestUrl,
  setAnnotationsLoaded,
  upsertHighlight,
  removeHighlightState,
  upsertBookmark,
  removeBookmarkState,
  upsertNote,
  removeNoteState,
  setPendingSelection,
  openNoteOverlay,
  closeNoteOverlay,
  setNoteOverlayMode,
  setFlashLocator,
  setReturnLocator
} = annotationsSlice.actions;

// CLAUDE-ADDED: Plain thunks (RTK's configureStore includes thunk middleware by default) bundling
// "update Redux state" + "persist to server" into one dispatch call -- the Redux equivalent of how
// usePositionStorage.ts's setCustom() bundles local React state + savePositionToServer(). Kept as
// thunks (rather than two separate call sites) so every caller -- the selection popover, the tap-to-edit
// decoration observer, and the Annotations panel's delete buttons -- doesn't have to remember to do both.

// CLAUDE-ADDED: manifestUrl arrives URL-encoded from the route (see read/[identifier]/page.tsx and
// read/manifest/[manifest]/page.tsx, same as useServerPosition.ts) -- decoded once here so
// state.annotations.manifestUrl is always the clean form every other thunk/component can use directly.
export const loadAnnotations = (rawManifestUrl: string) => async (dispatch: AppDispatch) => {
  const manifestUrl = decodeURIComponent(rawManifestUrl);
  dispatch(setManifestUrl(manifestUrl));

  const [highlights, bookmarks, notes] = await Promise.all([
    fetchHighlightsFromServer(manifestUrl),
    fetchBookmarksFromServer(manifestUrl),
    fetchNotesFromServer(manifestUrl)
  ]);

  dispatch(setAnnotationsLoaded({ highlights, bookmarks, notes }));
};

export const addHighlight = (manifestUrl: string, highlight: StoredHighlight) => (dispatch: AppDispatch) => {
  dispatch(upsertHighlight(highlight));
  saveHighlightToServer(manifestUrl, highlight);
};

export const deleteHighlight = (manifestUrl: string, id: string) => (dispatch: AppDispatch) => {
  dispatch(removeHighlightState(id));
  deleteHighlightFromServer(manifestUrl, id);
};

export const addBookmark = (manifestUrl: string, bookmark: StoredBookmark) => (dispatch: AppDispatch) => {
  dispatch(upsertBookmark(bookmark));
  saveBookmarkToServer(manifestUrl, bookmark);
};

export const deleteBookmark = (manifestUrl: string, id: string) => (dispatch: AppDispatch) => {
  dispatch(removeBookmarkState(id));
  deleteBookmarkFromServer(manifestUrl, id);
};

export const addOrUpdateNote = (manifestUrl: string, note: StoredNote) => (dispatch: AppDispatch) => {
  dispatch(upsertNote(note));
  saveNoteToServer(manifestUrl, note);
};

export const deleteNote = (manifestUrl: string, id: string) => (dispatch: AppDispatch) => {
  dispatch(removeNoteState(id));
  deleteNoteFromServer(manifestUrl, id);
};

export default annotationsSlice.reducer;
