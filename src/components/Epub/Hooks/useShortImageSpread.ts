"use client";

// CLAUDE-ADDED: Pairs consecutive "insert" pages (a spine resource that's just one full-page illustration, no real text -- common front/back matter in illustrated light novels/manga EPUBs) so they render side by side in two-column mode instead of one image alone next to a blank column. @readium/navigator loads one resource per iframe and only ever shows one at a time (confirmed by reading its source -- there is no cross-resource spread mechanism for reflowable content, unlike its FXL code path), so this can't be done by patching the navigator without touching its minified dist bundle. Instead this hook keeps the real navigator moving one resource at a time (so locators/progress/bookmarks stay simple and correct) and layers a same-looking overlay on top that shows the current resource's image next to its paired neighbor's, silently stepping the real navigator an extra resource when the user pages past an already-shown pair so the pair acts like one navigable unit.
//
// CLAUDE-ADDED: Which resources are short images and how they pair up is resolved once, book-wide,
// by useShortImageMap -- passed in as shortImageMap rather than detected here. This hook's own job
// is just the live, per-navigation part: looking up the current locator's index in that map,
// deciding whether the navigator is actually rendering two columns right now, and reading the live
// frame's theme colors for the overlay.
import { useCallback, useRef, useState } from "react";
import { Locator, Publication } from "@readium/shared";
import { ShortImageMap } from "./useShortImageMap";

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
  shortImageMap: ShortImageMap;
  // CLAUDE-ADDED: Loosely typed to match whatever useEpubNavigator's getCframes returns (an array of internal frame-manager objects, each exposing a `.window`) without importing its private/unstable frame-manager types.
  getCframes: () => (({ window: Window }) | undefined)[] | undefined;
  goForward: (animated: boolean, callback: (ok: boolean) => void) => void;
  goBackward: (animated: boolean, callback: (ok: boolean) => void) => void;
  // CLAUDE-ADDED: Used to resolve each half of the pair's position-list number for SpreadPair.leftPosition/rightPosition -- see there.
  positionsList?: Locator[];
}

// CLAUDE-ADDED: @readium/navigator's EpubNavigator.goForward/goBackward (see its dist source) both
// start with `if (this._isNavigating) { callback(false); return; }` -- a still-settling transition
// (the user's own real page turn that triggered this auto-advance in the first place) makes the
// *silent* step below fail with ok=false, not throw or hang. Passing `noop` as the callback (as this
// used to) discards that signal entirely, so the failure was invisible -- the real navigator's
// position stayed stuck one resource behind lastPairRef/lastIndexRef's idea of where it is, and every
// later evaluate() call kept comparing against that now-wrong state, permanently breaking pairing (and
// therefore position/progression updates) for the rest of the book. This is exactly why it surfaced
// specifically for image-only PDF-Reflow-style books: every resource is a short-image pairing
// candidate there, so the auto-advance path -- and this exact race, since large image resources take
// measurably longer to settle than text -- fires on nearly every page turn instead of rarely.
// RETRY_DELAY_MS/MAX_RETRIES are deliberately short/small: a genuine "still settling" failure clears
// within a frame or two, and retrying doesn't risk masking a real "can't go further" (start/end of
// book) failure for long -- that one also reports ok=false but stops mattering once the user can't
// navigate past it anyway.
const RETRY_DELAY_MS = 30;
const MAX_RETRIES = 5;

const advanceWithRetry = (
  step: (animated: boolean, callback: (ok: boolean) => void) => void,
  attempt = 0
): void => {
  step(false, (ok) => {
    if (ok || attempt >= MAX_RETRIES) return;
    setTimeout(() => advanceWithRetry(step, attempt + 1), RETRY_DELAY_MS);
  });
};

export const useShortImageSpread = ({
  publication,
  isFXL,
  isScroll,
  shortImageMap,
  getCframes,
  goForward,
  goBackward,
  positionsList,
}: UseShortImageSpreadProps) => {
  const lastPairRef = useRef<{ leftIndex: number; rightIndex: number } | null>(null);
  const lastIndexRef = useRef<number | null>(null);
  const [pair, setPair] = useState<SpreadPair | null>(null);

  // CLAUDE-ADDED: Always holds the latest shortImageMap without evaluate()'s own useCallback
  // depending on it -- shortImageMap's identity changes on every progressive sweep update (see
  // useShortImageMap), and evaluate is captured once into the navigator's positionChanged listener
  // at mount (see useEpubReaderInit's one-time load effect), so a raw dependency here would mean
  // this hook keeps recreating evaluate as the sweep fills in while the navigator goes on calling
  // whichever (likely still-empty) version it captured first. Direct assignment during render, same
  // "latest value" ref idiom StatefulReader already uses for notifyReadingSpeedRef.
  const shortImageMapRef = useRef(shortImageMap);
  shortImageMapRef.current = shortImageMap;

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

  const evaluate = useCallback((locator: Locator) => {
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
        setTimeout(() => advanceWithRetry(goForward), 0);
        return;
      }
      if (prevIndex === prevPair.rightIndex && index === prevPair.leftIndex) {
        setTimeout(() => advanceWithRetry(goBackward), 0);
        return;
      }
    }

    // CLAUDE-ADDED: Index 0 (the cover) is intentionally never paired -- it's pinned to the right-hand column instead via a per-resource CSS injectable (see coverSpreadScript.ts).
    if (index === 0 || !isEffectivelyTwoColumn()) {
      clearPair();
      return;
    }

    const map = shortImageMapRef.current;
    const mapPair = map.pairs.get(index);

    if (!mapPair) {
      clearPair();
      // CLAUDE-ADDED: Only force single-column once the sweep has actually classified this
      // resource as a solo -- while the sweep hasn't reached it yet (!isComplete and no entry),
      // leave native layout alone rather than guessing, matching the map's own graceful-degradation
      // contract (see ShortImageMap.isComplete's doc comment).
      if (map.solos.has(index)) forceSingleColumnForCurrentFrame();
      return;
    }

    const { leftIndex, rightIndex, leftHref, rightHref, leftImageUrl, rightImageUrl } = mapPair;

    lastPairRef.current = { leftIndex, rightIndex };
    setPair({
      leftIndex,
      rightIndex,
      leftImageUrl,
      rightImageUrl,
      leftPosition: getPosition(leftHref),
      rightPosition: getPosition(rightHref),
      ...readFrameStyle(),
    });
  }, [publication, isFXL, isScroll, isEffectivelyTwoColumn, readFrameStyle, clearPair, forceSingleColumnForCurrentFrame, getPosition, goForward, goBackward]);

  return { pair, evaluate };
};
