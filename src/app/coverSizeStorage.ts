// CLAUDE-ADDED: Shared between useCoverSize.ts and StatefulLibraryMenu.tsx (which renders the
// slider for it) -- same constants-file pattern as shelfPrefs.ts. Was a "small"/"medium"/"large"
// preset enum mapped to fixed px values; now a plain continuous px number driven by a slider
// instead, with MIN/MAX_COVER_SIZE as its range bounds.
export const COVER_SIZE_STORAGE_KEY = "th-library-cover-size";

export const MIN_COVER_SIZE = 100;
export const MAX_COVER_SIZE = 280;

// CLAUDE-ADDED: Matches PublicationGrid's own columnWidth default from before this was a
// preference, so a first-ever visit (nothing in localStorage yet) looks identical to before.
export const DEFAULT_COVER_SIZE = 160;
