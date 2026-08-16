"use client";

// CLAUDE-ADDED: An "exact" page-turn count -- unlike positionsList (a fixed ~1024-char-per-chunk count from the manifest, unrelated to actual rendered layout -- see useTimeline.ts), this walks every reading-order resource in a hidden, off-screen iframe styled identically to the live reading pane and measures how many real page-turns (scrollWidth / viewportWidth) each one takes, then sums them. This is a genuinely expensive full-book layout pass -- started as a spike to test whether that cost is tolerable, but notifyLocatorChanged's result now also feeds useReadingSpeedSampler's wpm calculation (see StatefulReader.tsx's positionChanged), so it's no longer test-only scaffolding. Gated off entirely for FXL (page-per-resource already exact) and scroll mode (no discrete pages to count).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Locator, Publication } from "@readium/shared";
import { ShortImageInfo, detectShortImage } from "./detectShortImage";
import { ShortImageMap } from "./useShortImageMap";
import { applyLandscapeSpreadLayoutSync } from "./landscapeSpreadScript";
import { ExactPageResourceEntry } from "@/helpers/exactPageLocator";

export interface ExactPageCountState {
  totalPages: number | null;
  // CLAUDE-ADDED: One entry for a single-column screen, two for a two-column screen (whether that's running text, a landscape image spanning both columns, or a paired-image spread) -- mirrors how the real footer shows "7-8 of 235" rather than just "7".
  currentPageRange: number[] | null;
  isComputing: boolean;
  elapsedMs: number | null;
  resourceCount: number | null;
  error: string | null;
  // CLAUDE-ADDED: Serializable per-resource page map, built alongside perResourceRef below -- unlike that Map (kept as a ref so notifyLocatorChanged can read it without triggering a re-render), this is real state so it can be threaded through useTimeline/Redux for the "Go to position" dialog's reverse page->Locator lookup (see src/helpers/exactPageLocator.ts).
  resourcePages: ExactPageResourceEntry[] | null;
}

// CLAUDE-ADDED: Synchronous result of a single notifyLocatorChanged call -- null fields mean "not
// available for this locator" (not enabled, FXL/scroll, no scan finished yet for this resource, or
// no live frame to read scroll position from), matching the null-means-fall-back convention the
// wpm sampler already uses for locator.locations.totalProgression.
export interface ExactPageResult {
  currentPageRange: number[] | null;
  totalPages: number | null;
}

export interface ExactPageCountApi extends ExactPageCountState {
  // CLAUDE-ADDED: Cheap per-navigation update -- reuses the per-resource page counts cached by the
  // last full scan instead of re-measuring the whole book on every page turn. Call this from the
  // navigator's positionChanged listener, the same way evaluateSpread is called there. Returns the
  // freshly-computed range/total synchronously (in addition to scheduling the setState side effect)
  // so a caller in the same listener -- e.g. useReadingSpeedSampler, which needs this locator's exact
  // progression *now*, not after the next render -- doesn't have to read the async React state and
  // risk it still reflecting the previous locator (same ordering hazard the Android app's
  // exactPageFraction avoids by recomputing fresh from the locator instead of trusting a
  // separately-updated counter).
  notifyLocatorChanged: (locator: Locator) => ExactPageResult;
}

interface UseExactPageCountProps {
  publication: Publication | null;
  isFXL: boolean;
  isScroll: boolean;
  navigatorReady: boolean;
  enabled: boolean;
  // CLAUDE-ADDED: Loosely typed to match useEpubNavigator's getCframes/currentLocator without importing their private/unstable frame-manager types.
  getCframes: () => (({ window: Window }) | undefined)[] | undefined;
  currentLocator: () => Locator | undefined;
  // CLAUDE-ADDED: Any value that changes when a layout-affecting setting (font, columns, margins, theme...) changes, to trigger a recompute. Caller builds this (see StatefulReader.tsx).
  layoutSignature: string;
  // CLAUDE-ADDED: Book-wide short-image classification, shared with useShortImageSpread instead of
  // this hook detecting the same thing independently -- see useShortImageMap's own doc comment.
  // Not a scan dependency (see shortImageMapRef below): short-image classification never changes
  // with layout, so a rescan should reuse whatever the map already knows without itself being
  // retriggered every time the map's own progressive sweep updates.
  shortImageMap: ShortImageMap;
}

