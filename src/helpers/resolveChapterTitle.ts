import { UnstableTimeline } from "@/core/Hooks/useTimeline";

// CLAUDE-ADDED: useTimeline already resolves each reading-order href to a display title -- its own
// title if the TOC points straight at it, else the nearest preceding TOC entry's title walking
// backward through the reading order (see useTimeline.ts's findNearestTitle) -- so this is a lookup,
// not a fresh resolution. Deliberately NOT locator.title: that's the raw, unresolved title Readium's
// manifest gives the underlying spine resource (can be wrong/generic, e.g. an EPUB internally
// titling every appendix-adjacent file "Appendix"), unrelated to which chapter a reader experiences
// themselves being in. href's fragment is stripped since `items` is keyed by bare reading-order href.
export function resolveChapterTitle(items: UnstableTimeline["items"] | undefined, href: string): string | undefined {
  const title = items?.[href.split("#")[0]]?.title?.trim();
  return title || undefined;
}
