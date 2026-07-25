"use client";

// CLAUDE-ADDED: Pairs consecutive "insert" pages (a spine resource that's just one full-page illustration, no real text -- common front/back matter in illustrated light novels/manga EPUBs) so they render side by side in two-column mode instead of one image alone next to a blank column. @readium/navigator loads one resource per iframe and only ever shows one at a time (confirmed by reading its source -- there is no cross-resource spread mechanism for reflowable content, unlike its FXL code path), so this can't be done by patching the navigator without touching its minified dist bundle. Instead this hook keeps the real navigator moving one resource at a time (so locators/progress/bookmarks stay simple and correct) and layers a same-looking overlay on top that shows the current resource's image next to its paired neighbor's, silently stepping the real navigator an extra resource when the user pages past an already-shown pair so the pair acts like one navigable unit.
import { useCallback, useRef, useState } from "react";
import { Link, Locator, Publication } from "@readium/shared";
import { ShortImageInfo, detectShortImage } from "./detectShortImage";

export interface SpreadPair {
  leftIndex: number;
  rightIndex: number;
  leftImageUrl: string;
  rightImageUrl: string;
  // CLAUDE-ADDED: Position-list numbers for each half of the pair, so the footer can display both (e.g. "9-10 of 235") the same way it does for a real two-column text spread, instead of just the single position the real navigator's single-resource viewport would otherwise report. Undefined when the resource isn't in positionsList (shouldn't normally happen, but guards the lookup).
  leftPosition?: number;
  rightPosition?: number;
  // CLAUDE-ADDED: Read straight off the live frame's computed style rather than guessed from a CSS var, so the overlay matches whatever reading theme (light/dark/sepia/custom) and column gutter are actually applied right now instead of drifting out of sync with them.
  backgroundColor: string;
  columnGap: string;
}

interface UseShortImageSpreadProps {
  publication: Publication | null;
  isFXL: boolean;
  isScroll: boolean;
  // CLAUDE-ADDED: Loosely typed to match whatever useEpubNavigator's getCframes returns (an array of internal frame-manager objects, each exposing a `.window`) without importing its private/unstable frame-manager types.
  getCframes: () => (({ window: Window }) | undefined)[] | undefined;
  goForward: (animated: boolean, callback: (ok: boolean) => void) => void;
  goBackward: (animated: boolean, callback: (ok: boolean) => void) => void;
  // CLAUDE-ADDED: Used to resolve each half of the pair's position-list number for SpreadPair.leftPosition/rightPosition -- see there.
  positionsList?: Locator[];
}

// CLAUDE-ADDED: goForward/goBackward require a callback (no optional-callback overload exists on useEpubNavigator's version), so silent auto-advance steps pass this rather than a real navigation callback.
const noop = () => {};

