"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { CSSProperties } from "react";

import classNames from "classnames";

import { ThGrid } from "@/core/Components";
import { ThDropdown } from "@/core/Components/Settings/ThDropdown/ThDropdown";
import { Publication, PublicationGrid } from "@/components/Misc/PublicationGrid";

import BackIcon from "./assets/icons/back.svg";

import styles from "./assets/styles/thorium-web.seriesView.module.css";

export interface StatefulSeriesViewProps {
  books: Publication[];
  coverSize: number;
  progressByUrl: Record<string, number>;
  onSelectBook: (publication: Publication) => void;
  onContextMenu?: (e: React.MouseEvent, publication: Publication) => void;
  // CLAUDE-ADDED: Lets a caller (the book context menu's "Go to Series") jump straight to a
  // series' detail page -- read once as this component's initial state rather than a fully
  // controlled prop, since page.tsx only ever mounts this component fresh when navigating into
  // the Series tab (it's conditionally rendered on activeView), so a plain initial value is enough
  // to land on the right series without needing an effect to react to later prop changes.
  initialSelectedSeries?: string | null;
}

interface SeriesSlot {
  name: string;
  books: Publication[];
  center: Publication;
  left: Publication | null;
  right: Publication | null;
}

type SeriesSortDirection = "firstToLast" | "lastToFirst";

const DEFAULT_SERIES_SORT_DIRECTION: SeriesSortDirection = "firstToLast";

const SERIES_SORT_OPTIONS: { id: SeriesSortDirection; label: string }[] = [
  { id: "firstToLast", label: "Series Order (First → Last)" },
  { id: "lastToFirst", label: "Series Order (Last → First)" }
];

// CLAUDE-ADDED: The fan's dimensions were originally hand-tuned at a 110px center-cover width --
// these ratios let the whole stack (cover width, stage height, left/right offset, grid column)
// scale together with the cover-size slider (coverSize) instead of staying fixed regardless of it,
// the same technique PublicationGrid's own progress ring uses (PROGRESS_RING_*_RATIO).
const FAN_REFERENCE_COVER_WIDTH = 110;
const FAN_HEIGHT_RATIO = 210 / FAN_REFERENCE_COVER_WIDTH;
const FAN_OFFSET_RATIO = 40 / FAN_REFERENCE_COVER_WIDTH;
const FAN_GRID_COLUMN_RATIO = 200 / FAN_REFERENCE_COVER_WIDTH;

