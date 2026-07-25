"use client";

// CLAUDE-ADDED: Computes a book's total word count once, ever -- feeds the reading-speed tab's
// words-per-minute estimate (see computeReadingSpeed.ts) and gets persisted server-side (see
// persistWordCount) so this never re-runs on a later open. Deliberately much cheaper than
// useExactPageCount's scan: that one renders every resource in a hidden iframe to measure real
// page-turns, which needs layout/stylesheets/images. Word count only needs the resource's text, so
// this just parses each resource's XML (readAsXML already does this, no iframe involved) and counts
// whitespace-separated tokens in its <body> -- no rendering, no layout-affecting settings to react to,
// and layout-independent so (unlike page count) it doesn't need to be gated on FXL/scroll or re-run
// when font/columns/theme change.
import { useEffect, useRef, useState } from "react";
import { Publication } from "@readium/shared";

export interface BookWordCountState {
  wordCount: number | null;
  isComputing: boolean;
}

interface UseBookWordCountProps {
  publication: Publication | null;
  // CLAUDE-ADDED: Caller gates this on "publication ready AND server fetch confirmed there's no
  // cached value yet" -- see StatefulReader.tsx.
  enabled: boolean;
}

const YIELD_EVERY = 10;

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export const useBookWordCount = ({ publication, enabled }: UseBookWordCountProps): BookWordCountState => {
  const [state, setState] = useState<BookWordCountState>({ wordCount: null, isComputing: false });
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled || !publication) return;

    const generation = ++generationRef.current;

    const run = async () => {
      setState({ wordCount: null, isComputing: true });

      const items = publication.readingOrder.items;
      let total = 0;

      for (let i = 0; i < items.length; i++) {
        if (generationRef.current !== generation) return;

        const link = items[i]!;
        try {
          const doc = await publication.get(link).readAsXML();
          const body = doc?.getElementsByTagName("body")?.[0];
          total += countWords(body?.textContent ?? "");
        } catch {
          // CLAUDE-ADDED: A single unreadable resource shouldn't abort the whole scan -- same
          // best-effort fallback as measureResourcePages's own try/catch.
        }

        if (i % YIELD_EVERY === 0) {
          await new Promise((res) => setTimeout(res, 0));
        }
      }

      if (generationRef.current !== generation) return;
      setState({ wordCount: total, isComputing: false });
    };

    run();
  }, [enabled, publication]);

  return state;
};