const RESOURCE_TIMEOUT_MS = 8000;
const YIELD_EVERY = 5;

const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
};

const waitForStylesheets = (idoc: Document): Promise<void> => {
  const links = Array.from(idoc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  return Promise.all(links.map((l) => l.sheet ? Promise.resolve() : new Promise<void>((res) => {
    l.addEventListener("load", () => res(), { once: true });
    l.addEventListener("error", () => res(), { once: true });
  }))).then(() => undefined);
};

const waitForImages = (idoc: Document): Promise<void> => {
  const imgs = Array.from(idoc.images);
  return Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((res) => {
      img.addEventListener("load", () => res(), { once: true });
      img.addEventListener("error", () => res(), { once: true });
    });
  })).then(() => undefined);
};

const nextFrame = (win: Window): Promise<void> => {
  return new Promise((res) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => res())));
};

// CLAUDE-ADDED: Per-resource info from a completed scan -- `fixedRange` for image/paired/solo
// resources (always exactly one on-screen position), `before` + `perScreenPages` for generic
// (prose/cover/landscape) resources, since which screen of a multi-screen resource is showing can
// only be read live off the current scroll position. Named here (not just inlined at perResourceRef's
// declaration) so the resize cache below can share the exact same shape.
type PerResourceInfo = { before: number; perScreenPages: number; fixedRange?: number[] };

// CLAUDE-ADDED: Shared by notifyLocatorChanged (a live page turn) and the resize-cache hit path below
// (swapping to a previously-measured viewport size) -- both need "where is the current locator inside
// whichever per-resource table is active right now," just from different triggers.
const computeCurrentRange = (
  perResource: Map<string, PerResourceInfo>,
  href: string | undefined,
  win: Window | undefined
): number[] | null => {
  if (!href) return null;

  const info = perResource.get(href);
  if (!info) return null;

  if (info.fixedRange) return info.fixedRange;
  if (!win) return null;

  const width = win.innerWidth;
  if (!width) return null;

  const scrollLeft = Math.abs(win.document.scrollingElement?.scrollLeft ?? 0);
  const screenIndex = Math.floor(scrollLeft / width);
  const start = info.before + screenIndex * info.perScreenPages + 1;
  return info.perScreenPages === 2 ? [start, start + 1] : [start];
};

// CLAUDE-ADDED: Caps the session-only resize cache below -- real-world usage should only ever produce
// a handful of distinct viewport sizes per book (mobile chrome shown/hidden, maybe an orientation
// change), but this is a safety net against pathological cases (e.g. continuously dragging a desktop
// window's edge). Map preserves insertion order, so this evicts the oldest entry first -- not true
// LRU (a re-hit doesn't bump its position), but enough to bound memory without extra bookkeeping.
const MAX_RESIZE_CACHE_ENTRIES = 6;

