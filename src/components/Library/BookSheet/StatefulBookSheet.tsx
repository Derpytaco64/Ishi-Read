"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import classNames from "classnames";

import { Button, Disclosure, DisclosurePanel, Heading } from "react-aria-components";

import { Locator } from "@readium/shared";

import { ThBottomSheet } from "@/core/Components/Containers/ThBottomSheet";
import { ThContainerHeader } from "@/core/Components/Containers/ThContainerHeader";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThCloseButton } from "@/core/Components/Buttons/ThCloseButton";
import { ThModal } from "@/core/Components/Containers/ThModal";

import { Publication } from "@/components/Misc/PublicationGrid";

import { getManifestUrlFromBookUrl } from "@/helpers/getBookProgress";
import { fetchPositionFromServer } from "@/lib/userData/positionApi";
import { fetchReadingTimeFromServer } from "@/lib/userData/readingTimeApi";
import { fetchWordCountFromServer } from "@/lib/userData/wordCountApi";
import { fetchPageCountFromServer } from "@/lib/userData/pageCountApi";
import { fetchGlobalReadingSpeedSamplesFromServer } from "@/lib/userData/readingSpeedApi";
import { fetchCompletedReadTimesFromServer } from "@/lib/userData/completedReadTimesApi";
import { fetchHighlightsFromServer, deleteHighlightFromServer } from "@/lib/userData/highlightsApi";
import { fetchBookmarksFromServer, deleteBookmarkFromServer } from "@/lib/userData/bookmarksApi";
import { fetchNotesFromServer, saveNoteToServer, deleteNoteFromServer } from "@/lib/userData/notesApi";
import { StoredCompletedReadTime } from "@/lib/userData/readingTimeTypes";
import { StoredNote } from "@/lib/userData/annotationTypes";
import { computeCurrentWpm, estimateSecondsLeft } from "@/components/Actions/ReadingTimer/helpers/computeReadingSpeed";
import { formatFullReadingTime, formatEstimatedTime, ReadingTimeUnitLabels } from "@/components/Actions/ReadingTimer/helpers/formatReadingTime";
import { formatTimestamp, formatDateOnly } from "@/components/Actions/Annotations/helpers/formatTimestamp";
import { getHighlightColorHex } from "@/components/Actions/Annotations/helpers/highlightColors";
import { NoteMarkdownExcerpt } from "@/components/Actions/Annotations/helpers/NoteMarkdownExcerpt";

import PlayIcon from "./assets/icons/play_arrow.svg";
import ChevronDown from "./assets/icons/chevron_down.svg";
import EditIcon from "./assets/icons/edit.svg";
import DeleteIcon from "./assets/icons/delete.svg";
import CheckIcon from "./assets/icons/check.svg";
import CloseIcon from "./assets/icons/close.svg";

import styles from "./assets/styles/thorium-web.bookSheet.module.css";

import type { SheetRef } from "react-modal-sheet";

// CLAUDE-ADDED: Index into the snapPoints array below ([0, 0.5, 1]) that the sheet opens at --
// cover/title/author/series only, per snap value 0.5. Wheel-scrolling itself doesn't use a discrete
// FULL_SNAP index (see handleBodyRef below) -- it moves the sheet by directly setting its underlying
// motion value, so "fully open" from a wheel drag is just wherever that continuous tracking ends up
// (y reaching 0). FULL_SNAP below is only used for the one discrete jump-to-full case (expanding the
// Annotations disclosure -- see its onExpandedChange), not for wheel-driven movement.
const PEEK_SNAP = 1;
const FULL_SNAP = 2;

// CLAUDE-ADDED: StatefulBookSheet doesn't use the app's i18n system (see formatDate below, and every
// other hardcoded English label in this file) -- plain literals here match that existing convention
// rather than introducing useI18n just for this one section.
const READING_TIME_UNITS: ReadingTimeUnitLabels = { seconds: "s", minutes: "m", hours: "h" };

// CLAUDE-ADDED: Geometry for the read-progress dial. Deliberately sized and stroked differently from
// PublicationGrid's own ProgressRing (46px/17r/5 stroke) -- that one's a small corner badge on a
// thumbnail; this is a standalone detail-panel graphic and reads better bigger. Colors come from
// this component's own --th-color-* custom properties (see .root) instead of ProgressRing's
// hardcoded yellow-on-black, so it matches the sheet's light/dark theme instead of always looking
// like the grid's dark overlay treatment.
const DIAL_SIZE = 225;
const DIAL_RADIUS = 100;
const DIAL_STROKE = 25;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

const ReadProgressDial = ({ percent }: { percent: number }) => {
  const clamped = Math.min(100, Math.max(0, percent));
  const center = DIAL_SIZE / 2;
  const dashOffset = DIAL_CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <svg
      className={ styles.progressDial }
      width={ DIAL_SIZE }
      height={ DIAL_SIZE }
      viewBox={ `0 0 ${ DIAL_SIZE } ${ DIAL_SIZE }` }
      role="img"
      aria-label={ `${ clamped.toFixed(1) }% read` }
    >
      <g transform={ `rotate(-90 ${ center } ${ center })` }>
        <circle
          className={ styles.progressDialTrack }
          cx={ center } cy={ center } r={ DIAL_RADIUS }
          strokeWidth={ DIAL_STROKE }
        />
        <circle
          className={ styles.progressDialFill }
          cx={ center } cy={ center } r={ DIAL_RADIUS }
          strokeWidth={ DIAL_STROKE }
          strokeDasharray={ DIAL_CIRCUMFERENCE }
          strokeDashoffset={ dashOffset }
          strokeLinecap="round"
        />
      </g>
      <text
        className={ styles.progressDialText }
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
      >
        { clamped.toFixed(1) }%
      </text>
    </svg>
  );
};