export const useShortImageSpread = ({
  publication,
  isFXL,
  isScroll,
  getCframes,
  goForward,
  goBackward,
  positionsList,
}: UseShortImageSpreadProps) => {
  const cacheRef = useRef(new Map<string, Promise<ShortImageInfo | null>>());
  const lastPairRef = useRef<{ leftIndex: number; rightIndex: number } | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const [pair, setPair] = useState<SpreadPair | null>(null);

  // CLAUDE-ADDED: Caches the in-flight Promise itself, not just its resolved value. This is what makes it safe to call checkResource speculatively/concurrently for the same href from multiple places below (the walk-back loop, the partner lookup, and prefetching) -- every caller shares the one underlying fetch instead of each kicking off its own duplicate network request.
  const checkResource = useCallback((link: Link | undefined): Promise<ShortImageInfo | null> => {
    if (!link || !publication) return Promise.resolve(null);

    const cached = cacheRef.current.get(link.href);
    if (cached) return cached;

    const promise = detectShortImage(publication, link);
    cacheRef.current.set(link.href, promise);
    return promise;
  }, [publication]);

  // CLAUDE-ADDED: readium-css's column-count lives on the current frame's :root, independent of the columnCount *preference* -- "auto" never resolves to a concrete number through the preferences API (see StatefulColumns.tsx's own effectiveValue tracking), so the only reliable way to know we're actually rendering two columns right now is to read the live computed style, same technique used to verify the landscape-image column-span fix.
  const isEffectivelyTwoColumn = useCallback((): boolean => {
    const win = getCframes()?.[0]?.window;
    if (!win) return false;
    try {
      return win.getComputedStyle(win.document.documentElement).columnCount === "2";
    } catch {
      return false;
    }
  }, [getCframes]);

  // CLAUDE-ADDED: getComputedStyle().backgroundColor is never an empty string -- a genuinely transparent element reports "rgba(0, 0, 0, 0)", which is truthy, so a plain `||` fallback chain never actually falls through to it. Left unguarded, the overlay ended up transparent (readium-css themes commonly leave <body> itself transparent so the theme background set on <html> shows through), letting the native iframe content -- including a column-span:all landscape image -- bleed through underneath and visually double up with the overlay's own images on top of it.
  const isOpaqueColor = (color: string): boolean => {
    const alphaMatch = color.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
    if (alphaMatch) return parseFloat(alphaMatch[1]) > 0;
    return color !== "" && color !== "transparent";
  };

  const readFrameStyle = useCallback((): { backgroundColor: string; columnGap: string } => {
    const win = getCframes()?.[0]?.window;
    // CLAUDE-ADDED: "transparent" is never an acceptable fallback here -- the overlay must occlude the iframe underneath it, so if neither <html> nor <body> reports an opaque color, fall back to a plain reading-background white rather than letting content bleed through.
    const fallback = { backgroundColor: "#fff", columnGap: "0px" };
    if (!win) return fallback;
    try {
      const rootStyle = win.getComputedStyle(win.document.documentElement);
      const bodyStyle = win.getComputedStyle(win.document.body);
      const candidates = [rootStyle.backgroundColor, bodyStyle.backgroundColor];
      const backgroundColor = candidates.find(isOpaqueColor) || fallback.backgroundColor;
      return {
        backgroundColor,
        columnGap: rootStyle.columnGap || fallback.columnGap,
      };
    } catch {
      return fallback;
    }
  }, [getCframes]);

  const clearPair = useCallback(() => {
    lastPairRef.current = null;
    setPair(null);
  }, []);

  // CLAUDE-ADDED: positionsList entries carry both href and the position-list number; SpreadPair needs the latter for each half so the footer can show "9-10 of N" instead of a single number.
  const getPosition = useCallback((href: string): number | undefined => {
    return positionsList?.find((p) => p.href === href)?.locations.position;
  }, [positionsList]);

  // CLAUDE-ADDED: Fire-and-forget warmup for a reading-order index -- safe to call speculatively since checkResource dedupes by href via its promise cache, so this never causes a duplicate fetch for an index also being awaited elsewhere.
  const prefetch = useCallback((items: readonly Link[], idx: number) => {
    if (idx >= 0 && idx < items.length) void checkResource(items[idx]);
  }, [checkResource]);

  // CLAUDE-ADDED: An image-only resource with no image neighbor to pair with (e.g. a single illustration sandwiched between two real chapters) still gets readium-css's normal column-count:2 layout, so it renders squeezed into one column with a wasted blank column beside it -- the same problem pairing solves, just for a resource that has nothing to pair with. Forcing that one frame to a single column lets the image use the full width instead. Scoped to the live frame instance (destroyed/recreated as the reader's sliding window of pooled resources moves on), so this doesn't need to be undone explicitly.
  const forceSingleColumnForCurrentFrame = useCallback(() => {
    const win = getCframes()?.[0]?.window;
    if (!win) return;
    try {
      win.document.documentElement.style.setProperty("column-count", "1", "important");
    } catch {
      // Best-effort -- leave native (squeezed) rendering if this fails for any reason.
    }
  }, [getCframes]);

  const evaluate = useCallback(async (locator: Locator) => {
    if (!publication || isFXL || isScroll) {
      clearPair();
      return;
    }

    const index = publication.readingOrder.findIndexWithHref(locator.href);
    const prevIndex = lastIndexRef.current;
    const prevPair = lastPairRef.current;
    lastIndexRef.current = index;

    if (index < 0) {
      clearPair();
      return;
    }

    // CLAUDE-ADDED: If we just single-stepped from one half of the pair we already showed to the other half, the user paged past a spread that visually hasn't changed (both halves were already on screen) -- silently take one more real step so the pair behaves as one page. Deferred with setTimeout: calling goForward/goBackward synchronously from inside this same positionChanged callback is a no-op (the navigator appears to still be settling the transition that triggered this callback and silently ignores a re-entrant call), so the extra step has to be issued on a later tick once that transition has actually finished.
    if (prevPair) {
      if (prevIndex === prevPair.leftIndex && index === prevPair.rightIndex) {
        setTimeout(() => goForward(false, noop), 0);
        return;
      }
      if (prevIndex === prevPair.rightIndex && index === prevPair.leftIndex) {
        setTimeout(() => goBackward(false, noop), 0);
        return;
      }
    }

    // CLAUDE-ADDED: Index 0 (the cover) is intentionally never paired -- it's pinned to the right-hand column instead via a per-resource CSS injectable (see coverSpreadScript.ts).
    if (index === 0 || !isEffectivelyTwoColumn()) {
      clearPair();
      return;
    }

    const items = publication.readingOrder.items;

    // CLAUDE-ADDED: Kick off both neighbors' checks in parallel with (rather than strictly after) the current resource's -- the walk-back loop and partner lookup below almost always end up wanting one of these, and starting them now lets their network fetch + landscape probe overlap with the current resource's instead of queueing behind it, which is what made a first-time visit to a new pair feel slow (up to 4 fully sequential round trips otherwise).
    prefetch(items, index - 1);
    prefetch(items, index + 1);

    const current = await checkResource(items[index]);
    if (!current) {
      clearPair();
      return;
    }

    // CLAUDE-ADDED: Walk back to the start of this run of consecutive short-image resources (never below index 1, which would fold the cover into the run) so pairing is anchored consistently regardless of which half of a pair -- or which pair in a longer run -- the reader lands on first.
    let runStart = index;
    while (runStart > 1) {
      const info = await checkResource(items[runStart - 1]);
      if (!info) break;
      runStart--;
    }

    const isLeft = (index - runStart) % 2 === 0;
    const partnerIndex = isLeft ? index + 1 : index - 1;
    const partner = await checkResource(items[partnerIndex]);

    if (!partner) {
      // CLAUDE-ADDED: An odd one out (e.g. a trailing single insert, or one sandwiched between real chapters, with no image neighbor to pair with) doesn't get the overlay, but still gets bumped to single-column so it isn't squeezed into half the width for nothing.
      clearPair();
      forceSingleColumnForCurrentFrame();
      return;
    }

    const leftIndex = isLeft ? index : partnerIndex;
    const rightIndex = isLeft ? partnerIndex : index;
    const leftInfo = isLeft ? current : partner;
    const rightInfo = isLeft ? partner : current;

    // CLAUDE-ADDED: Warm the cache for the next pair in either direction now, while this one is still being displayed, so the page turn that actually reaches it hits an already-resolved (or already in-flight) promise instead of starting cold -- same dedup guarantee as the neighbor prefetch above.
    prefetch(items, rightIndex + 1);
    prefetch(items, rightIndex + 2);
    prefetch(items, leftIndex - 1);
    prefetch(items, leftIndex - 2);

    lastPairRef.current = { leftIndex, rightIndex };
    setPair({
      leftIndex,
      rightIndex,
      leftImageUrl: leftInfo.imageUrl,
      rightImageUrl: rightInfo.imageUrl,
      leftPosition: getPosition(items[leftIndex]!.href),
      rightPosition: getPosition(items[rightIndex]!.href),
      ...readFrameStyle(),
    });
  }, [publication, isFXL, isScroll, isEffectivelyTwoColumn, readFrameStyle, checkResource, goForward, goBackward, clearPair, forceSingleColumnForCurrentFrame, prefetch, getPosition]);

  return { pair, evaluate };
};