const pruneCache = <V,>(cache: Map<string, V>): void => {
  while (cache.size > MAX_RESIZE_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
};

// CLAUDE-ADDED: Renders one resource's body inside the hidden iframe, reusing the live frame's own applied <head> (readium-css stylesheets + preference-derived <style>/custom-property overrides and <html> attributes) so column-count/font/margins match exactly without us having to reimplement readium's preferences-to-CSS mapping by hand.
const measureResourcePages = async (params: {
  publication: Publication;
  link: Link;
  headSourceChildren: Element[];
  htmlAttrs: { name: string; value: string }[];
  width: number;
  iframe: HTMLIFrameElement;
}): Promise<number> => {
  const { publication, link, headSourceChildren, htmlAttrs, width, iframe } = params;

  let bodySource: Element | null = null;
  try {
    const doc = await publication.get(link).readAsXML();
    bodySource = doc?.getElementsByTagName("body")?.[0] || null;
  } catch {
    return 1;
  }
  if (!bodySource) return 1;

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) return 1;

  idoc.open();
  idoc.write("<!DOCTYPE html><html><head></head><body></body></html>");
  idoc.close();

  htmlAttrs.forEach(({ name, value }) => {
    try { idoc.documentElement.setAttribute(name, value); } catch { /* best-effort */ }
  });

  // CLAUDE-ADDED: Base href must point at THIS resource's own location, not whichever resource the live frame happened to be showing -- otherwise relative image srcs resolve to the wrong folder.
  const base = idoc.createElement("base");
  const resourceUrl = link.toURL(publication.baseURL);
  if (resourceUrl) base.href = resourceUrl;
  idoc.head.appendChild(base);

  headSourceChildren.forEach((el) => {
    idoc.head.appendChild(idoc.importNode(el, true));
  });

  Array.from(bodySource.childNodes).forEach((node) => {
    idoc.body.appendChild(idoc.importNode(node, true));
  });

  await withTimeout(waitForStylesheets(idoc), RESOURCE_TIMEOUT_MS, undefined);
  await withTimeout(waitForImages(idoc), RESOURCE_TIMEOUT_MS, undefined);

  // CLAUDE-ADDED: The live iframe gets landscapeSpreadScript's injected <script> (column-span:all + page-boundary alignment for embedded landscape images) baked into its document before the browser ever lays it out -- this hidden measurement iframe is built from an independent, un-injected fetch, so without replaying the same logic here, scrollWidth below would reflect a plain in-flow image instead of the spanning/aligned layout the reader actually shows.
  applyLandscapeSpreadLayoutSync(idoc);
  await nextFrame(iwin);

  const scrollWidth = idoc.documentElement.scrollWidth;
  return Math.max(1, Math.round(scrollWidth / width));
};