// CLAUDE-ADDED: Everything the "Reading Timer" and "Completed Read" sections need, fetched together
// per book (see the effect below) since they're all keyed by the same manifestUrl and most of them
// (wpm, secondsLeft) are derived from more than one of the raw values.
interface ReadingStats {
  percent: number | null;
  totalSeconds: number | null;
  wpm: number | null;
  secondsLeft: number | null;
  // CLAUDE-ADDED: Most recent completed read only (see the effect's sort-and-take-first below), not
  // the full history -- "the last run", matching the reader's own Completed tab's most-recent-first
  // ordering, just showing the one entry instead of the whole list.
  lastCompletedRead: StoredCompletedReadTime | null;
}

// CLAUDE-ADDED: Merges highlights/bookmarks/notes into one list, same union AnnotationListEntry
// represents in the reader's own panel (AnnotationsContent.tsx). id/updatedAt are carried (unlike
// the original display-only version of this shape) so edit/delete here can round-trip back to the
// same server records those APIs already key by id -- see handleDeleteAnnotation/saveEditingNote.
interface AnnotationDisplayEntry {
  key: string;
  id: string;
  kind: "highlight" | "bookmark" | "note";
  locator: Locator;
  color?: string;
  noteText?: string;
  createdAt: number;
  updatedAt?: number;
  // CLAUDE-ADDED: Resolved once at creation time (see resolveChapterTitle.ts) and just carried
  // through here -- unlike the reader's own AnnotationsContent, there's no live navigator/TOC for a
  // book opened from the library to fall back to, so an annotation created before this field existed
  // simply has none here.
  chapterTitle?: string;
}

// CLAUDE-ADDED: Same tab set as the reader's own AnnotationsContent.tsx (its AnnotationsTab type),
// just re-declared locally rather than importing that component's type -- this sheet has its own,
// much simpler tab bar (no sort toggle, no bookmark-this-page action) and shouldn't pull in that
// panel's whole prop surface just for the tab name union.
type AnnotationsTab = "all" | "highlights" | "bookmarks" | "notes";

const ANNOTATIONS_TABS: { key: AnnotationsTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "highlights", label: "Highlights" },
  { key: "bookmarks", label: "Bookmarks" },
  { key: "notes", label: "Notes" }
];

export interface StatefulBookSheetProps {
  publication: Publication | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

// CLAUDE-ADDED: addedAt is a numeric ms timestamp (from a filesystem stat), while
// modified/published come through as manifest ISO date strings -- both need the same calibre-style
// "May 20, 2019" display format. Formatted in UTC rather than the browser's local timezone because
// "published" in particular is typically a date-only value serialized as midnight UTC
// ("2019-05-20T00:00:00Z") -- formatting that in any timezone behind UTC (most of the Americas)
// rolls it back to the previous day.
const formatDate = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
};

