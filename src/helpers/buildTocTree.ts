import { Link, Locator } from "@readium/shared";
import { ExactPageResourceEntry } from "@/helpers/exactPageLocator";

export interface TocItem {
  id: string;
  href: string;
  title?: string;
  children?: TocItem[];
  position?: number;
  // CLAUDE-ADDED: False when this entry's href isn't in the publication's reading order (e.g. a
  // linear="no" spine item like a cover.xhtml some EPUBs exclude from the normal reading flow). The
  // vendored @readium/navigator's own goLink refuses to navigate anywhere outside the reading order --
  // it silently no-ops -- so such an entry can never actually be reached from the TOC. Defaults to true
  // (via readingOrderHrefs being optional below) so callers that don't care about this distinction are
  // unaffected.
  isNavigable?: boolean;
}

export type TocEntryRef = Omit<TocItem, "children">;

export const toEntryRef = ({ children: _, ...ref }: TocItem): TocEntryRef => ref;

export const buildTocTree = (
  links: Link[],
  idGenerator: () => string,
  positionsList?: Locator[],
  publicationTitle?: string,
  readingOrderHrefs?: Set<string>
): TocItem[] => {
  return links.map((link) => {
    const newId = idGenerator();

    let href = link.href;
    const fragmentIndex = href.indexOf("#");
    if (fragmentIndex !== -1) {
      const baseHref = href.substring(0, fragmentIndex);
      const duplicateLink = links.find((l) => l.href.startsWith(baseHref) && l.href !== href);
      if (!duplicateLink) {
        href = baseHref;
      }
    }

    const counter = parseInt(newId.split("-")[1], 10);

    const treeNode: TocItem = {
      id: newId,
      href: href,
      title: link.title || (
        publicationTitle
          ? `${ publicationTitle } ${ counter }`
          : newId
      ),
      position: positionsList?.find((position) => position.href === href)?.locations.position,
      isNavigable: readingOrderHrefs ? readingOrderHrefs.has(href) : true
    };

    if (link.children) {
      treeNode.children = buildTocTree(link.children.items, idGenerator, positionsList, publicationTitle, readingOrderHrefs);
    }

    return treeNode;
  });
};

// CLAUDE-ADDED: Remaps every TocItem's position from the coarse positionsList-derived number (set by buildTocTree above) to the exact page-count system's page number, so the TOC stays consistent with the footer/"Go to position" dialog once useExactPageCount has data (see StatefulTocContainer.tsx). A TOC entry's href may include a fragment identifying a sub-heading partway through a resource, but useExactPageCount only tracks per-resource page ranges (no fragment-level granularity) -- every entry within the same resource is shown with that resource's starting page, same tradeoff the exact system already makes elsewhere.
//
// resourcePages is built purely from the reading order (see useExactPageCount.ts), but a TOC can
// legitimately list entries that aren't in the reading order at all -- e.g. a `cover.xhtml` some EPUBs
// mark linear="no" and exclude from the normal reading flow. Such an entry can never resolve to a page
// number and isn't reachable via the reader's pagination either (see TocItem.isNavigable) -- it's left
// with whatever position buildTocTree already gave it (typically undefined) rather than inventing one,
// so the TOC doesn't claim a page for a page the reader can't actually turn to.
export const applyExactPositions = (
  items: TocItem[],
  resourcePages: ExactPageResourceEntry[]
): TocItem[] => {
  return items.map((item) => {
    const baseHref = item.href.split("#")[0];
    const entry = resourcePages.find((r) => r.href === baseHref);

    return {
      ...item,
      position: entry ? (entry.pages > 0 ? entry.before + 1 : 0) : item.position,
      children: item.children ? applyExactPositions(item.children, resourcePages) : undefined
    };
  });
};

export const findTocItemById = (items: TocItem[], id: string): TocItem | undefined => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findTocItemById(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
};

export const findTocItemByHref = (items: TocItem[], href: string): TocItem | undefined => {
  // Pass 1: exact href match
  const exact = searchTocItems(items, (item) => item.href === href);
  if (exact) return exact;

  // Pass 2: bare href match (strip fragment on both sides)
  const bareHref = href.split("#")[0];
  return searchTocItems(items, (item) => item.href.split("#")[0] === bareHref);
};

const searchTocItems = (items: TocItem[], predicate: (item: TocItem) => boolean): TocItem | undefined => {
  for (const item of items) {
    if (predicate(item)) return item;
    if (item.children) {
      const found = searchTocItems(item.children, predicate);
      if (found) return found;
    }
  }
  return undefined;
};
