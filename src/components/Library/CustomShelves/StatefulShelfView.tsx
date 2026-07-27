"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { Publication, PublicationGrid } from "@/components/Misc/PublicationGrid";
import { ThDropdown } from "@/core/Components/Settings/ThDropdown/ThDropdown";

import { CustomShelf } from "@/app/customShelves";
import { DEFAULT_SORT_MODE, SORT_OPTIONS, SortMode, sortEntries } from "@/components/Library/sortPublications";

import styles from "./assets/styles/thorium-web.shelfView.module.css";

export interface StatefulShelfViewProps {
  shelf: CustomShelf | undefined;
  books: Publication[];
  coverSize: number;
  progressByUrl: Record<string, number>;
  onSelectBook: (publication: Publication) => void;
  onContextMenu?: (e: React.MouseEvent, publication: Publication) => void;
}

const renderBookCover = (publication: Publication) => (
  <Image
    src={ publication.cover }
    alt=""
    loading="lazy"
    width={ 240 }
    height={ 360 }
    unoptimized
  />
);

export const StatefulShelfView = ({
  shelf,
  books,
  coverSize,
  progressByUrl,
  onSelectBook,
  onContextMenu
}: StatefulShelfViewProps) => {
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT_MODE);

  // CLAUDE-ADDED: shelf.books only stores { url, addedAt } -- resolve each against the full library
  // to get the actual Publication, carrying the shelf-specific addedAt alongside it (distinct from
  // Publication.addedAt, which is when the book was added to the library, not this shelf).
  const shelfEntries = useMemo(() => {
    if (!shelf) return [];

    const booksByUrl = new Map(books.map((book) => [book.url, book]));
    return shelf.books
      .map((entry) => {
        const publication = booksByUrl.get(entry.url);
        return publication ? { publication, addedAt: entry.addedAt } : null;
      })
      .filter((entry): entry is { publication: Publication; addedAt: number } => entry !== null);
  }, [shelf, books]);

  const sortedPublications = useMemo(
    () => sortEntries(shelfEntries, sortMode).map((entry) => entry.publication),
    [shelfEntries, sortMode]
  );

  if (!shelf) {
    return (
      <header className="header">
        <h1>Shelf</h1>
        <p className="subtitle">This shelf no longer exists.</p>
      </header>
    );
  }

  return (
    <>
      <header className="header">
        <h1>
          <span className={ styles.titleEmoji } aria-hidden="true">{ shelf.icon }</span>
          { shelf.name }
        </h1>

        { shelfEntries.length === 0 && (
          <p className="subtitle">No books on this shelf yet -- right-click a book anywhere in your library and choose "Add to shelf".</p>
        ) }
      </header>

      { shelfEntries.length > 0 && (
        <>
          <div className={ styles.sortPicker }>
            <ThDropdown
              aria-label="Sort shelf"
              items={ SORT_OPTIONS.map((option) => ({ id: option.id, label: option.label, value: option.label })) }
              selectedKey={ sortMode }
              onSelectionChange={ (key) => setSortMode(key as SortMode) }
              compounds={{
                button: { className: styles.sortPickerButton },
                popover: { className: styles.sortPickerPopover },
                listbox: { className: styles.sortPickerListbox },
                listboxItem: { className: styles.sortPickerListboxItem }
              }}
            />
          </div>

          <PublicationGrid
            publications={ sortedPublications }
            renderCover={ renderBookCover }
            progressByUrl={ progressByUrl }
            columnWidth={ coverSize }
            onSelect={ onSelectBook }
            onContextMenu={ onContextMenu }
          />
        </>
      ) }
    </>
  );
};
