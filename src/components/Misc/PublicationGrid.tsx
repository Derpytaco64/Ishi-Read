"use client";

import React, { cloneElement, isValidElement, useEffect, useState } from "react";

import publicationGridStyles from "./assets/styles/thorium-web.publicationGrid.module.css";

import { ThGrid } from "@/core/Components";
// CLAUDE-ADDED: Swapped react-aria-components' Link (an unwired plain <a>, causing a full page reload per click) for next/link so opening a book is a client-side navigation.
import Link from "next/link";
import type { Route } from "next";
// CLAUDE-ADDED: Reads each book's last-saved reading position so the grid can render a progress ring on its cover.
import { getBookProgressPercent } from "@/helpers/getBookProgress";

import classNames from "classnames";

// CLAUDE-ADDED: Geometry for the corner progress ring; circumference drives the stroke-dasharray/offset fill technique. Sized up slightly from the original 40/15 to fit one-decimal values like "100.0%".
const PROGRESS_RING_SIZE = 46;
const PROGRESS_RING_RADIUS = 17;
// CLAUDE-ADDED: Widened from 3 to 5 per user feedback that the fill was hard to see.
const PROGRESS_RING_STROKE = 5;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

// CLAUDE-ADDED: Circular reading-progress indicator. The two ring circles sit in a <g> rotated -90deg so the fill starts at 12 o'clock and sweeps clockwise; the percentage text lives outside that group so it stays upright.
const ProgressRing = ({ percent }: { percent: number }) => {
  const clamped = Math.min(100, Math.max(0, percent));
  const center = PROGRESS_RING_SIZE / 2;
  const dashOffset = PROGRESS_RING_CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <svg
      className={ publicationGridStyles.progressRing }
      width={ PROGRESS_RING_SIZE }
      height={ PROGRESS_RING_SIZE }
      viewBox={ `0 0 ${ PROGRESS_RING_SIZE } ${ PROGRESS_RING_SIZE }` }
      aria-hidden="true"
    >
      <circle
        className={ publicationGridStyles.progressRingBackdrop }
        cx={ center }
        cy={ center }
        r={ PROGRESS_RING_RADIUS + PROGRESS_RING_STROKE / 2 }
      />
      <g transform={ `rotate(-90 ${ center } ${ center })` }>
        <circle
          className={ publicationGridStyles.progressRingTrack }
          cx={ center }
          cy={ center }
          r={ PROGRESS_RING_RADIUS }
          strokeWidth={ PROGRESS_RING_STROKE }
        />
        <circle
          className={ publicationGridStyles.progressRingFill }
          cx={ center }
          cy={ center }
          r={ PROGRESS_RING_RADIUS }
          strokeWidth={ PROGRESS_RING_STROKE }
          strokeDasharray={ PROGRESS_RING_CIRCUMFERENCE }
          strokeDashoffset={ dashOffset }
          strokeLinecap="round"
        />
      </g>
      <text
        className={ publicationGridStyles.progressRingText }
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
      >
        { /* CLAUDE-ADDED: toFixed(1) so whole numbers still display a decimal place, e.g. "50.0%" rather than "50%". */ }
        { clamped.toFixed(1) }%
      </text>
    </svg>
  );
};

export const DefaultImage = ({
  src,
  alt = ""
}: {
  src: string;
  alt?: string;
}) => (
  <img
    src={ src }
    alt={ alt }
    className={ publicationGridStyles.image }
    loading="lazy"
  />
);

export interface Publication {
  title: string;
  author: string;
  cover: string;
  url: string;
  rendition?: string;
  addedAt?: number;
  lastReadAt?: number | null;
  series?: { name: string; position?: number } | null;
  // CLAUDE-ADDED: Extra manifest.metadata fields surfaced for the book-detail sheet's calibre-style
  // metadata panel (see StatefulBookSheet) -- optional since only the dynamic /api/books-sourced
  // shelves populate them, not the (currently unused) hardcoded book lists.
  description?: string | null;
  publisher?: string | null;
  published?: string | null;
  modified?: string | null;
  language?: string | null;
  tags?: string[];
  isbn?: string | null;
  calibreId?: string | null;
  uuid?: string | null;
  fileSize?: string | null;
}

