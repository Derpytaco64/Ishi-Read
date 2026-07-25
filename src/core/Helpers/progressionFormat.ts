import { ThProgressionFormat } from "@/preferences/models";
import { TimelineProgression } from "@/core/Hooks/useTimeline";
import { ExactPageCountData } from "@/helpers/exactPageLocator";

export const getSupportedProgressionFormats = (
  timeline?: TimelineProgression,
  exact?: ExactPageCountData
): ThProgressionFormat[] => {
  if (!timeline) {
    return [ThProgressionFormat.none];
  }

  const {
    currentPositions = [],
    totalPositions,
    relativeProgression,
    totalProgression,
    currentIndex,
    totalItems,
    positionsLeft
  } = timeline;

  // CLAUDE-ADDED: Prefer the exact page-count system (useExactPageCount) over the coarse manifest
  // positionsList when it has data -- it's only gated off for FXL/scroll, where these fall back to
  // the old fields below, same as before this existed.
  const effectiveCurrentPositions = exact?.currentPageRange ?? currentPositions;
  const effectiveTotalPositions = exact?.totalPages ?? totalPositions;

  const supported: ThProgressionFormat[] = [ThProgressionFormat.none];

  if (effectiveCurrentPositions.length > 0) {
    supported.push(ThProgressionFormat.positions);
  }

  if (effectiveCurrentPositions.length > 0 && effectiveTotalPositions) {
    supported.push(
      ThProgressionFormat.positionsOfTotal,
      ThProgressionFormat.positionsPercentOfTotal
    );
  }

  if (positionsLeft !== undefined) {
    supported.push(ThProgressionFormat.positionsLeft);
  }

  if (relativeProgression !== undefined) {
    supported.push(
      ThProgressionFormat.resourceProgression,
      ThProgressionFormat.progressionOfResource
    );
  }

  if (totalProgression !== undefined) {
    supported.push(ThProgressionFormat.overallProgression);
  }

  if (currentIndex !== undefined && totalItems !== undefined) {
    supported.push(ThProgressionFormat.readingOrderIndex);
  }

  return supported;
};

export const canRenderProgressionFormat = (
  format: ThProgressionFormat,
  supportedFormats: ThProgressionFormat[]
): boolean => {
  return supportedFormats.includes(format);
};

export const getBestMatchingProgressionFormat = (
  preferredFormats: ThProgressionFormat[],
  timeline?: TimelineProgression,
  exact?: ExactPageCountData
): ThProgressionFormat | null => {
  if (!timeline) {
    return null;
  }

  const supportedFormats = getSupportedProgressionFormats(timeline, exact);

  // Find the first preferred format that's supported
  const firstSupported = preferredFormats.find(format =>
    canRenderProgressionFormat(format, supportedFormats)
  );

  return firstSupported || null;
};
