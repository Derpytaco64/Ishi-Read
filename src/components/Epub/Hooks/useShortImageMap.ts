"use client";

import { useEffect, useRef, useState } from "react";
import { Link, Publication } from "@readium/shared";
import { detectShortImage } from "./detectShortImage";

export interface ShortImageEntry {
  index: number;
  href: string;
  imageUrl: string;
}

export interface ShortImagePair {
  leftIndex: number;
  rightIndex: number;
  leftHref: string;
  rightHref: string;
  leftImageUrl: string;
  rightImageUrl: string;
}

export interface ShortImageMap {
  entries: Map<number, ShortImageEntry>;
  pairs: Map<number, ShortImagePair>;
  solos: Set<number>;
  // CLAUDE-ADDED: True once every reading-order resource has been classified. Consumers should
  // treat an index absent from entries/pairs/solos as "not a short image" only once this is true --
  // while false, absence just means "not reached by the sweep yet" (same graceful-degradation shape
  // useShortImageSpread's old per-locator detection already had via checkResource returning null).
  isComplete: boolean;
}

const emptyMap = (): ShortImageMap => ({
  entries: new Map(),
  pairs: new Map(),
  solos: new Set(),
  isComplete: false,
});

const YIELD_EVERY = 8;

// CLAUDE-ADDED: Single, book-wide classification of which reading-order resources are bare
// full-page images and how consecutive ones pair up -- computed once per publication instead of
// useShortImageSpread and useExactPageCount each re-detecting the same thing independently (the
// former reactively per locator change with its own walk-back loop and setTimeout auto-advance
// races, the latter redoing the same fetch+parse from scratch on every layout-signature rescan
// even though short-image classification never depends on layout). Sequential forward chunking
// (pair resource i with i+1 if both are short images, else i is solo, advance past whatever was
// just consumed) produces the exact same grouping the old walk-back-from-current-position
// algorithm did for any run of consecutive short images -- it's just derived once for the whole
// book instead of re-derived from wherever the reader currently happens to be.
export const useShortImageMap = (publication: Publication | null): ShortImageMap => {
  const [map, setMap] = useState<ShortImageMap>(emptyMap);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!publication) {
      setMap(emptyMap());
      return;
    }

    const generation = ++generationRef.current;
    setMap(emptyMap());

    const items = publication.readingOrder.items;
    const entries = new Map<number, ShortImageEntry>();
    const pairs = new Map<number, ShortImagePair>();
    const solos = new Set<number>();

    // CLAUDE-ADDED: Caches the in-flight Promise itself (not just its resolved value) so the
    // lookahead check for "is my neighbor also short" and the loop's own check for that same
    // resource share one fetch instead of firing it twice.
    const cache = new Map<string, ReturnType<typeof detectShortImage>>();
    const check = (link: Link) => {
      let promise = cache.get(link.href);
      if (!promise) {
        promise = detectShortImage(publication, link);
        cache.set(link.href, promise);
      }
      return promise;
    };

    const run = async () => {
      // CLAUDE-ADDED: Index 0 (the cover) is never classified -- it's pinned to the right-hand
      // column via coverSpreadScript instead, same exclusion useShortImageSpread and
      // useExactPageCount both already had.
      let i = 1;
      while (i < items.length) {
        if (generationRef.current !== generation) return;

        const link = items[i]!;
        const info = await check(link);

        if (!info) {
          i += 1;
        } else {
          const nextLink = i + 1 < items.length ? items[i + 1]! : null;
          const nextInfo = nextLink ? await check(nextLink) : null;

          entries.set(i, { index: i, href: link.href, imageUrl: info.imageUrl });

          if (nextInfo && nextLink) {
            const pair: ShortImagePair = {
              leftIndex: i,
              rightIndex: i + 1,
              leftHref: link.href,
              rightHref: nextLink.href,
              leftImageUrl: info.imageUrl,
              rightImageUrl: nextInfo.imageUrl,
            };
            entries.set(i + 1, { index: i + 1, href: nextLink.href, imageUrl: nextInfo.imageUrl });
            pairs.set(i, pair);
            pairs.set(i + 1, pair);
            i += 2;
          } else {
            solos.add(i);
            i += 1;
          }
        }

        if (i % YIELD_EVERY === 0) {
          // CLAUDE-ADDED: Published progressively so consumers can use whatever's classified so
          // far (e.g. the reader opening near the start of the book) instead of waiting on a full
          // sweep of a several-hundred-resource manga volume before pairing works at all.
          setMap({ entries: new Map(entries), pairs: new Map(pairs), solos: new Set(solos), isComplete: false });
          await new Promise((res) => setTimeout(res, 0));
        }
      }

      if (generationRef.current !== generation) return;
      setMap({ entries, pairs, solos, isComplete: true });
    };

    run();
  }, [publication]);

  return map;
};