export const StatefulBookSheet = ({
  publication,
  isOpen,
  onOpenChange
}: StatefulBookSheetProps) => {
  // CLAUDE-ADDED: publication is cleared on selection but kept around here so the sheet's content
  // doesn't disappear mid slide-down -- it keeps showing the last-selected book while closing.
  // Synced during render (not via useEffect) so `displayed` is never a tick behind `isOpen`: if it
  // lagged by one render, the very first open of the sheet would reach ThBottomSheet with real
  // content only *after* the sheet had already mounted, and its one-shot open-focus handling would
  // miss the window entirely -- Escape/keyboard dismissal would then silently do nothing.
  const [displayed, setDisplayed] = useState<Publication | null>(null);
  if (publication && publication !== displayed) {
    setDisplayed(publication);
  }

  // CLAUDE-ADDED: FocusScope's own autoFocus doesn't reliably land inside the sheet on open (focus
  // stays on the book card that was clicked, so Escape/Tab never reach the sheet), and ThBottomSheet's
  // own focusOptions mechanism fires on a fixed 100ms timer that's shorter than the sheet's actual
  // slide-up animation -- calling .focus() on an element that's still off-screen/hidden mid-animation
  // is a silent no-op in browsers. onOpenEnd fires only once the real animation has finished, so the
  // target is guaranteed focusable by then.
  const playLinkRef = useRef<HTMLAnchorElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [copiedUuid, setCopiedUuid] = useState(false);
  const handleCopyUuid = () => {
    if (!displayed?.uuid) return;
    navigator.clipboard.writeText(displayed.uuid).then(() => {
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 1500);
    }).catch(() => {});
  };

  // CLAUDE-ADDED: Powers both the read-progress dial and the "Reading Timer" section -- fetched
  // together (not via PublicationGrid's own progressByUrl prop, which only carries the percent) since
  // wpm/secondsLeft need wordCount + the same position locator's totalProgression the dial uses, both
  // keyed by manifestUrl (speedSamples itself is the one exception -- a global, cross-book buffer, see
  // readingTimeReducer.ts). Reset to null on every book change so a slow fetch never shows the
  // *previous* book's stats under the new one's title -- an empty section while loading reads better
  // than a wrong one.
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null);

  // CLAUDE-ADDED: The "Annotations" section, between Reading Timer and Completed Read -- a read-only
  // view of the book's highlights/bookmarks/notes, fetched in the same Promise.all as everything
  // above (these are cheap cache reads, same cost as position/wordCount/etc, unlike pageCount's own
  // separate effect below which can trigger an expensive first-time server computation). null while
  // loading (or no manifestUrl) so the section is simply absent rather than showing a stale book's
  // list; [] once loaded with nothing to show, which the render below also treats as "don't show the
  // section".
  const [annotations, setAnnotations] = useState<AnnotationDisplayEntry[] | null>(null);

  // CLAUDE-ADDED: Nested tab filter within the Annotations section (all/highlights/bookmarks/notes),
  // same tab set as the reader's own panel. Reset alongside annotations on every book change --
  // otherwise switching from a book you'd left on "Notes" to one with no notes at all would land on
  // an empty-looking section instead of showing what that book actually has.
  const [annotationsTab, setAnnotationsTab] = useState<AnnotationsTab>("all");

  // CLAUDE-ADDED: Inline note editing -- same editingKey/editDraft pattern as the reader's own
  // AnnotationsContent.tsx, keyed the same way each <li> is (`${kind}-${id}`) so only one row's
  // identity needs tracking at a time. Reset alongside annotations/annotationsTab on book change so
  // a stale edit-in-progress can't survive into a different book's list.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // CLAUDE-ADDED: Delete now confirms first (standalone centered ThModal, same pattern the reader's
  // own StatefulAnnotationsContainer.tsx uses) instead of deleting the moment the trash icon is
  // pressed -- see handleDeleteAnnotation/confirmDeleteAnnotation below.
  const [pendingDeleteAnnotation, setPendingDeleteAnnotation] = useState<AnnotationDisplayEntry | null>(null);

  useEffect(() => {
    setReadingStats(null);
    setAnnotations(null);
    setAnnotationsTab("all");
    setEditingKey(null);
    setPendingDeleteAnnotation(null);

    if (!displayed) return;
    const manifestUrl = getManifestUrlFromBookUrl(displayed.url);
    if (!manifestUrl) return;

    let cancelled = false;

    Promise.all([
      fetchPositionFromServer(manifestUrl),
      fetchReadingTimeFromServer(manifestUrl),
      fetchWordCountFromServer(manifestUrl),
      fetchGlobalReadingSpeedSamplesFromServer(),
      fetchCompletedReadTimesFromServer(manifestUrl),
      fetchHighlightsFromServer(manifestUrl),
      fetchBookmarksFromServer(manifestUrl),
      fetchNotesFromServer(manifestUrl)
    ]).then(([locator, totalSeconds, wordCount, speedSamples, completedReadTimes, highlights, bookmarks, notes]) => {
      if (cancelled) return;

      const totalProgression = locator?.locations.totalProgression;
      const percent = typeof totalProgression === "number"
        ? Math.round(Math.min(1, Math.max(0, totalProgression)) * 1000) / 10
        : null;
      const wpm = computeCurrentWpm(speedSamples);
      const secondsLeft = wordCount !== null && typeof totalProgression === "number"
        ? estimateSecondsLeft(wordCount, totalProgression, wpm)
        : null;
      // CLAUDE-ADDED: Same most-recent-first ordering as StatefulReadingTimerContainer's own
      // sortedCompletedReadTimes -- upsertCompletedReadTime appends, so completedAt (not array
      // order) is what actually determines which one is "the last run".
      const lastCompletedRead = completedReadTimes.length > 0
        ? completedReadTimes.reduce((latest, item) => item.completedAt > latest.completedAt ? item : latest)
        : null;

      setReadingStats({ percent, totalSeconds, wpm, secondsLeft, lastCompletedRead });

      // CLAUDE-ADDED: Same deserialize-and-drop-unparseable-entries pattern as
      // StatefulAnnotationsContainer.tsx's own `entries` memo (the reader's interactive panel this
      // read-only section summarizes) -- locator is stored as an opaque serialized blob, Locator.
      // deserialize turns it back into something with .text/.title/.locations to actually display.
      const highlightEntries: AnnotationDisplayEntry[] = highlights.flatMap(item => {
        const itemLocator = Locator.deserialize(item.locator);
        if (!itemLocator) return [];
        return [{ key: `highlight-${ item.id }`, id: item.id, kind: "highlight" as const, locator: itemLocator, color: item.color, createdAt: item.createdAt, chapterTitle: item.chapterTitle }];
      });

      const bookmarkEntries: AnnotationDisplayEntry[] = bookmarks.flatMap(item => {
        const itemLocator = Locator.deserialize(item.locator);
        if (!itemLocator) return [];
        return [{ key: `bookmark-${ item.id }`, id: item.id, kind: "bookmark" as const, locator: itemLocator, createdAt: item.createdAt, chapterTitle: item.chapterTitle }];
      });

      const noteEntries: AnnotationDisplayEntry[] = notes.flatMap(item => {
        const itemLocator = Locator.deserialize(item.locator);
        if (!itemLocator) return [];
        return [{ key: `note-${ item.id }`, id: item.id, kind: "note" as const, locator: itemLocator, noteText: item.text, createdAt: item.createdAt, updatedAt: item.updatedAt, chapterTitle: item.chapterTitle }];
      });

      // CLAUDE-ADDED: Book order (start to end), same as StatefulAnnotationsContainer's default
      // ascending sort -- reads better for "browsing this book's annotations" than creation order,
      // since it lines up with the order you'd actually encounter them while reading.
      const bookOrder = (entry: AnnotationDisplayEntry) => [
        entry.locator.locations.position ?? entry.locator.locations.totalProgression ?? 0,
        entry.locator.locations.progression ?? 0
      ];

      const combinedAnnotations = [...highlightEntries, ...bookmarkEntries, ...noteEntries].sort((a, b) => {
        const [aPos, aProg] = bookOrder(a);
        const [bPos, bProg] = bookOrder(b);
        return aPos - bPos || aProg - bProg;
      });

      setAnnotations(combinedAnnotations);
    });

    return () => {
      cancelled = true;
    };
  }, [displayed]);

  // CLAUDE-ADDED: Deliberately its own effect/state, not bundled into the Promise.all above -- unlike
  // every other value there (which just reads back something already cached), fetching this can
  // itself *trigger* a first-ever server-side computation (see the pageCount route), which walks
  // every reading-order resource and can take a few seconds for a long book. Bundling it in would
  // hold up the progress dial and reading-timer stats, which are otherwise cheap cache reads, behind
  // that. Letting it resolve independently means the rest of the sheet renders immediately and the
  // pages chip just pops in once it's ready.
  const [pageCount, setPageCount] = useState<number | null>(null);

  useEffect(() => {
    setPageCount(null);

    if (!displayed) return;
    const manifestUrl = getManifestUrlFromBookUrl(displayed.url);
    if (!manifestUrl) return;

    let cancelled = false;
    fetchPageCountFromServer(manifestUrl).then((count) => {
      if (!cancelled) setPageCount(count);
    });

    return () => {
      cancelled = true;
    };
  }, [displayed]);

  // CLAUDE-ADDED: sheetRef exposes react-modal-sheet's underlying `y` motion value (its vertical
  // offset -- 0 is fully open, sheetHeight is fully closed) and `height` (the measured sheet
  // height). The wheel handler below sets `y` directly instead of calling the imperative snapTo(),
  // so the sheet tracks the wheel continuously (comes into view proportionally to how much you've
  // scrolled) rather than jumping/animating to a fixed endpoint on the first tick.
  const sheetRef = useRef<SheetRef | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);

  // CLAUDE-ADDED: Mirrors react-modal-sheet's own internal currentSnap (see Sheet.Header/Sheet.Content's
  // sheetContext.currentSnap) out to this component so compounds.header's disableDrag below can be
  // gated the same way compounds.content's already is. react-modal-sheet's own Sheet.Header doesn't
  // support a *function* disableDrag the way Sheet.Content does (it only ever checks its prop for
  // truthiness, so passing a function there would just permanently disable it) -- onSnap is the one
  // hook the library exposes for reading currentSnap reactively from outside, so it's tracked here and
  // turned into a plain boolean instead.
  const [currentSnap, setCurrentSnap] = useState<number>(PEEK_SNAP);

  // CLAUDE-ADDED: react-modal-sheet unmounts the sheet's entire content subtree (including this
  // body, and the content-scroller div wrapping it) whenever the sheet is fully closed -- see
  // react-modal-sheet/dist/index.js's `state !== "closed" ? children : null`. A plain useRef +
  // useEffect(..., []) attaches once at StatefulBookSheet's own mount, while the sheet is still
  // closed and that subtree doesn't exist yet, and never re-runs on later opens. A ref callback on
  // ThContainerBody instead fires every time its div actually mounts/unmounts, so re-attaching here
  // always lands on a real node. Its parentElement is react-modal-sheet's own scroller div (the
  // actual overflow-y: auto element -- see Sheet.Content in the library source, which renders this
  // body as the scroller's only child), which is what we need for both the wheel listener target
  // and its scrollTop check.
  //
  // React attaches onWheel/onTouchMove listeners as passive by default (see the React 17
  // changelog), so e.preventDefault() from a JSX onWheel prop is silently ignored -- without it, a
  // wheel-down at the peek position would scroll the (empty, not-yet-overflowing) content-scroller
  // instead of dragging the sheet open. A manually attached, non-passive native listener is the
  // only way to actually block the scroller's default action when we want the sheet to move
  // instead of its content.
  const handleBodyRef = useCallback((node: HTMLDivElement | null) => {
    wheelCleanupRef.current?.();
    wheelCleanupRef.current = null;

    const scroller = node?.parentElement;
    if (!scroller) return;

    const onWheel = (e: WheelEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;

      const fullY = 0;
      // CLAUDE-ADDED: Matches the 0.5 peek entry in snapPoints below -- half the sheet's own
      // (near-viewport) height stays off-screen at rest, same as before, just no longer expressed
      // as a snap index since there's nothing to snap to anymore.
      const peekY = sheet.height / 2;
      const current = sheet.y.get();

      if (e.deltaY > 0 && current > fullY) {
        e.preventDefault();
        sheet.y.set(Math.max(fullY, current - e.deltaY));
      } else if (e.deltaY < 0 && current < peekY && scroller.scrollTop <= 0) {
        e.preventDefault();
        sheet.y.set(Math.min(peekY, current - e.deltaY));
      }
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });

    // CLAUDE-ADDED: .cover/.playButton overhang above .container's rounded top corner (see their own
    // CSS) -- deliberately positioned outside .scroller entirely so that overhang isn't clipped by
    // .scroller's own overflow-y: auto (see the .header comment in the stylesheet). That also means
    // they don't naturally scroll away with the rest of the content once the sheet is fully raised
    // and .scroller starts scrolling on its own (once content is taller than one viewport -- see the
    // Annotations section) -- without this, they stay pinned in place, floating over whatever content
    // has scrolled up underneath them instead of scrolling off with the header area they belong to.
    // Mirroring .scroller's own scrollTop onto a CSS var both elements read via transform: translateY
    // (see the stylesheet) keeps them moving in lockstep with the content, same as if they were
    // actually part of it -- .closeButton is deliberately left out of this (no matching CSS var
    // reference), staying reachable at any scroll position instead of scrolling away too.
    const container = scroller.closest<HTMLElement>(`.${ styles.container }`);
    const onScroll = () => {
      container?.style.setProperty("--th-booksheet-cover-scroll-offset", `${ -scroller.scrollTop }px`);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    wheelCleanupRef.current = () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, []);

  // CLAUDE-ADDED: Computed once per render rather than inline twice in the JSX below (once for the
  // empty-tab check, once for the actual list) -- these arrays are small (a book's own annotations),
  // so this doesn't need useMemo, just a single shared value instead of two duplicate filter calls.
  const filteredAnnotations = !annotations ? [] : annotationsTab === "all"
    ? annotations
    : annotations.filter(entry => `${ entry.kind }s` === annotationsTab);

  // CLAUDE-ADDED: Opens the confirm dialog rather than deleting directly -- see
  // pendingDeleteAnnotation above and confirmDeleteAnnotation below.
  const handleDeleteAnnotation = (entry: AnnotationDisplayEntry) => {
    setPendingDeleteAnnotation(entry);
  };

  const closeDeleteConfirm = () => setPendingDeleteAnnotation(null);

  // CLAUDE-ADDED: Deletes locally first (so the row disappears immediately) then fires the matching
  // server delete -- same bundled local-update + server-persist shape annotationsReducer.ts's own
  // deleteHighlight/deleteBookmark/deleteNote thunks use for the reader's own panel, just without a
  // Redux round-trip since this sheet never loads annotations into the store to begin with.
  const confirmDeleteAnnotation = () => {
    const entry = pendingDeleteAnnotation;
    const manifestUrl = displayed ? getManifestUrlFromBookUrl(displayed.url) : null;

    if (entry && manifestUrl) {
      setAnnotations((prev) => prev?.filter((item) => item.key !== entry.key) ?? prev);
      if (editingKey === entry.key) setEditingKey(null);

      if (entry.kind === "highlight") deleteHighlightFromServer(manifestUrl, entry.id);
      else if (entry.kind === "bookmark") deleteBookmarkFromServer(manifestUrl, entry.id);
      else deleteNoteFromServer(manifestUrl, entry.id);
    }

    setPendingDeleteAnnotation(null);
  };

  const beginEditingNote = (entry: AnnotationDisplayEntry) => {
    setEditingKey(entry.key);
    setEditDraft(entry.noteText ?? "");
  };

  const cancelEditingNote = () => setEditingKey(null);

  const saveEditingNote = (entry: AnnotationDisplayEntry) => {
    const manifestUrl = displayed ? getManifestUrlFromBookUrl(displayed.url) : null;
    if (!manifestUrl || !editDraft.trim()) return;

    const updatedNote: StoredNote = {
      id: entry.id,
      locator: entry.locator.serialize(),
      text: editDraft,
      createdAt: entry.createdAt,
      updatedAt: Date.now()
    };

    setAnnotations((prev) => prev?.map((item) =>
      item.key === entry.key ? { ...item, noteText: updatedNote.text, updatedAt: updatedNote.updatedAt } : item
    ) ?? prev);
    saveNoteToServer(manifestUrl, updatedNote);
    setEditingKey(null);
  };

  return (
    <>
    <ThBottomSheet
      ref={ sheetRef }
      isOpen={ isOpen }
      onOpenChange={ onOpenChange }
      onOpenEnd={ () => (playLinkRef.current ?? closeButtonRef.current)?.focus({ preventScroll: true }) }
      // CLAUDE-ADDED: detent="default" + snapPoints gives the card one fixed (near-viewport) height
      // always, with only its *position* changing -- opening at PEEK_SNAP (0.5) shows the
      // cover/title/author/series and leaves the details panel below the viewport's bottom edge.
      // snapPoints/initialSnap here only drive that initial open position and the drag-to-nearest-
      // point behavior when grabbing the card directly (react-modal-sheet's own default, needed
      // since touch devices have no wheel) -- wheel-scrolling (see handleBodyRef's wheel listener
      // above) bypasses snapping entirely, setting the sheet's position directly so it tracks the
      // wheel continuously instead of animating to a fixed point. The drag handle that would
      // normally also move between snaps is hidden (.dragIndicator, in the stylesheet) since the
      // wheel is the intended way to do this now.
      detent="default"
      snapPoints={ [0, 0.5, 1] }
      initialSnap={ PEEK_SNAP }
      onSnap={ setCurrentSnap }
      className={ styles.root }
      compounds={{
        container: { className: classNames(styles.container, displayed?.isAudiobook && styles.containerAudiobook) },
        // CLAUDE-ADDED: Gated the same as compounds.content below (currentSnap === FULL_SNAP) --
        // without this, dragging the cover/play-button area (rendered inside Sheet.Header, see
        // ThContainerHeader below) always moved the whole sheet, even once fully open, while dragging
        // the details area right next to it had already handed off to native content scroll at that
        // point (see compounds.content's own comment). Same physical gesture doing two different
        // things depending on exactly where it started read as the cover/play button being
        // "disconnected" from the rest of the card instead of moving with it.
        header: { className: styles.header, disableDrag: currentSnap === FULL_SNAP },
        dragIndicator: { className: styles.dragIndicator },
        // CLAUDE-ADDED: ThBottomSheet sets `contain: content` + `overscroll-behavior: contain` on
        // this element via a direct style mutation whenever the sheet is draggable (snapPoints.length
        // > 1, true here) -- contain: paint (implied by contain: content) clipped anything rendering
        // outside this element's own box, which broke both the cover/play button's overhang and the
        // content-scroller's own ability to reveal content past its bottom edge once the card is
        // fully expanded. .scroller below (a class scoped to only this sheet, not the global
        // react-modal-sheet class) overrides just `contain` back to none.
        scroller: { className: styles.scroller },
        // CLAUDE-ADDED: On touch, react-modal-sheet's own content-area drag gesture is gated by
        // its internal scroll-position tracking (only hands off to native scroll once a real "scroll"
        // DOM event has already moved scrollTop away from 0) -- while the sheet sits at rest fully
        // open with the content scrolled to its very top (the common case right after opening), that
        // event has never fired, so every further drag on the body keeps being consumed by the
        // sheet-drag gesture instead of ever reaching the scroller, permanently deadlocking touch
        // scroll past the point the cover finishes condensing. Tying disableDrag to the snap index we
        // already track (see FULL_SNAP/handleBodyRef's wheel handoff, which gates the same "are we
        // fully open" condition for wheel input) sidesteps that scroll-position gate entirely: once
        // fully open, touch drags on the body always fall through to native scroll from the start.
        content: {
          disableDrag: ({ currentSnap }) => currentSnap === FULL_SNAP
        },
        backdrop: { className: styles.backdrop }
      }}
    >
      <ThContainerHeader
        label={ displayed?.title ?? "Book details" }
        compounds={{
          heading: { className: styles.visuallyHidden }
        }}
      >
        { /* CLAUDE-ADDED: Rendered here (inside the header, outside react-modal-sheet's own
             content-scroller) rather than in the body below, specifically so they can overhang the
             *card's* top edge -- .container has overflow: visible, but .scroller has its own
             independent overflow-y: auto clipping anything that renders above its own top, no matter
             what .container allows. The header sits outside the scroller entirely, so .cover/
             .playButton's negative top offsets (see the stylesheet) land in the clear. */ }
        { displayed && (
          <>
          <figure className={ styles.cover }>
            <img src={ displayed.cover } alt="" className={ styles.coverImage } />
          </figure>

          <Link
            ref={ playLinkRef }
            // CLAUDE-ADDED: Cast to Route since publication.url is a dynamically-built manifest path that next.config.mjs's typedRoutes can't statically verify.
            href={ displayed.url as Route }
            className={ styles.playButton }
            aria-label={ `Open ${ displayed.title }` }
            onClick={ () => onOpenChange(false) }
          >
            <PlayIcon aria-hidden="true" focusable="false" />
          </Link>
          </>
        ) }

        <ThCloseButton
          ref={ closeButtonRef }
          className={ styles.closeButton }
          aria-label="Close"
          onPress={ () => onOpenChange(false) }
        />
      </ThContainerHeader>

      <ThContainerBody ref={ handleBodyRef } className={ styles.body }>
        { displayed && (
          <>
          { /* CLAUDE-ADDED: Reserves flow height above .heroRow so its title/author/series text
               starts at a reasonable position below the card's rounded top corner, clear of the
               cover art overhanging above it (see ThContainerHeader above and .spacer's comment in
               the stylesheet). */ }
          <div className={ styles.spacer } aria-hidden="true" />
          <div className={ styles.heroRow }>
            <div className={ styles.meta }>
              <h2 className={ styles.title }>{ displayed.title }</h2>
              <p className={ styles.author }>{ displayed.author }</p>
              { displayed.series?.name && (
                <p className={ styles.series }>
                  { displayed.series.name }
                  { displayed.series.position ? ` #${ displayed.series.position }` : "" }
                </p>
              ) }
              { displayed.rendition && (
                <p className={ styles.rendition }>{ displayed.rendition }</p>
              ) }
            </div>
          </div>

          { /* CLAUDE-ADDED: calibre-style metadata panel -- everything here is sourced from
               manifest.metadata (see src/app/api/books/route.ts) except fileSize, which comes from
               a filesystem stat since EPUB byte size was never part of the manifest to begin with. */ }
          <div className={ styles.details }>
            <div className={ styles.detailsTop }>
              <div className={ styles.detailsChips }>
                { (displayed.calibreId || displayed.uuid || displayed.addedAt || displayed.modified || displayed.fileSize || pageCount) && (
                  <div className={ styles.chipRow }>
                    { displayed.calibreId && (
                      <span className={ styles.chip }><strong>ID:</strong> { displayed.calibreId }</span>
                    ) }
                    { displayed.uuid && (
                      <span className={ styles.chip }>
                        <strong>UUID:</strong>
                        <button type="button" className={ styles.chipButton } onClick={ handleCopyUuid }>
                          { copiedUuid ? "Copied!" : "Copy UUID" }
                        </button>
                      </span>
                    ) }
                    { formatDate(displayed.addedAt) && (
                      <span className={ styles.chip }><strong>Date added:</strong> { formatDate(displayed.addedAt) }</span>
                    ) }
                    { formatDate(displayed.modified) && (
                      <span className={ styles.chip }><strong>Last modified:</strong> { formatDate(displayed.modified) }</span>
                    ) }
                    { displayed.fileSize && (
                      <span className={ styles.chip }><strong>File size:</strong> { displayed.fileSize }</span>
                    ) }
                    { /* CLAUDE-ADDED: The original Thorium Reader's own 1024-character-per-page
                         estimate, computed server-side on demand (see pageCountCompute.ts) -- no
                         reader needed. 0 (a real but uninformative result for a pathological
                         empty-text book) is excluded the same way percent > 0 is gated on above. */ }
                    { !!pageCount && (
                      <span className={ styles.chip }><strong># of pages:</strong> { pageCount }</span>
                    ) }
                  </div>
                ) }

                { (displayed.language || displayed.isbn) && (
                  <div className={ styles.chipRow }>
                    { displayed.language && (
                      <span className={ styles.chip }><strong>Language:</strong> { displayed.language }</span>
                    ) }
                    { displayed.isbn && (
                      <span className={ styles.chip }><strong>ISBN:</strong> { displayed.isbn }</span>
                    ) }
                  </div>
                ) }

                { displayed.tags && displayed.tags.length > 0 && (
                  <div className={ styles.tagsRow }>
                    { displayed.tags.map((tag) => (
                      <span key={ tag } className={ styles.tag }>{ tag }</span>
                    )) }
                  </div>
                ) }

                { (displayed.publisher || displayed.published) && (
                  <div className={ styles.chipRow }>
                    { displayed.publisher && (
                      <span className={ styles.chip }><strong>Publisher:</strong> { displayed.publisher }</span>
                    ) }
                    { formatDate(displayed.published) && (
                      <span className={ styles.chip }><strong>Published:</strong> { formatDate(displayed.published) }</span>
                    ) }
                  </div>
                ) }
              </div>

              { /* CLAUDE-ADDED: Only rendered once there's actual progress to show -- readingStats
                   starts null while its fetch is in flight (or the book's never been opened, in which
                   case percent itself resolves to null), and a 0%/empty dial isn't more informative
                   than no dial at all. Matches PublicationGrid's ProgressRing convention (percent > 0
                   gate) for the same reason. */ }
              { readingStats?.percent !== null && readingStats?.percent !== undefined && readingStats.percent > 0 && (
                <ReadProgressDial percent={ readingStats.percent } />
              ) }
            </div>

            { displayed.description && (
              <div>
                <h3 className={ styles.descriptionHeading }>Description</h3>
                <p className={ styles.descriptionText }>{ displayed.description }</p>
              </div>
            ) }

            { /* CLAUDE-ADDED: The reader's own StatefulReadingTimerContainer shows this same
                 trio (elapsed time / current pace / time left) plus a full daily-history table and
                 reset/delete controls -- this is the read-only summary version for a library-level
                 popup, reusing its exact formatting/estimation helpers so the numbers always agree
                 with what the in-reader panel shows for the same book. */ }
            { readingStats && (readingStats.totalSeconds !== null || readingStats.wpm !== null) && (
              <div>
                <h3 className={ styles.descriptionHeading }>Reading Timer</h3>
                <div className={ styles.statsRow }>
                  { readingStats.totalSeconds !== null && (
                    <span className={ styles.chip }>
                      <strong>Time read:</strong> { formatFullReadingTime(readingStats.totalSeconds, READING_TIME_UNITS) }
                    </span>
                  ) }
                  { readingStats.wpm !== null && (
                    <span className={ styles.chip }><strong>Pace:</strong> { Math.round(readingStats.wpm) } wpm</span>
                  ) }
                  { readingStats.secondsLeft !== null && (
                    <span className={ styles.chip }>
                      <strong>Time left:</strong> { formatEstimatedTime(readingStats.secondsLeft, READING_TIME_UNITS) }
                    </span>
                  ) }
                </div>
              </div>
            ) }

            { /* CLAUDE-ADDED: Read-only view of the book's highlights/bookmarks/notes -- the reader's
                 own interactive panel is AnnotationsContent.tsx (edit/delete/jump-to); this is the
                 same "summary popup, not a replacement" treatment Reading Timer/Completed Read above
                 and below already get. Sorted book order (start to end), not creation order -- see
                 the bookOrder sort in the fetch effect above. Collapsible (same Disclosure pattern
                 StatefulLibraryMenu's Settings panel uses) since a book with a lot of annotations
                 could otherwise make this an awfully long sheet to scroll past just to reach
                 Completed Read below it -- collapsed by default, same as that Settings panel. */ }
            { annotations && annotations.length > 0 && (
              <Disclosure
                className={ styles.disclosure }
                // CLAUDE-ADDED: The annotations list can be taller than the sheet's peek-open reveal
                // area, and this sheet's own wheel handler (see handleBodyRef) only hands wheel input
                // off to native content scrolling once the sheet is fully raised (current === fullY)
                // -- expanding this disclosure while still peeked left the content-scroller sized to
                // that smaller reveal area but overflowing, so the browser showed its own scrollbar
                // there instead of the wheel drag doing anything. Snapping to fully open the moment
                // this expands sidesteps that entirely: by the time there's anything to scroll, the
                // sheet is already at the one position where native scrolling is the intended handoff.
                onExpandedChange={ (isExpanded) => { if (isExpanded) sheetRef.current?.snapTo(FULL_SNAP); } }
              >
                <Heading className={ styles.disclosureHeading }>
                  <Button slot="trigger" className={ styles.disclosureTrigger }>
                    <span className={ styles.disclosureLabel }>Annotations</span>
                    <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
                  </Button>
                </Heading>

                <DisclosurePanel className={ styles.disclosurePanel }>
                  <div className={ styles.annotationsTabs } role="tablist">
                    { ANNOTATIONS_TABS.map(({ key, label }) => (
                      <button
                        key={ key }
                        type="button"
                        role="tab"
                        className={ styles.annotationsTab }
                        data-selected={ annotationsTab === key || undefined }
                        aria-selected={ annotationsTab === key }
                        onClick={ () => setAnnotationsTab(key) }
                      >
                        { label }
                      </button>
                    )) }
                  </div>

                  { /* CLAUDE-ADDED: annotations is already known non-empty here (see the gate above),
                       but a specific tab's filtered slice can still be empty -- e.g. a book with
                       highlights but no notes, viewed on the Notes tab. */ }
                  { filteredAnnotations.length === 0 ? (
                    <p className={ styles.annotationsEmpty }>Nothing here yet.</p>
                  ) : (
                    <ul className={ styles.annotationsList }>
                      { filteredAnnotations.map((entry) => {
                        const isEditing = editingKey === entry.key;

                        return (
                        <li key={ entry.key } className={ styles.annotationItem }>
                          { /* CLAUDE-ADDED: Always rendered (transparent for non-highlights) rather
                               than only for highlight rows -- keeps every row's body starting at the
                               same x position instead of bookmark/note rows sitting flush left while
                               highlight rows are indented past the swatch. */ }
                          <span
                            className={ styles.annotationSwatch }
                            style={ { backgroundColor: entry.kind === "highlight" ? getHighlightColorHex(entry.color ?? "") : "transparent" } }
                            aria-hidden="true"
                          />

                          { isEditing ? (
                            <div className={ styles.annotationEdit } onClick={ (event) => event.stopPropagation() }>
                              <textarea
                                className={ styles.annotationTextarea }
                                value={ editDraft }
                                onChange={ (event) => setEditDraft(event.target.value) }
                                autoFocus
                              />
                              <div className={ styles.annotationEditActions }>
                                <button type="button" className={ styles.annotationIconButton } aria-label="Save" onClick={ () => saveEditingNote(entry) }>
                                  <CheckIcon aria-hidden="true" focusable="false" />
                                </button>
                                <button type="button" className={ styles.annotationIconButton } aria-label="Cancel" onClick={ cancelEditingNote }>
                                  <CloseIcon aria-hidden="true" focusable="false" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                            <div className={ styles.annotationBody }>
                              <p className={ styles.annotationExcerpt }>
                                { entry.kind === "note" && entry.noteText
                                  ? <NoteMarkdownExcerpt text={ entry.noteText } />
                                  : (entry.locator.text?.highlight || entry.chapterTitle || entry.locator.href) }
                              </p>
                              { entry.kind === "note" && entry.locator.text?.highlight && (
                                <p className={ styles.annotationQuote }>“{ entry.locator.text.highlight }”</p>
                              ) }
                              <div className={ styles.statsRow }>
                                <span className={ styles.chip }>
                                  { entry.kind === "highlight" ? "Highlight" : entry.kind === "bookmark" ? "Bookmark" : "Note" }
                                </span>
                                { /* CLAUDE-ADDED: Omitted when it's already the excerpt above (a
                                     text-less bookmark/highlight falls back to chapterTitle as its
                                     own excerpt line) so the chapter name isn't shown twice. */ }
                                { (entry.kind === "note" || entry.locator.text?.highlight) && entry.chapterTitle && (
                                  <span className={ styles.chip }>{ entry.chapterTitle }</span>
                                ) }
                                { typeof entry.locator.locations?.totalProgression === "number" && (
                                  <span className={ styles.chip }>{ (entry.locator.locations.totalProgression * 100).toFixed(1) }%</span>
                                ) }
                                <span className={ styles.chip }>{ formatTimestamp(entry.createdAt) }</span>
                              </div>
                            </div>

                            <div className={ styles.annotationActions }>
                              { entry.kind === "note" && (
                                <button
                                  type="button"
                                  className={ styles.annotationIconButton }
                                  aria-label="Edit note"
                                  onClick={ () => beginEditingNote(entry) }
                                >
                                  <EditIcon aria-hidden="true" focusable="false" />
                                </button>
                              ) }
                              <button
                                type="button"
                                className={ styles.annotationIconButton }
                                aria-label={ `Delete ${ entry.kind }` }
                                onClick={ () => handleDeleteAnnotation(entry) }
                              >
                                <DeleteIcon aria-hidden="true" focusable="false" />
                              </button>
                            </div>
                            </>
                          ) }
                        </li>
                        );
                      }) }
                    </ul>
                  ) }
                </DisclosurePanel>
              </Disclosure>
            ) }

            { /* CLAUDE-ADDED: The most recent entry from the reader's own Completed tab (see
                 lastCompletedRead in the effect above) -- created whenever the in-reader timer is
                 reset with "save", archiving everything accumulated since the previous reset/save as
                 one completed run. Only ever the single latest one here, not the full history list
                 the reader panel shows -- this is a summary popup, not a replacement for it. */ }
            { readingStats?.lastCompletedRead && (
              <div>
                <h3 className={ styles.descriptionHeading }>Completed Read</h3>
                <div className={ styles.statsRow }>
                  <span className={ styles.chip }>
                    <strong>Completed:</strong> { formatTimestamp(readingStats.lastCompletedRead.completedAt) }
                  </span>
                  <span className={ styles.chip }>
                    <strong>Duration:</strong> { formatFullReadingTime(readingStats.lastCompletedRead.seconds, READING_TIME_UNITS) }
                  </span>
                </div>

                { /* CLAUDE-ADDED: The day-by-day breakdown archived onto this specific completed run
                     (see DailyReadingBucket/lastCompletedRead.dailyHistory) -- each bucket is one
                     day's reading session within it, same data the reader's own Completed tab shows
                     nested under each entry (see DailyHistoryRows in StatefulReadingTimerContainer),
                     just re-sorted/re-rendered here with this component's own chip styling instead of
                     that panel's baseline-aligned row layout. wpm is derived from the bucket's raw
                     seconds/words the same way computeCurrentWpm derives the rolling estimate --
                     never stored pre-computed, so it can't drift from its own inputs. */ }
                { readingStats.lastCompletedRead.dailyHistory && readingStats.lastCompletedRead.dailyHistory.length > 0 && (
                  <ul className={ styles.sessionsList }>
                    { [...readingStats.lastCompletedRead.dailyHistory]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((bucket) => {
                        const wpm = bucket.seconds > 0 ? Math.round(bucket.words / (bucket.seconds / 60)) : null;
                        const percent = Number.isFinite(bucket.progressionDelta) ? Math.round(bucket.progressionDelta * 100) : 0;

                        return (
                          <li key={ bucket.date } className={ styles.sessionRow }>
                            <span className={ styles.chip }>
                              { formatDateOnly(new Date(`${ bucket.date }T00:00:00`)) }
                            </span>
                            <span className={ styles.chip }>{ formatFullReadingTime(bucket.seconds, READING_TIME_UNITS) }</span>
                            { /* CLAUDE-ADDED: Always rendered (an em dash when there's no pace data for
                                 this day) rather than omitted -- .sessionsList aligns every row into the
                                 same 4 grid columns (see the stylesheet), so a row that skipped this cell
                                 entirely would shift its own percent cell left into the pace column,
                                 misaligning it against every other row's. */ }
                            <span className={ styles.chip }>{ wpm !== null ? `${ wpm } wpm` : "—" }</span>
                            <span className={ styles.chip }>{ percent }%</span>
                          </li>
                        );
                      }) }
                  </ul>
                ) }
              </div>
            ) }
          </div>
          </>
        ) }
      </ThContainerBody>
    </ThBottomSheet>

    { /* CLAUDE-ADDED: Standalone centered ThModal, not routed through react-modal-sheet's own
         overlay -- needs to appear "in the middle of the screen" above the book-detail sheet
         itself, same treatment the reader's own StatefulAnnotationsContainer.tsx gives its
         equivalent delete confirmation. */ }
    <ThModal
      isOpen={ pendingDeleteAnnotation !== null }
      onOpenChange={ open => { if (!open) closeDeleteConfirm(); } }
      isDismissable={ true }
      className={ styles.confirmBackdrop }
      compounds={ {
        dialog: {
          className: styles.confirmDialog,
          "aria-label": pendingDeleteAnnotation ? `Delete this ${ pendingDeleteAnnotation.kind }?` : undefined
        }
      } }
    >
      <div className={ styles.confirmText }>
        <button
          type="button"
          className={ styles.confirmClose }
          aria-label="Close"
          onClick={ closeDeleteConfirm }
        >
          <CloseIcon aria-hidden="true" focusable="false" />
        </button>
        This can't be undone.
      </div>
      <div className={ styles.confirmActions }>
        <button type="button" className={ styles.confirmButton } onClick={ closeDeleteConfirm }>
          Cancel
        </button>
        <button type="button" className={ `${ styles.confirmButton } ${ styles.confirmButtonPrimary }` } onClick={ confirmDeleteAnnotation }>
          Delete
        </button>
      </div>
    </ThModal>
    </>
  );
};
