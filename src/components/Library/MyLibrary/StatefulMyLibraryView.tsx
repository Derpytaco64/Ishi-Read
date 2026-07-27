"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { Publication, PublicationGrid } from "@/components/Misc/PublicationGrid";
import { ThDropdown } from "@/core/Components/Settings/ThDropdown/ThDropdown";

import { DEFAULT_SORT_MODE, SORT_OPTIONS, SortMode, sortEntries } from "@/components/Library/sortPublications";

import styles from "./assets/styles/thorium-web.myLibraryView.module.css";

export interface StatefulMyLibraryViewProps {
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

export const StatefulMyLibraryView = ({
  books,
  coverSize,
  progressByUrl,
  onSelectBook,
  onContextMenu
}: StatefulMyLibraryViewProps) => {
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT_MODE);

  // CLAUDE-ADDED: Unlike StatefulShelfView, "added" here is Publication.addedAt itself (added to
  // the library) -- there's no shelf-specific timestamp since this is the whole library, not a
  // curated subset.
  const entries = useMemo(
    () => books.map((publication) => ({ publication, addedAt: publication.addedAt ?? 0 })),
    [books]
  );

  const sortedPublications = useMemo(
    () => sortEntries(entries, sortMode).map((entry) => entry.publication),
    [entries, sortMode]
  );

  return (
    <>
      <header className="header">
        <h1>My Library</h1>

        { books.length === 0 && (
          <p className="subtitle">Your library is empty.</p>
        ) }
      </header>

      { books.length > 0 && (
        <>
          <div className={ styles.sortPicker }>
            <ThDropdown
              aria-label="Sort library"
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