// CLAUDE-ADDED: Picks up to 2 of a series' other books to flank the center cover -- order doesn't
// matter for how they're used (left vs right is just whichever comes out of the shuffle first).
function pickFlankingCovers<T>(items: T[]): [T | null, T | null] {
  if (items.length === 0) return [null, null];
  if (items.length === 1) return [items[0], null];

  const shuffled = [...items].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
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

export const StatefulSeriesView = ({
  books,
  coverSize,
  progressByUrl,
  onSelectBook,
  onContextMenu,
  initialSelectedSeries
}: StatefulSeriesViewProps) => {
  const [selectedSeries, setSelectedSeries] = useState<string | null>(initialSelectedSeries ?? null);
  const [sortDirection, setSortDirection] = useState<SeriesSortDirection>(DEFAULT_SERIES_SORT_DIRECTION);

  // CLAUDE-ADDED: One slot per series, sorted alphabetically by series name. Each slot's "center"
  // cover is that series' own first book alphabetically by title (not by series.position/volume
  // order -- position order is used for the drill-down list below instead, once a slot is picked).
  // Recomputed only when the book list itself changes, so the two random flanking covers don't
  // reshuffle on every unrelated re-render (e.g. reading progress ticking in elsewhere).
  const seriesSlots = useMemo<SeriesSlot[]>(() => {
    const groups = new Map<string, Publication[]>();
    for (const book of books) {
      if (!book.series?.name) continue;
      const group = groups.get(book.series.name);
      if (group) {
        group.push(book);
      } else {
        groups.set(book.series.name, [book]);
      }
    }

    return Array.from(groups.entries())
      .map(([name, seriesBooks]) => {
        const sortedByTitle = [...seriesBooks].sort((a, b) => a.title.localeCompare(b.title));
        const [center, ...rest] = sortedByTitle;
        const [left, right] = pickFlankingCovers(rest);
        return { name, books: seriesBooks, center, left, right };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  // CLAUDE-ADDED: Falls back out of a selection whose series disappeared (e.g. its last book was
  // removed) rather than leaving the drill-down section showing stale/empty content.
  useEffect(() => {
    if (selectedSeries && !seriesSlots.some((slot) => slot.name === selectedSeries)) {
      setSelectedSeries(null);
    }
  }, [selectedSeries, seriesSlots]);

  const selectedBooks = useMemo(() => {
    const slot = seriesSlots.find((s) => s.name === selectedSeries);
    if (!slot) return [];

    const sorted = [...slot.books].sort((a, b) => (a.series?.position ?? 0) - (b.series?.position ?? 0));
    return sortDirection === "lastToFirst" ? sorted.reverse() : sorted;
  }, [seriesSlots, selectedSeries, sortDirection]);

  if (seriesSlots.length === 0) {
    return (
      <header className="header">
        <h1>Series</h1>
        <p className="subtitle">None of your books have series information yet.</p>
      </header>
    );
  }

  // CLAUDE-ADDED: coverSize is the same "cover size" slider value PublicationGrid uses as its own
  // columnWidth elsewhere -- treating it as the fan's center-cover width keeps this grid in step
  // with that setting. Exposed as CSS custom properties (set once here, read by every slot's CSS)
  // rather than computed per-slot, since they're identical for every slot in the grid.
  const fanCoverWidth = coverSize;
  const fanHeight = fanCoverWidth * FAN_HEIGHT_RATIO;
  const fanOffset = fanCoverWidth * FAN_OFFSET_RATIO;
  const gridColumnWidth = fanCoverWidth * FAN_GRID_COLUMN_RATIO;

  // CLAUDE-ADDED: Clicking a slot now navigates to a dedicated per-series page (title + sort
  // options + back button) rather than expanding inline below the grid, so the two views are
  // mutually exclusive instead of stacking.
  if (selectedSeries) {
    return (
      <>
        <header className={ classNames("header", styles.seriesDetailHeader) }>
          <button
            type="button"
            className={ styles.backButton }
            onClick={ () => setSelectedSeries(null) }
          >
            <BackIcon aria-hidden="true" focusable="false" className={ styles.backIcon } />
            Back
          </button>
          <h1>{ selectedSeries }</h1>
        </header>

        <div className={ styles.sortPicker }>
          <ThDropdown
            aria-label="Sort series order"
            items={ SERIES_SORT_OPTIONS.map((option) => ({ id: option.id, label: option.label, value: option.label })) }
            selectedKey={ sortDirection }
            onSelectionChange={ (key) => setSortDirection(key as SeriesSortDirection) }
            compounds={{
              button: { className: styles.sortPickerButton },
              popover: { className: styles.sortPickerPopover },
              listbox: { className: styles.sortPickerListbox },
              listboxItem: { className: styles.sortPickerListboxItem }
            }}
          />
        </div>

        <PublicationGrid
          publications={ selectedBooks }
          renderCover={ renderBookCover }
          progressByUrl={ progressByUrl }
          columnWidth={ coverSize }
          onSelect={ onSelectBook }
          onContextMenu={ onContextMenu }
        />
      </>
    );
  }

  return (
    <>
      <header className="header">
        <h1>Series</h1>
      </header>

      <ThGrid
        className={ styles.wrapper }
        items={ seriesSlots }
        columnWidth={ gridColumnWidth }
        gap="2rem"
        style={ {
          "--fan-cover-width": `${ fanCoverWidth }px`,
          "--fan-height": `${ fanHeight }px`,
          "--fan-offset": `${ fanOffset }px`
        } as CSSProperties }
        renderItem={ (slot) => (
          <button
            type="button"
            className={ styles.slot }
            onClick={ () => setSelectedSeries(slot.name) }
          >
            <span className={ styles.fan }>
              { slot.left && (
                <img src={ slot.left.cover } alt="" className={ classNames(styles.fanCoverSide, styles.fanCoverLeft) } />
              ) }
              { slot.right && (
                <img src={ slot.right.cover } alt="" className={ classNames(styles.fanCoverSide, styles.fanCoverRight) } />
              ) }
              { /* CLAUDE-ADDED: Same sliding-title-over-the-cover behavior as PublicationGrid's own
                   cards (.card/.cover/.info there) -- the series name is hidden below the frame
                   (translateY(100%)) until this cover is hovered/focused, then it slides up over it. */ }
              <span className={ styles.fanCoverCenterWrap }>
                <img src={ slot.center.cover } alt="" className={ styles.fanCoverCenterImage } />
                <span className={ styles.fanTitle }>{ slot.name }</span>
              </span>
            </span>
          </button>
        ) }
      />
    </>
  );
};
