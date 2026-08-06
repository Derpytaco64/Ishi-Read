"use client";

import { ThFormSearchField } from "@/core/Components";

import styles from "./assets/styles/thorium-web.librarySearch.module.css";

export interface StatefulLibrarySearchProps {
  value: string;
  onChange: (value: string) => void;
}

// CLAUDE-ADDED: Pinned top-right, just left of StatefulUserMenu's avatar (see render order in
// page.tsx) -- page.tsx matches this value against title/author/tags(genre)/series across the
// whole library and swaps the main content area for a flat results grid while it's non-empty,
// regardless of which tab (Books/Audiobooks/Series/shelf) was active, same "search takes over"
// pattern as Jellyfin.
export const StatefulLibrarySearch = ({ value, onChange }: StatefulLibrarySearchProps) => {
  return (
    <ThFormSearchField
      aria-label="Search library by title, author, genre, or series"
      value={ value }
      onChange={ onChange }
      onClear={ () => onChange("") }
      className={ styles.search }
      compounds={ {
        input: {
          className: styles.searchInput,
          placeholder: "Search title, author, genre, series"
        },
        searchIcon: { className: styles.searchIcon, hidden: !!value },
        clearButton: {
          className: styles.clearButton,
          isDisabled: !value,
          "aria-label": "Clear search"
        }
      } }
    />
  );
};
