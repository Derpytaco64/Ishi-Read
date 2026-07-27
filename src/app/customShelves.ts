// CLAUDE-ADDED: Shared between page.tsx (owns the data + persistence), StatefulLibraryMenu (lists
// shelves + creates new ones), StatefulShelfView (renders one shelf's books), and
// StatefulBookContextMenu (adds a book to a shelf from the right-click menu).
// CLAUDE-ADDED: An emoji character, e.g. "📚" -- picked from SHELF_ICON_CHOICES (see shelfIcons.ts)
// but stored as the plain string itself rather than a lookup key, so rendering it anywhere is just
// printing the string, no icon-component registry needed.
export type ShelfIcon = string;

export interface ShelfBookEntry {
  url: string;
  // CLAUDE-ADDED: When this book was added to *this* shelf -- distinct from Publication.addedAt,
  // which is when the book was added to the library overall.
  addedAt: number;
}

export interface CustomShelf {
  id: string;
  name: string;
  icon: ShelfIcon;
  books: ShelfBookEntry[];
}

export const CUSTOM_SHELVES_STORAGE_KEY = "th-library-custom-shelves";

// CLAUDE-ADDED: Which shelf is showing when activeView === "shelf" (see libraryView.ts) -- kept
// separate from LibraryView itself since the set of shelf ids is dynamic (user-created), not a
// fixed union.
export const ACTIVE_SHELF_ID_STORAGE_KEY = "th-library-active-shelf-id";
