// CLAUDE-ADDED: Shared between layout.tsx's blocking init script and useAccentColor.ts so both
// read/write the same localStorage key and fall back to the same default -- same pattern as
// themeStorage.ts's THEME_STORAGE_KEY.
export const ACCENT_COLOR_STORAGE_KEY = "th-library-accent-color";

// CLAUDE-ADDED: Matches the light-theme blue thorium-web.bookSheet.module.css hardcoded before this
// became a user preference, so a first-ever visit (nothing in localStorage yet) looks identical to
// before.
export const DEFAULT_ACCENT_COLOR = "#2f6fed";
