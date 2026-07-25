"use client";

// CLAUDE-ADDED: Spike/test for an "exact" page-turn count (see conversation) -- unlike positionsList (a fixed ~1024-char-per-chunk count from the manifest, unrelated to actual rendered layout -- see useTimeline.ts), this walks every reading-order resource in a hidden, off-screen iframe styled identically to the live reading pane and measures how many real page-turns (scrollWidth / viewportWidth) each one takes, then sums them. This is a genuinely expensive full-book layout pass -- it exists to test whether that cost is tolerable, not as a finished feature. Gated off entirely for FXL (page-per-resource already exact) and scroll mode (no discrete pages to count).
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Locator, Publication } from "@readium/shared";
import { ShortImageInfo, detectShortImage } from "./detectShortImage";
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

export interface ExactPageCountApi extends ExactPageCountState {
  // CLAUDE-ADDED: Cheap per-navigation update -- reuses the per-resource page counts cached by the last full scan instead of re-measuring the whole book on every page turn. Call this from the navigator's positionChanged listener, the same way evaluateSpread is called there.
  notifyLocatorChanged: (locator: Locator) => void;
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
}: UseExactPageCountProps): ExactPageCountApi => {
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
  // CLAUDE-ADDED: Per-resource info from the most recent scan, filled in progressively as each resource is processed, so notifyLocatorChanged can derive a live page range on every navigation without re-scanning. `fixedRange` is for image/paired/solo resources -- always exactly one on-screen position, so the range never needs live scroll info. Generic (prose/cover/landscape) resources instead get `before` + `perScreenPages`, since which screen of a multi-screen resource is showing can only be read live off the current scroll position. Cleared whenever a new scan starts (layoutSignature changed) so a page turn during that gap can't use info computed under the previous font/column/etc.
  const perResourceRef = useRef<Map<string, { before: number; perScreenPages: number; fixedRange?: number[] }>>(new Map());

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

        // CLAUDE-ADDED: Local dedupe for this scan only -- a resource gets probed at most twice (once as the lookahead "is my neighbor short too" check, once when the loop actually reaches it), and this avoids repeating the fetch+parse+landscape-probe for the second one.
        const shortImageCache = new Map<string, ShortImageInfo | null>();
        const getShortImageInfo = async (link: Link): Promise<ShortImageInfo | null> => {
          const cached = shortImageCache.get(link.href);
          if (cached !== undefined) return cached;
          const info = await detectShortImage(publication, link);
          shortImageCache.set(link.href, info);
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
          const shortInfo = (isTwoColumn && i > 0) ? await getShortImageInfo(link) : null;

          if (shortInfo) {
            // CLAUDE-ADDED: A bare full-page illustration always occupies exactly one physical page -- whether it ends up paired with a neighbor (two resources sharing one on-screen spread, e.g. the earlier "9-10 of N" fix) or shown solo (forced to single-column by useShortImageSpread so it isn't squeezed into half the width). Either way there's no layout measurement needed here (always exactly one on-screen position), so (unlike the generic branch) this skips the iframe layout pass entirely -- also a nice speed win, since insert images are exactly the resources that would otherwise need image-decode waits.
            const nextLink = i + 1 < items.length ? items[i + 1]! : null;
            const nextShortInfo = nextLink ? await getShortImageInfo(nextLink) : null;

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

        setState({
          totalPages: total,
          currentPageRange: currentRangeAcc,
          isComputing: false,
          elapsedMs: performance.now() - t0,
          resourceCount: items.length,
          error: null,
          resourcePages,
        });
      };

      run().catch((err) => {
        if (generationRef.current !== generation) return;
        setState((prev) => ({ ...prev, isComputing: false, error: String(err) }));
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [enabled, navigatorReady, publication, isFXL, isScroll, layoutSignature, getCframes, currentLocator, ensureIframe]);

  // CLAUDE-ADDED: O(1) -- everything needed (the "before" total and whether this resource is a fixed single on-screen position or a multi-screen generic one) was already precomputed by the last full scan, so a page turn only needs a live scroll-position read, no re-summation.
  const notifyLocatorChanged = useCallback((locator: Locator) => {
    if (!enabled || !publication || isFXL || isScroll) return;

    const info = perResourceRef.current.get(locator.href);
    if (!info) return;

    if (info.fixedRange) {
      setState((prev) => prev.currentPageRange === info.fixedRange ? prev : { ...prev, currentPageRange: info.fixedRange! });
      return;
    }

    const win = getCframes()?.[0]?.window;
    if (!win) return;
    const width = win.innerWidth;
    if (!width) return;

    const scrollLeft = Math.abs(win.document.scrollingElement?.scrollLeft ?? 0);
    const screenIndex = Math.floor(scrollLeft / width);
    const start = info.before + screenIndex * info.perScreenPages + 1;
    const range = info.perScreenPages === 2 ? [start, start + 1] : [start];

    setState((prev) => ({ ...prev, currentPageRange: range }));
  }, [enabled, publication, isFXL, isScroll, getCframes]);

  return { ...state, notifyLocatorChanged };
};
