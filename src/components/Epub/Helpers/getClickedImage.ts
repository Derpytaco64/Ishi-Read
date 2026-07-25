import { FrameClickEvent } from "@readium/navigator-html-injectables";

export interface ClickedImage {
  src: string;
  alt?: string;
}

// CLAUDE-ADDED: Loosely typed to match whatever useEpubNavigator's getCframes returns (see
// useShortImageSpread.ts/useMarginSync.ts for the same pattern) without importing its private/unstable
// frame-manager types.
export type GetCframes = () => (({ window: Window }) | undefined)[] | undefined;

// CLAUDE-ADDED: Matches both a plain <img> and an SVG <image> (see detectShortImage.ts's
// getImageHref -- calibre-style cover pages commonly wrap the cover as <svg><image xlink:href="..."/>)
// as a cheap outerHTML pre-filter before touching the DOM at all.
const IMG_TAG_RE = /^<(?:img|image)[\s>]/i;

// CLAUDE-ADDED: FrameClickEvent.targetElement is outerHTML (cheap to check, no DOM access needed) but
// its targetFrameSrc is the reading iframe's own blob: URL -- @readium/navigator loads resources via
// blob URLs, and a blob: URL can't be used as a base to resolve a relative `src` attribute (`new
// URL("../Images/x.jpg", blobUrl)` throws). The frame's *document* has the real HTTP base URI though
// (injected by the navigator so the content's own relative asset references resolve correctly), so once
// a click looks like it's on an image, the real element is looked up live via getCframes() + the event's
// cssSelector and its already-resolved location is read directly instead.
export const getClickedImage = (event: FrameClickEvent, getCframes: GetCframes): ClickedImage | null => {
  const target = event.targetElement?.trim();
  if (!target || !IMG_TAG_RE.test(target) || !event.cssSelector) return null;

  const frame = getCframes()?.find(f => f?.window?.location?.href === event.targetFrameSrc);
  if (!frame) return null;

  try {
    const el = frame.window.document.querySelector(event.cssSelector);
    if (!el) return null;

    // CLAUDE-ADDED: XHTML/SVG elements are XML nodes -- tagName preserves the source's lowercase local
    // name ("img"/"image") instead of HTML's uppercase-normalized form, so this compares case-insensitively.
    const tag = el.tagName.toLowerCase();

    if (tag === "img") {
      const img = el as HTMLImageElement;
      return { src: img.currentSrc || img.src, alt: img.alt || undefined };
    }

    if (tag === "image") {
      // SVG <image> has no browser-resolved currentSrc equivalent -- resolve its href attribute
      // against the document's own real HTTP base URI (never targetFrameSrc, see above).
      const svgImg = el as SVGImageElement;
      const href = svgImg.getAttribute("xlink:href")
        || svgImg.getAttributeNS("http://www.w3.org/1999/xlink", "href")
        || svgImg.getAttribute("href");
      if (!href) return null;

      const src = new URL(href, frame.window.document.baseURI).toString();
      return { src, alt: svgImg.getAttribute("aria-label") || undefined };
    }

    return null;
  } catch {
    return null;
  }
};
