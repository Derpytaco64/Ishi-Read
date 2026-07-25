import { Locator } from "@readium/shared";
import { ExactPageResourceEntry, findExactPageForLocator } from "@/helpers/exactPageLocator";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

// CLAUDE-ADDED: Prefers the exact per-resource page lookup (findExactPageForLocator) over a global
// totalProgression*totalPages approximation -- the latter assumes pages are distributed uniformly
// across the whole book, which drifts off by a page or more since chapters vary in length. Falls back
// to a percentage (scroll mode, or when resourcePages/totalPages aren't available yet).
export function getLocationLabel(
  t: TranslateFn,
  locator: Locator,
  isScroll: boolean,
  totalPages: number | null | undefined,
  resourcePages: ExactPageResourceEntry[] | null | undefined
): string {
  if (!isScroll && totalPages) {
    const page = findExactPageForLocator(resourcePages, locator);
    if (page !== null) {
      return t("reader.progression.xOfY.compact", { x: page, y: totalPages });
    }
  }

  const totalProgression = locator.locations?.totalProgression;
  if (totalProgression === undefined || totalProgression === null) return "";

  return t("reader.progression.percentage", { percentage: (totalProgression * 100).toFixed(1) });
}
