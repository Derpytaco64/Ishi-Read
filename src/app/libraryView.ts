// CLAUDE-ADDED: Shared between page.tsx (which decides what to render) and StatefulLibraryMenu
// (which renders the nav buttons that switch it), so both agree on the valid views/storage key.
// "shelf" is paired with a separate activeShelfId (see page.tsx) rather than encoding the shelf id
// into this type, since the set of shelf ids is dynamic (user-created).
// "library" is the Books tab (label only says "Books" now -- kept the original value so existing
// persisted activeView prefs from before the Books/Audiobooks split still resolve correctly).
export type LibraryView = "home" | "library" | "audiobooks" | "manga" | "series" | "shelf";

export const LIBRARY_VIEW_STORAGE_KEY = "th-library-active-view";

export const DEFAULT_LIBRARY_VIEW: LibraryView = "home";