export const useExactPageCount = ({
  publication,
  isFXL,
  isScroll,
  navigatorReady,
  enabled,
  getCframes,
  currentLocator,
  layoutSignature,
  shortImageMap,
}: UseExactPageCountProps): ExactPageCountApi => {
  // CLAUDE-ADDED: Latest-value ref, same idiom as useShortImageSpread's own shortImageMapRef --
  // read from inside the scan loop below without being one of that effect's dependencies, so the
  // map's own progressive updates never retrigger this hook's much more expensive full-book layout
  // pass.
  const shortImageMapRef = useRef(shortImageMap);
  shortImageMapRef.current = shortImageMap;

  const [state, setState] = useState<ExactPageCountState>({
    totalPages: null,
    currentPageRange: null,
    isComputing: false,
    elapsedMs: null,
    resourceCount: null,
    error: null,
    resourcePages: null,
  });

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const generationRef = useRef(0);
  // CLAUDE-ADDED: Per-resource info from the most recent scan, filled in progressively as each resource is processed, so notifyLocatorChanged can derive a live page range on every navigation without re-scanning. Cleared whenever a new scan starts (layoutSignature or viewport size changed) so a page turn during that gap can't use info computed under the previous font/column/viewport/etc.
  const perResourceRef = useRef<Map<string, PerResourceInfo>>(new Map());

  // CLAUDE-ADDED: Session-only cache of completed scans, keyed by layout+viewport size -- mobile
  // browser chrome (address bar) showing/hiding resizes the reading pane without any setting changing,
  // and previously this hook only ever rescanned on a layoutSignature change, so the page count could
  // go stale relative to whatever size is actually on screen (see resizeTick's effect below). Since
  // real usage only produces a handful of distinct sizes per book, a size seen before is served
  // instantly from here instead of re-running the full scan. Cleared for free on unmount/book change
  // since it's a plain ref, not persisted anywhere.
  const resizeCacheRef = useRef<Map<string, { state: ExactPageCountState; perResource: Map<string, PerResourceInfo> }>>(new Map());
  const [resizeTick, setResizeTick] = useState(0);

  // CLAUDE-ADDED: The cache key below (layoutSignature + viewport size) has no book identity in it --
  // two different books opened in the same session could easily land on the exact same font/spacing
  // settings and the exact same viewport size, which would otherwise serve one book's page counts onto
  // the other. Wiping the cache whenever the publication reference changes keeps it scoped to "this
  // book's reading session," matching what it's actually meant to reuse across (viewport wobbles while
  // reading one book), without needing to fold publication identity into every cache key.
  useEffect(() => {
    resizeCacheRef.current = new Map();
  }, [publication]);

  // CLAUDE-ADDED: Bumping resizeTick just re-triggers the main effect below (it's in that effect's own
  // dependency array) -- deliberately no separate debounce here, since that effect's own
  // setTimeout-then-cleanup-cancels-it 400ms debounce already coalesces rapid successive bumps (a
  // continuous resize) into a single check, the same way it already coalesces rapid layoutSignature
  // changes. Listens on the outer window/visualViewport rather than the content iframe's own window --
  // the iframe is what actually gets measured, but its size is *driven by* the outer viewport (the app
  // shell tracks it via dvh), and the outer window reference is stable for the reader's whole lifetime
  // where the content iframe's isn't guaranteed to be if Readium ever swaps iframes internally.
  useEffect(() => {
    if (!enabled || !navigatorReady || isFXL || isScroll || typeof window === "undefined") return;

    const handleResize = () => setResizeTick((t) => t + 1);

    const target: VisualViewport | Window = window.visualViewport || window;
    target.addEventListener("resize", handleResize);

    return () => target.removeEventListener("resize", handleResize);
  }, [enabled, navigatorReady, isFXL, isScroll]);

  const ensureIframe = useCallback((width: number, height: number): HTMLIFrameElement => {
    let iframe = iframeRef.current;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      // CLAUDE-ADDED: Off-screen but NOT display:none -- some browsers skip layout/decoding entirely for display:none content, which would make scrollWidth measurements unreliable.
      iframe.style.cssText = "position:fixed;top:0;left:-99999px;visibility:hidden;pointer-events:none;border:0;";
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
    }
    iframe.style.width = `${ width }px`;
    iframe.style.height = `${ height }px`;
    return iframe;
  }, []);

  useEffect(() => {
    return () => {
      iframeRef.current?.remove();
      iframeRef.current = null;
    };
  }, []);

  // CLAUDE-ADDED: The main effect below early-returns without touching state when isFXL/isScroll are
  // true, so a value computed while paginated (e.g. "page 214 of 816") stayed in state forever after
  // switching to scroll mode without a full reader remount -- StatefulReaderProgression consumed it as
  // if it were still current, showing a frozen page count instead of falling back to totalProgression.
  // Bumping generationRef here also invalidates any scan still in flight from before the switch, so it
  // can't land its result afterward and undo this reset.
  useEffect(() => {
    if (!isFXL && !isScroll) return;

    generationRef.current++;
    perResourceRef.current = new Map();
    setState({
      totalPages: null,
      currentPageRange: null,
      isComputing: false,
      elapsedMs: null,
      resourceCount: null,
      error: null,
      resourcePages: null,
    });
  }, [isFXL, isScroll]);

  useEffect(() => {
    if (!enabled || !navigatorReady || !publication || isFXL || isScroll) return;

    const generation = ++generationRef.current;
    perResourceRef.current = new Map();

    const timer = setTimeout(() => {
      const run = async () => {
        const win = getCframes()?.[0]?.window;
        if (!win) return;

        const width = win.innerWidth;
        const height = win.innerHeight;
        if (!width || !height) return;

        // CLAUDE-ADDED: A size we've already measured under this exact layout this session -- reuse it
        // instantly instead of re-running the full scan. currentPageRange is recomputed fresh (not
        // taken verbatim from the cached entry) since the reader may have navigated to a different
        // position since that entry was originally measured; totalPages/resourcePages/perResource are
        // position-independent, so those are safe to reuse as-is.
        const resizeCacheKey = `${ layoutSignature }::${ width }x${ height }`;
        const cached = resizeCacheRef.current.get(resizeCacheKey);
        if (cached) {
          perResourceRef.current = cached.perResource;
          setState({
            ...cached.state,
            currentPageRange: computeCurrentRange(cached.perResource, currentLocator()?.href, win),
          });
          return;
        }

        setState((prev) => ({ ...prev, isComputing: true, error: null }));

        const iframe = ensureIframe(width, height);
        const liveDoc = win.document;
        const headSourceChildren = Array.from(liveDoc.head.children).filter(
          (el) => el.tagName !== "SCRIPT" && el.tagName !== "BASE"
        ) as Element[];
        const htmlAttrs = Array.from(liveDoc.documentElement.attributes).map((a) => ({ name: a.name, value: a.value }));

        // CLAUDE-ADDED: readium-css's column-count lives on the frame's :root -- same technique as useShortImageSpread's isEffectivelyTwoColumn -- and is a single snapshot for the whole scan since a layout-affecting setting change bumps the generation and restarts it.
        const isTwoColumn = (() => {
          try {
            return win.getComputedStyle(win.document.documentElement).columnCount === "2";
          } catch {
            return false;
          }
        })();

        const items = publication.readingOrder.items;
        const currentHref = currentLocator()?.href;

        // CLAUDE-ADDED: Checks useShortImageMap's book-wide classification first -- if it's already
        // classified this index (short-image or not), reuse that for free instead of re-fetching.
        // Falls back to a direct detectShortImage call, with its own local dedupe cache, only for
        // an index the map's sweep hasn't reached yet (e.g. this rescan started before the map
        // finished, or the map is still working through an earlier part of the book) -- once the
        // map itself is isComplete, an index absent from it is definitively not a short image, no
        // fetch needed at all.
        const localCache = new Map<string, ShortImageInfo | null>();
        const getShortImageInfo = async (index: number, link: Link): Promise<ShortImageInfo | null> => {
          const known = shortImageMapRef.current.entries.get(index);
          if (known) return { imageUrl: known.imageUrl };
          if (shortImageMapRef.current.isComplete) return null;

          const cached = localCache.get(link.href);
          if (cached !== undefined) return cached;
          const info = await detectShortImage(publication, link);
          localCache.set(link.href, info);
          return info;
        };

        const t0 = performance.now();
        let total = 0;
        let currentRangeAcc: number[] | null = null;
        const resourcePages: ExactPageResourceEntry[] = [];

        let i = 0;
        while (i < items.length) {
          if (generationRef.current !== generation) return;

          const link = items[i]!;

          // CLAUDE-ADDED: The cover is deliberately reported as page 0, not counted in the running total at all -- it's not "content" in the same sense as the rest of the book, so it doesn't consume real page numbers (the next resource still starts at page 1). No measurement needed, same reasoning as the short-image fast path below.
          if (i === 0) {
            perResourceRef.current.set(link.href, { before: 0, perScreenPages: 0, fixedRange: [0] });
            resourcePages.push({ href: link.href, before: 0, pages: 0, perScreenPages: 0, screens: 1 });
            if (link.href === currentHref) currentRangeAcc = [0];
            i += 1;
            continue;
          }

          // CLAUDE-ADDED: Index 0 (the cover) is never treated as a short image / paired -- mirrors useShortImageSpread's own "index === 0" exclusion (it's pinned to the right-hand column via coverSpreadScript instead). Falls through to the generic measured path below.
          const shortInfo = (isTwoColumn && i > 0) ? await getShortImageInfo(i, link) : null;

          if (shortInfo) {
            // CLAUDE-ADDED: A bare full-page illustration always occupies exactly one physical page -- whether it ends up paired with a neighbor (two resources sharing one on-screen spread, e.g. the earlier "9-10 of N" fix) or shown solo (forced to single-column by useShortImageSpread so it isn't squeezed into half the width). Either way there's no layout measurement needed here (always exactly one on-screen position), so (unlike the generic branch) this skips the iframe layout pass entirely -- also a nice speed win, since insert images are exactly the resources that would otherwise need image-decode waits.
            const nextLink = i + 1 < items.length ? items[i + 1]! : null;
            const nextShortInfo = nextLink ? await getShortImageInfo(i + 1, nextLink) : null;

            if (nextShortInfo) {
              // Paired: two resources, one on-screen spread, two physical pages. Both sides report
              // the SAME [before+1, before+2] range -- whichever half currentHref actually is, the
              // reader is looking at both pages of the pair at once.
              const before = total;
              const range = [before + 1, before + 2];
              perResourceRef.current.set(link.href, { before, perScreenPages: 0, fixedRange: range });
              perResourceRef.current.set(nextLink!.href, { before, perScreenPages: 0, fixedRange: range });
              resourcePages.push({ href: link.href, before, pages: 2, perScreenPages: 2, screens: 1 });
              if (link.href === currentHref || nextLink!.href === currentHref) currentRangeAcc = range;
              total += 2;
              i += 2;
            } else {
              // Odd one out: single resource, single physical page.
              const before = total;
              const range = [before + 1];
              perResourceRef.current.set(link.href, { before, perScreenPages: 0, fixedRange: range });
              resourcePages.push({ href: link.href, before, pages: 1, perScreenPages: 1, screens: 1 });
              if (link.href === currentHref) currentRangeAcc = range;
              total += 1;
              i += 1;
            }
          } else {
            // Generic resource: ordinary prose or a landscape image (excluded from shortInfo by
            // detectShortImage, so it lands here) -- in two-column mode every screen shows two
            // physical pages, whether that screen is two columns of running text or one
            // column-spanning landscape illustration, so the measured screen count is doubled.
            let screens: number;
            try {
              screens = await measureResourcePages({ publication, link, headSourceChildren, htmlAttrs, width, iframe });
            } catch {
              screens = 1;
            }

            const perScreenPages = isTwoColumn ? 2 : 1;
            const pages = screens * perScreenPages;
            const before = total;
            perResourceRef.current.set(link.href, { before, perScreenPages });
            resourcePages.push({ href: link.href, before, pages, perScreenPages, screens });

            if (link.href === currentHref) {
              const scrollLeft = Math.abs(liveDoc.scrollingElement?.scrollLeft ?? 0);
              const screenIndex = Math.floor(scrollLeft / width);
              const start = before + screenIndex * perScreenPages + 1;
              currentRangeAcc = perScreenPages === 2 ? [start, start + 1] : [start];
            }

            total += pages;
            i += 1;
          }

          if (i % YIELD_EVERY === 0) {
            await new Promise((res) => setTimeout(res, 0));
          }
        }

        if (generationRef.current !== generation) return;

        const finalState: ExactPageCountState = {
          totalPages: total,
          currentPageRange: currentRangeAcc,
          isComputing: false,
          elapsedMs: performance.now() - t0,
          resourceCount: items.length,
          error: null,
          resourcePages,
        };

        // CLAUDE-ADDED: Cached under this exact layout+size so the next time a resize lands back on
        // it this session (e.g. mobile chrome hiding then reappearing), it's served from here instead
        // of re-running this whole scan -- see resizeCacheRef's own comment above.
        resizeCacheRef.current.set(resizeCacheKey, { state: finalState, perResource: new Map(perResourceRef.current) });
        pruneCache(resizeCacheRef.current);

        setState(finalState);
      };

      run().catch((err) => {
        if (generationRef.current !== generation) return;
        setState((prev) => ({ ...prev, isComputing: false, error: String(err) }));
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [enabled, navigatorReady, publication, isFXL, isScroll, layoutSignature, resizeTick, getCframes, currentLocator, ensureIframe]);

  // CLAUDE-ADDED: O(1) -- everything needed (the "before" total and whether this resource is a fixed single on-screen position or a multi-screen generic one) was already precomputed by the last full scan, so a page turn only needs a live scroll-position read, no re-summation. Also returns what it computed (see ExactPageResult's doc comment) so a same-tick caller doesn't have to wait on the setState below to land.
  const notifyLocatorChanged = useCallback((locator: Locator): ExactPageResult => {
    const unavailable: ExactPageResult = { currentPageRange: null, totalPages: state.totalPages };
    if (!enabled || !publication || isFXL || isScroll) return unavailable;

    const info = perResourceRef.current.get(locator.href);
    if (!info) return unavailable;

    if (info.fixedRange) {
      setState((prev) => prev.currentPageRange === info.fixedRange ? prev : { ...prev, currentPageRange: info.fixedRange! });
      return { currentPageRange: info.fixedRange, totalPages: state.totalPages };
    }

    const win = getCframes()?.[0]?.window;
    if (!win) return unavailable;
    const width = win.innerWidth;
    if (!width) return unavailable;

    const scrollLeft = Math.abs(win.document.scrollingElement?.scrollLeft ?? 0);
    const screenIndex = Math.floor(scrollLeft / width);
    const start = info.before + screenIndex * info.perScreenPages + 1;
    const range = info.perScreenPages === 2 ? [start, start + 1] : [start];

    setState((prev) => ({ ...prev, currentPageRange: range }));
    return { currentPageRange: range, totalPages: state.totalPages };
  }, [enabled, publication, isFXL, isScroll, getCframes, state.totalPages]);

  return { ...state, notifyLocatorChanged };
};
