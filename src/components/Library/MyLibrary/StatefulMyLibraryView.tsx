"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import { Publication, PublicationGrid } from "@/components/Misc/PublicationGrid";
import { ThDropdown } from "@/core/Components/Settings/ThDropdown/ThDropdown";

import { SORT_OPTIONS, SortMode, sortEntries } from "@/components/Library/sortPublications";

import styles from "./assets/styles/thorium-web.myLibraryView.module.css";

export interface StatefulMyLibraryViewProps {
  books: Publication[];
  coverSize: number;
  progressByUrl: Record<string, number>;
  onSelectBook: (publication: Publication) => void;
  onContextMenu?: (e: React.MouseEvent, publication: Publication) => void;
  // CLAUDE-ADDED: Reused for both the Books and Audiobooks tabs (page.tsx), which are the same
  // flat sorted-grid view over two different filtered slices of the library -- only the heading and
  // empty-state copy differ between them.
  title?: string;
  emptyMessage?: string;
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
  onContextMenu,
  title = "My Library",
  emptyMessage = "Your library is empty."
}: StatefulMyLibraryViewProps) => {
  // CLAUDE-ADDED: Books/Audiobooks default to Alphabetical (A-Z), unlike DEFAULT_SORT_MODE
  // ("Date Added (Newest)") used elsewhere (e.g. custom shelves) -- deliberately not sharing that
  // constant since changing it would also change every custom shelf's default.
  const [sortMode, setSortMode] = useState<SortMode>("titleAsc");

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
        <h1>{ title }</h1>

        { books.length === 0 && (
          <p className="subtitle">{ emptyMessage }</p>
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
