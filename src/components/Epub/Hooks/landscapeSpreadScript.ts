import { SHORT_TEXT_THRESHOLD } from "./detectShortImage";

export const LANDSCAPE_SPREAD_CLASS = "th-landscape-spread";

// CLAUDE-ADDED: Shared between the live injected script below and applyLandscapeSpreadLayoutSync (used by useExactPageCount's hidden measurement iframe) via .toString() embedding, so the two can't drift into disagreeing about what "landscape" or "embedded" means. Must stay self-contained (only reference its own parameters) since its source is serialized into the injected script string as-is.
//
// A standalone landscape image (the resource's entire body is essentially just the image -- see
// detectShortImage.ts's SHORT_TEXT_THRESHOLD-based definition) keeps the original column-span:all
// treatment: that resource is a single "row" with nothing else in it, so spanning is safe.
//
// A landscape image embedded in real running text is intentionally left untouched (no column-span:all,
// no placeholder/absolute-position overlay): the overlay approach measures column geometry once at mark
// time, and that measurement goes stale across a column-mode change without a full resource reload,
// producing a broken layout on first render. Simplest correct behavior until that staleness is fixed
// properly: let the browser lay the image out normally, same as any other inline image.
const markLandscapeImage = (
  img: HTMLImageElement,
  doc: Document,
  threshold: number,
  spreadClass: string
): void => {
  if (img.naturalWidth <= img.naturalHeight) return;

  const isEmbedded = (doc.body.textContent || "").trim().length > threshold;
  if (isEmbedded) return; // Mid-chapter landscape image: leave it in normal flow, no special treatment.

  // Standalone full-page insert: exact existing behavior, unchanged.
  img.classList.add(spreadClass);
};

// CLAUDE-ADDED: One-shot pass for useExactPageCount's hidden iframe, called after its own waitForImages has already resolved every image's natural dimensions -- unlike the live injected script below, nothing here needs to wait on a `load` event.
export const applyLandscapeSpreadLayoutSync = (doc: Document): void => {
  Array.from(doc.images).forEach((img) => {
    if (img.complete && img.naturalWidth) {
      markLandscapeImage(img, doc, SHORT_TEXT_THRESHOLD, LANDSCAPE_SPREAD_CLASS);
    }
  });
};

// CLAUDE-ADDED: Injected into each reflowable resource. For a standalone landscape insert, marks it so
// readium-css's two-column layout lets it span the full spread (column-span:all is a no-op in 1-column
// mode -- takes effect once there's more than one column to span). A landscape image embedded in real
// text is left alone entirely -- see markLandscapeImage's own comment for why.
export const getLandscapeSpreadScript = () => `(function () {
  var CLASS_NAME = "${ LANDSCAPE_SPREAD_CLASS }";
  var THRESHOLD = ${ SHORT_TEXT_THRESHOLD };

  var style = document.createElement("style");
  style.textContent = "." + CLASS_NAME + "{display:block;-webkit-column-span:all;column-span:all;max-width:100%;height:auto;margin:0 auto;}";
  document.head.appendChild(style);

  var markLandscapeImage = ${ markLandscapeImage.toString() };

  function mark(img) {
    markLandscapeImage(img, document, THRESHOLD, CLASS_NAME);
  }

  document.querySelectorAll("img").forEach(function (img) {
    if (img.complete && img.naturalWidth) {
      mark(img);
    } else {
      img.addEventListener("load", function () { mark(img); }, { once: true });
    }
  });
})();`;
