"use client";

// CLAUDE-ADDED: Shared "is this resource a bare full-page illustration" detection, used by both useShortImageSpread.ts (to decide what to pair in two-column mode) and useExactPageCount.ts (to decide what to exclude from the generic screens-based page count, since a paired or solo insert image is always exactly one physical page -- see useExactPageCount.ts for why). Pulled out to its own module so the two hooks can't drift into disagreeing about what counts as a "short image".
import { Link, Publication } from "@readium/shared";

export interface ShortImageInfo {
  imageUrl: string;
}

// CLAUDE-ADDED: Anything above this body-text length is treated as a real content page (chapter text, front matter with a paragraph, etc.), not a bare illustration -- generous enough to allow stray whitespace/pagination artifacts without accidentally matching actual prose.
export const SHORT_TEXT_THRESHOLD = 20;

// CLAUDE-ADDED: Resolves a resource-relative image src (e.g. "../images/insert.jpg") to an absolute URL using the resource's own resolved location as the base, not the publication root -- EPUB asset paths are relative to the XHTML file that references them.
const resolveImageUrl = (imgSrc: string, resourceUrl: string): string | null => {
  try {
    return new URL(imgSrc, resourceUrl).toString();
  } catch {
    return null;
  }
};

// CLAUDE-ADDED: Landscape images already get their own full-spread treatment via the column-span:all rule from getLandscapeSpreadScript -- pairing one with a neighbor as well would mean two competing mechanisms rendering it at once (native column-span:all in the iframe *and* half-width in the pairing overlay), producing a doubled/overlapping image. Landscape images are excluded from short-image detection entirely; same natural-dimensions probe technique as the library grid's landscape detection.
const probeIsLandscape = (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const probe = new window.Image();
    probe.onload = () => resolve(probe.naturalWidth > probe.naturalHeight);
    probe.onerror = () => resolve(false);
    probe.src = url;
  });
};

// CLAUDE-ADDED: Calibre-generated cover pages commonly wrap the cover image as an SVG <image
// xlink:href="..."/> instead of a plain <img> (a "fake viewport" trick to force the image to fill the
// page regardless of its native size) -- getElementsByTagName("image") catches those too, matching by
// local name the same way as the <img> lookup below regardless of the SVG namespace.
const getImageHref = (el: Element): string | null =>
  el.getAttribute("xlink:href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || el.getAttribute("href");

// CLAUDE-ADDED: Fetches and parses a resource independently of the navigator's own iframe pool (there's no shared cache between them -- confirmed via @readium/shared's Resource/Fetcher -- so this is a real, if small, network fetch) to determine whether it's a bare full-page image. Uses getElementsByTagName rather than querySelectorAll: readAsXML() parses as 'text/xml', and an unprefixed CSS type selector doesn't reliably match elements sitting in the XHTML default namespace across parsers, while getElementsByTagName matches by local name regardless.
export const detectShortImage = async (publication: Publication, link: Link): Promise<ShortImageInfo | null> => {
  try {
    const doc = await publication.get(link).readAsXML();
    const body = doc?.getElementsByTagName("body")?.[0];

    if (body) {
      const imgs = body.getElementsByTagName("img");
      const svgImages = body.getElementsByTagName("image");
      const text = (body.textContent || "").trim();

      if (imgs.length + svgImages.length === 1 && text.length <= SHORT_TEXT_THRESHOLD) {
        const src = imgs.length === 1 ? imgs[0]!.getAttribute("src") : getImageHref(svgImages[0]!);
        const resourceUrl = link.toURL(publication.baseURL);
        const imageUrl = src && resourceUrl ? resolveImageUrl(src, resourceUrl) : null;
        if (imageUrl && !(await probeIsLandscape(imageUrl))) return { imageUrl };
      }
    }
  } catch {
    return null;
  }
  return null;
};
