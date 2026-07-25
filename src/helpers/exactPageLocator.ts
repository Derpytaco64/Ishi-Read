import { Locator, LocatorLocations } from "@readium/shared";

// CLAUDE-ADDED: Serializable per-resource summary from useExactPageCount's scan (see that file), kept separately from its internal perResourceRef Map so it can be threaded through Redux (via useTimeline/setTimeline) for consumers -- like the "Go to position" dialog -- that live outside StatefulReader.tsx's own tree and need to reverse a page number back into a navigable Locator. Lives here (not under components/Epub/) since useTimeline is layout-agnostic (shared by the WebPub reader too) and shouldn't import from an Epub-specific hook.
export interface ExactPageResourceEntry {
  href: string;
  // Pages before this resource's own first page -- e.g. a resource with before=10, pages=4 contributes pages 11-14.
  before: number;
  // Total physical pages this resource contributes. 0 for the cover, which is deliberately excluded from the running page count (see useExactPageCount.ts) and only ever reachable via page 0.
  pages: number;
  // How many physical pages one on-screen view of this resource shows (1 or 2).
  perScreenPages: number;
  // How many on-screen views (screens) this resource has. Always 1 for short/paired-image resources.
  screens: number;
}

// CLAUDE-ADDED: Mirrors useExactPageCount's own state shape (src/components/Epub/Hooks/useExactPageCount.ts) -- the subset of it that gets dispatched to Redux (see setExactPageCount in publicationReducer.ts) for consumers outside StatefulReader.tsx's tree (footer, "Go to position" dialog).
export interface ExactPageCountData {
  totalPages: number | null;
  currentPageRange: number[] | null;
  resourcePages: ExactPageResourceEntry[] | null;
}

// CLAUDE-ADDED: Reverses an exact page number back into a Locator the navigator can actually go to. Mirrors the same progression-fraction mechanism @readium/navigator's EpubNavigator.go()/ColumnSnapper already implement for `go_progression` (scrollLeft = (scrollWidth - innerWidth) * progression, snapped to the nearest page) -- so this needs no navigator changes, just a fraction that lands on the right screen.
export const findExactPageLocator = (
  resourcePages: ExactPageResourceEntry[] | null | undefined,
  targetPage: number
): Locator | null => {
  if (!resourcePages || resourcePages.length === 0) return null;

  if (targetPage <= 0) {
    const cover = resourcePages[0]!;
    return new Locator({ href: cover.href, type: "", locations: new LocatorLocations({ progression: 0 }) });
  }

  const entry = resourcePages.find((r) => r.pages > 0 && targetPage > r.before && targetPage <= r.before + r.pages);
  if (!entry) return null;

  const pageWithinResource = targetPage - entry.before; // 1-indexed
  const screenIndex = Math.floor((pageWithinResource - 1) / entry.perScreenPages);
  // CLAUDE-ADDED: ColumnSnapper's go_progression handler maps position linearly onto
  // (scrollWidth - innerWidth), i.e. scrollLeft = screenIndex * innerWidth requires
  // position = screenIndex / (screens - 1), not screenIndex / screens -- the latter
  // systematically undershoots (more so for resources with fewer screens), landing a
  // page or more early after the handler's own snap-to-nearest-page rounding.
  const progression = entry.screens > 1 ? screenIndex / (entry.screens - 1) : 0;

  return new Locator({ href: entry.href, type: "", locations: new LocatorLocations({ progression }) });
};

// CLAUDE-ADDED: The reverse of findExactPageLocator -- given a Locator, finds its resource entry by
// href and inverts the same screenIndex/progression math to recover the exact page number. Deliberately
// NOT the crude `Math.round(locator.locations.totalProgression * totalPages)` shortcut -- that assumes
// pages are distributed uniformly across the whole book, which they aren't (chapters vary in length),
// so it drifts off by a page or more. Used by the Annotations panel to label saved highlights/bookmarks/
// notes with the same page numbering the footer and "Go to position" dialog already show.
export const findExactPageForLocator = (
  resourcePages: ExactPageResourceEntry[] | null | undefined,
  locator: Locator
): number | null => {
  if (!resourcePages || resourcePages.length === 0) return null;

  const entry = resourcePages.find((r) => r.href === locator.href);
  if (!entry || entry.pages <= 0) return null;

  const progression = locator.locations?.progression ?? 0;
  const screenIndex = entry.screens > 1 ? Math.round(progression * (entry.screens - 1)) : 0;
  const pageWithinResource = screenIndex * entry.perScreenPages + 1;

  return entry.before + pageWithinResource;
};
