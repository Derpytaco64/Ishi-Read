"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { ThBottomSheet } from "@/core/Components/Containers/ThBottomSheet";
import { ThContainerHeader } from "@/core/Components/Containers/ThContainerHeader";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThCloseButton } from "@/core/Components/Buttons/ThCloseButton";

import { Publication } from "@/components/Misc/PublicationGrid";

import PlayIcon from "./assets/icons/play_arrow.svg";

import styles from "./assets/styles/thorium-web.bookSheet.module.css";

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

  return (
    <ThBottomSheet
      isOpen={ isOpen }
      onOpenChange={ onOpenChange }
      onOpenEnd={ () => (playLinkRef.current ?? closeButtonRef.current)?.focus({ preventScroll: true }) }
      // CLAUDE-ADDED: detent="content" (auto-fit to content, capped at ~viewport height) made the
      // card's own height track its content -- whatever fit within that cap showed immediately,
      // which on a tall viewport meant almost everything was visible on open regardless of how the
      // scroll region was set up. detent="default" + snapPoints instead gives the card one fixed
      // (near-viewport) height always, and only its *position* changes between snaps -- opening at
      // the smaller snap genuinely leaves the rest of the (same, single) card below the viewport's
      // bottom edge, and dragging it (grab anywhere on the card, not just the handle) up to the
      // larger snap is what brings that into view. This is the same snapPoints-driven pattern the
      // reader's own bottom sheets use (see StatefulBottomSheet.tsx).
      detent="default"
      snapPoints={ [0, 0.5, 1] }
      initialSnap={ 1 }
      className={ styles.root }
      compounds={{
        container: { className: styles.container },
        header: { className: styles.header },
        dragIndicator: { className: styles.dragIndicator },
        // CLAUDE-ADDED: ThBottomSheet (the shared primitive, also used by the reader's own sheets)
        // sets `contain: content` + `overscroll-behavior: contain` on this element via a direct
        // style mutation whenever the sheet is draggable (snapPoints.length > 1, true here) -- that
        // broke two things at once: `contain: content` establishes a paint containment boundary, so
        // it clipped the cover/play button's overhang exactly the way an ancestor's overflow: auto
        // used to, and it also interfered with the content-scroller's own native scrolling once the
        // card is fully expanded but its content still doesn't fit. .scroller below (a class scoped
        // to only this sheet, not the global react-modal-sheet class, so it can't affect the
        // reader's own draggable sheets elsewhere) overrides just `contain` back to none.
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
        <ThCloseButton
          ref={ closeButtonRef }
          className={ styles.closeButton }
          aria-label="Close"
          onPress={ () => onOpenChange(false) }
        />
      </ThContainerHeader>

      <ThContainerBody className={ styles.body }>
        { displayed && (
          <>
          { /* CLAUDE-ADDED: Reserves the headroom .cover's negative top offset pokes into -- see
               .spacer's comment in the stylesheet for why. */ }
          <div className={ styles.spacer } aria-hidden="true" />
          <div className={ styles.heroRow }>
            <figure className={ styles.cover }>
              <img src={ displayed.cover } alt="" className={ styles.coverImage } />
            </figure>

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
