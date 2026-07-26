"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { ThBottomSheet } from "@/core/Components/Containers/ThBottomSheet";
import { ThContainerHeader } from "@/core/Components/Containers/ThContainerHeader";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThCloseButton } from "@/core/Components/Buttons/ThCloseButton";

import { Publication } from "@/components/Misc/PublicationGrid";

import PlayIcon from "./assets/icons/play_arrow.svg";

import styles from "./assets/styles/thorium-web.bookSheet.module.css";

import type { SheetRef } from "react-modal-sheet";

// CLAUDE-ADDED: Index into the snapPoints array below ([0, 0.5, 1]) that the sheet opens at --
// cover/title/author/series only, per snap value 0.5. There's no equivalent FULL_SNAP index
// anymore: wheel-scrolling moves the sheet by directly setting its underlying motion value (see
// handleBodyRef below) rather than animating to a fixed snap, so "fully open" is just wherever
// that continuous tracking ends up (y reaching 0), not a discrete state.
const PEEK_SNAP = 1;

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

            { displayed.description && (
              <div>
                <h3 className={ styles.descriptionHeading }>Description</h3>
                <p className={ styles.descriptionText }>{ displayed.description }</p>
              </div>
            ) }
          </div>
          </>
        ) }
      </ThContainerBody>
    </ThBottomSheet>
  );
};