export interface PublicationGridProps {
  publications: Publication[];
  columnWidth?: number;
  gap?: string;
  renderCover?: (publication: Publication) => React.ReactElement<React.ImgHTMLAttributes<HTMLImageElement>>;
  // CLAUDE-ADDED: Lets a caller that already fetched progress (e.g. a page rendering several
  // shelves from the same book list) hand it down instead of every grid instance re-fetching the
  // same books' positions independently. Falls back to fetching internally when omitted, so
  // standalone usage still works unchanged.
  progressByUrl?: Record<string, number>;
  // CLAUDE-ADDED: When provided, a plain click/tap on a card opens the book-detail sheet instead
  // of navigating straight to the reader -- modifier-clicks (ctrl/cmd/shift/alt) and middle-clicks
  // still fall through to the normal link navigation so "open in new tab" keeps working.
  onSelect?: (publication: Publication) => void;
}

export const PublicationGrid = ({
  publications,
  // CLAUDE-ADDED: Lowered from 400 — cards are now cover-only (see .card in the module css), so a 400px-wide column left most of each tile blank.
  columnWidth = 160,
  gap = "1.5rem",
  renderCover = (publication) => (
    <DefaultImage
      src={ publication.cover }
      alt=""
    />
  ),
  progressByUrl: providedProgressByUrl,
  onSelect,
}: PublicationGridProps) => {
  // CLAUDE-ADDED: Progress now comes from the server (see getBookProgress.ts). Only fetched here
  // when the caller hasn't already provided it via the progressByUrl prop.
  const [fetchedProgressByUrl, setFetchedProgressByUrl] = useState<Record<string, number>>({});
  const progressByUrl = providedProgressByUrl ?? fetchedProgressByUrl;

  useEffect(() => {
    if (providedProgressByUrl) return;

    let cancelled = false;

    Promise.all(
      publications.map(async (publication) => {
        const percent = await getBookProgressPercent(publication.url);
        return [publication.url, percent] as const;
      })
    ).then((results) => {
      if (cancelled) return;

      const progress: Record<string, number> = {};
      for (const [url, percent] of results) {
        // CLAUDE-ADDED: Only keep it if there's actual progress — a book that's never been opened (or was opened but never advanced past the very start) shouldn't get a ring at all.
        if (percent !== null && percent > 0) progress[url] = percent;
      }
      setFetchedProgressByUrl(progress);
    });

    return () => {
      cancelled = true;
    };
  }, [publications, providedProgressByUrl]);

  const renderCoverWithClass = (publication: Publication) => {
    const cover = renderCover(publication);
    
    if (!isValidElement<React.ImgHTMLAttributes<HTMLImageElement>>(cover)) {
      return (
        <DefaultImage
          src={ publication.cover }
          alt=""
        />
      );
    }

    return cloneElement(cover, {
      className: classNames(
        publicationGridStyles.image,
        cover.props.className
      )
    });
  };

  return (
    <ThGrid
      className={ publicationGridStyles.wrapper }
      items={ publications }
      columnWidth={ columnWidth }
      gap={ gap }
      renderItem={ (publication, index) => (
        <Link
          // CLAUDE-ADDED: Cast to Route since publication.url is a dynamically-built manifest path that next.config.mjs's typedRoutes can't statically verify.
          href={ publication.url as Route }
          key={ index }
          className={ publicationGridStyles.card }
          onClick={ (e) => {
            if (!onSelect || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onSelect(publication);
          } }
        >
          <figure className={ publicationGridStyles.cover }>
            { renderCoverWithClass(publication) }
          </figure>
          { /* CLAUDE-ADDED: Sits in the bottom-right corner, same corner .info slides up to cover on hover -- .progressRing has a higher z-index so the ring stays visible on top of it instead of being hidden. Only shown once the book has actual saved progress. */ }
          { progressByUrl[publication.url] !== undefined && (
            <ProgressRing percent={ progressByUrl[publication.url] } />
          ) }
          <div className={ publicationGridStyles.info }>
            <h2 className={ publicationGridStyles.title }>
              { publication.title }
            </h2>
            <p className={ publicationGridStyles.author }>
              { publication.author }
            </p>
            { publication.rendition && (
              <p className={ publicationGridStyles.rendition }>
                { publication.rendition }
              </p>
            ) }
          </div>
        </Link>
      ) }
    />
  );
};