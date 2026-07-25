// CLAUDE-ADDED: Shared between page.tsx (which filters/orders the shelves) and StatefulLibraryMenu
// (which renders the toggles/drag list for them), so both agree on the keys/storage keys/defaults.
export type ShelfKey = "continueReading" | "lastSeriesRead" | "recentlyAdded" | "myLibrary";

export type ShelfPrefs = Record<ShelfKey, boolean>;

export const SHELF_PREFS_STORAGE_KEY = "th-library-shelf-prefs";

export const DEFAULT_SHELF_PREFS: ShelfPrefs = {
  continueReading: true,
  lastSeriesRead: true,
  recentlyAdded: true,
  myLibrary: true
};

export const SHELF_LABELS: Record<ShelfKey, string> = {
  continueReading: "Continue Reading",
  lastSeriesRead: "Last Series Read",
  recentlyAdded: "Recently Added",
  myLibrary: "My Library"
};

export const SHELF_ORDER_STORAGE_KEY = "th-library-shelf-order";

export const DEFAULT_SHELF_ORDER: ShelfKey[] = [
  "continueReading",
  "lastSeriesRead",
  "recentlyAdded",
  "myLibrary"
];

// CLAUDE-ADDED: Reconciles a persisted order against the current set of known shelves -- drops any
// key that no longer exists (a shelf that got removed in a later version) and appends any key that's
// new since the order was saved (e.g. a user who saved their order before "lastSeriesRead" existed),
// so newly-added shelves still show up instead of silently disappearing.
export function mergeShelfOrder(stored: unknown): ShelfKey[] {
  if (!Array.isArray(stored)) return DEFAULT_SHELF_ORDER;

  const validKeys = new Set<string>(DEFAULT_SHELF_ORDER);
  const filtered = stored.filter((key): key is ShelfKey => validKeys.has(key));
  const missing = DEFAULT_SHELF_ORDER.filter((key) => !filtered.includes(key));

  return [...filtered, ...missing];
}
