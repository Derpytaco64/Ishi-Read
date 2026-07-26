"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { ThBottomSheet } from "@/core/Components/Containers/ThBottomSheet";
import { ThContainerHeader } from "@/core/Components/Containers/ThContainerHeader";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThCloseButton } from "@/core/Components/Buttons/ThCloseButton";

import { Publication } from "@/components/Misc/PublicationGrid";

import { getManifestUrlFromBookUrl } from "@/helpers/getBookProgress";
import { fetchPositionFromServer } from "@/lib/userData/positionApi";
import { fetchReadingTimeFromServer } from "@/lib/userData/readingTimeApi";
import { fetchWordCountFromServer } from "@/lib/userData/wordCountApi";
import { fetchReadingSpeedSamplesFromServer } from "@/lib/userData/readingSpeedApi";
import { fetchCompletedReadTimesFromServer } from "@/lib/userData/completedReadTimesApi";
import { StoredCompletedReadTime } from "@/lib/userData/readingTimeTypes";
import { computeCurrentWpm, estimateSecondsLeft } from "@/components/Actions/ReadingTimer/helpers/computeReadingSpeed";
import { formatFullReadingTime, formatEstimatedTime, ReadingTimeUnitLabels } from "@/components/Actions/ReadingTimer/helpers/formatReadingTime";
import { formatTimestamp, formatDateOnly } from "@/components/Actions/Annotations/helpers/formatTimestamp";

import PlayIcon from "./assets/icons/play_arrow.svg";

import styles from "./assets/styles/thorium-web.bookSheet.module.css";

import type { SheetRef } from "react-modal-sheet";

// CLAUDE-ADDED: Index into the snapPoints array below ([0, 0.5, 1]) that the sheet opens at --
// cover/title/author/series only, per snap value 0.5. There's no equivalent FULL_SNAP index
// anymore: wheel-scrolling moves the sheet by directly setting its underlying motion value (see
// handleBodyRef below) rather than animating to a fixed snap, so "fully open" is just wherever
// that continuous tracking ends up (y reaching 0), not a discrete state.
const PEEK_SNAP = 1;

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
  // wpm/secondsLeft need wordCount + speedSamples + the same position locator's totalProgression the
  // dial uses, and every one of these is keyed by manifestUrl, not by the page's own book list. Reset
  // to null on every book change so a slow fetch never shows the *previous* book's stats under the
  // new one's title -- an empty section while loading reads better than a wrong one.
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null);

  useEffect(() => {
    setReadingStats(null);

    if (!displayed) return;
    const manifestUrl = getManifestUrlFromBookUrl(displayed.url);
    if (!manifestUrl) return;

    let cancelled = false;

    Promise.all([
      fetchPositionFromServer(manifestUrl),
      fetchReadingTimeFromServer(manifestUrl),
      fetchWordCountFromServer(manifestUrl),
      fetchReadingSpeedSamplesFromServer(manifestUrl),
      fetchCompletedReadTimesFromServer(manifestUrl)
    ]).then(([locator, totalSeconds, wordCount, speedSamples, completedReadTimes]) => {
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
    wheelCleanupRef.current = () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  return (
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
      className={ styles.root }
      compounds={{
        container: { className: styles.container },
        header: { className: styles.header },
        dragIndicator: { className: styles.dragIndicator },
        // CLAUDE-ADDED: ThBottomSheet sets `contain: content` + `overscroll-behavior: contain` on
        // this element via a direct style mutation whenever the sheet is draggable (snapPoints.length
        // > 1, true here) -- contain: paint (implied by contain: content) clipped anything rendering
        // outside this element's own box, which broke both the cover/play button's overhang and the
        // content-scroller's own ability to reveal content past its bottom edge once the card is
        // fully expanded. .scroller below (a class scoped to only this sheet, not the global
        // react-modal-sheet class) overrides just `contain` back to none.
        scroller: { className: styles.scroller },
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
                { (displayed.calibreId || displayed.uuid || displayed.addedAt || displayed.modified || displayed.fileSize) && (
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
  );
};
