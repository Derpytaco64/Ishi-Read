"use client";

import { useMemo } from "react";

import progressionStyles from "./assets/styles/thorium-web.reader.progression.module.css";

import { ThProgressionFormat } from "@/preferences/models";
import { ThFormatPref, ThFormatPrefValue } from "@/preferences";

import { ThProgression } from "@/core/Components/Reader/ThProgression";

import { useI18n } from "@/i18n/useI18n";

import { useAppSelector } from "@/lib/hooks";
import { useIsScroll } from "@/hooks";

import { makeBreakpointsMap } from "@/core/Helpers/breakpointsMap";
import { getBestMatchingProgressionFormat } from "@/core/Helpers/progressionFormat";

import classNames from "classnames";

export const StatefulReaderProgression = ({ 
  className,
  formatPref,
  fallbackVariant
}: { 
  className?: string,
  formatPref?: ThFormatPref<ThProgressionFormat | ThProgressionFormat[]>,
  fallbackVariant: ThProgressionFormat | Array<ThProgressionFormat>
}) => {
  const { t } = useI18n();
  
  const unstableTimeline = useAppSelector(state => state.publication.unstableTimeline);
  const exactPageCount = useAppSelector(state => state.publication.exactPageCount);
  const isImmersive = useAppSelector(state => state.reader.isImmersive);
  const isFullscreen = useAppSelector(state => state.reader.isFullscreen);
  const isHovering = useAppSelector(state => state.reader.isHovering);
  const breakpoint = useAppSelector(state => state.theming.breakpoint);
  // CLAUDE-ADDED: useExactPageCount never produces data for FXL/scroll (see its own gating) -- there,
  // falling back to the coarse positionsList-based totalPositions/currentPositions is correct and
  // permanent. But for paginated reflow content, exactPageCount is null for the several seconds its
  // full-book measurement pass takes on every fresh book open (and briefly after any layout-affecting
  // settings change with no prior value cached yet) -- during that window the old fallback logic showed
  // the coarse estimate as if it were final, which can be wildly off from the real per-column count for
  // a given font/margin/column configuration (reported as a "false 400 to 650" page count). Distinguishing
  // "will never have exact data" from "doesn't have it yet" lets the indicator stay blank briefly instead
  // of flashing a wrong number.
  const isFXL = useAppSelector(state => state.publication.isFXL);
  const isScroll = useIsScroll();
  const exactPageCountApplies = !isFXL && !isScroll;

  
  const fallbackFormat = useMemo(() => {
    return {
      variants: fallbackVariant,
      displayInImmersive: true,
      displayInFullscreen: true
    };
  }, [fallbackVariant]);
  
  const breakpointsMap = useMemo(() => {
    return makeBreakpointsMap<ThFormatPrefValue<ThProgressionFormat | ThProgressionFormat[]>>({
      defaultValue: formatPref?.default || fallbackFormat,
      fromEnum: ThProgressionFormat,
      pref: formatPref?.breakpoints,
      validateKey: "variants"
    });
  }, [formatPref, fallbackFormat]);
  
  // Get current preferences with proper fallback
  const currentPrefs = useMemo(() => {
    if (!breakpoint) return formatPref?.default || fallbackFormat;
    return breakpointsMap[breakpoint] || formatPref?.default || fallbackFormat;
  }, [breakpoint, breakpointsMap, formatPref?.default, fallbackFormat]);

  const { variants, displayInImmersive, displayInFullscreen } = currentPrefs;
  
  // Get the display format, handling both single format and array of formats
  const displayFormat = useMemo(() => {
    if (!variants) return fallbackFormat.variants;
    
    // Check if we should hide in immersive mode
    if (isImmersive && displayInImmersive === false && !isHovering) {
      return ThProgressionFormat.none;
    }
    
    // Check if we should hide in fullscreen mode
    if (isImmersive && isFullscreen && displayInFullscreen === false && !isHovering) {
      return ThProgressionFormat.none;
    }
    
    if (Array.isArray(variants)) {
      return getBestMatchingProgressionFormat(variants, unstableTimeline?.progression, exactPageCount) ||
        fallbackFormat.variants;
    }

    return variants;
  }, [variants, unstableTimeline?.progression, exactPageCount, fallbackFormat, isImmersive, isHovering, isFullscreen, displayInImmersive, displayInFullscreen]);

  // Compute display text based on current position and timeline
  const displayText = useMemo(() => {
    if (displayFormat === ThProgressionFormat.none || !unstableTimeline?.progression) {
      return "";
    }

    const {
      currentPositions = [],
      totalPositions,
      relativeProgression,
      totalProgression,
      currentChapter,
      positionsLeft,
      totalItems,
      currentIndex
    } = unstableTimeline.progression;

    // CLAUDE-ADDED: Prefer the exact page-count system (useExactPageCount) over the coarse manifest
    // positionsList when it has data -- see getSupportedProgressionFormats for the matching logic that
    // decided displayFormat in the first place. Only falls back to the old fields where exact counting
    // doesn't apply at all (FXL/scroll) -- when it applies but just hasn't finished its first pass yet,
    // effectivePositions/effectiveTotal stay empty/undefined so the cases below render nothing rather
    // than the coarse (and potentially very inaccurate) estimate.
    const effectivePositions = exactPageCount?.currentPageRange ?? (exactPageCountApplies ? [] : currentPositions);
    const effectiveTotal = exactPageCount?.totalPages ?? (exactPageCountApplies ? undefined : totalPositions);
    // CLAUDE-ADDED: One decimal place (not a rounded whole percent) for the overall book progress.
    // Deliberately always derived from totalProgression, never from the exact-page-count ratio --
    // exactPageCount measures pages against the *current* font/column/margin settings, which is a
    // different unit than the content-based positionsList totalProgression that's persisted to the
    // server and used everywhere else (library grid, book details). Using exactPageCount here made the
    // in-reader percentage disagree with those by a point or more even at the same reading position;
    // totalProgression is the one canonical, cross-surface progress metric.
    const effectivePercentage = ((totalProgression || 0) * 100).toFixed(1);

    let text = "";

    // Format positions for display (handle array of two positions with a dash)
    const formatPositions = (positions: number[]) => {
      if (positions.length === 2) {
        return positions.join("–");
      }
      return positions[0]?.toString() || "";
    };

    switch (displayFormat) {
      case ThProgressionFormat.positions:
        if (effectivePositions.length > 0) {
          text = formatPositions(effectivePositions);
        }
        break;

      case ThProgressionFormat.positionsOfTotal:
        if (effectivePositions.length > 0 && effectiveTotal) {
          text = t("reader.progression.xOfY.compact", {
            x: formatPositions(effectivePositions),
            y: effectiveTotal
          });
        }
        break;

      case ThProgressionFormat.positionsPercentOfTotal:
        if (effectivePositions.length > 0 && effectiveTotal) {
          text = t("reader.progression.xOfY.descriptive", {
            x: formatPositions(effectivePositions),
            y: effectiveTotal,
            z: `${ effectivePercentage }%`
          });
        }
        break;

      case ThProgressionFormat.positionsLeft:
        if (positionsLeft !== undefined) {
          text = t(`reader.progression.positionsLeftInChapter.descriptive`, {
            count: positionsLeft
          });
        }
        break;

      case ThProgressionFormat.overallProgression:
        if (totalProgression !== undefined) {
          text = `${ effectivePercentage }%`;
        }
        break;
        
      case ThProgressionFormat.resourceProgression:
        if (relativeProgression !== undefined) {
          const percentage = Math.round(relativeProgression * 100);
          text = `${ percentage }%`;
        }
        break;
        
      case ThProgressionFormat.progressionOfResource:
        if (relativeProgression !== undefined) {
          const percentage = Math.round(relativeProgression * 100);
          text = t("reader.progression.xOfY.compact", {
            x: `${ percentage }%`,
            y: currentChapter || t("reader.app.progression.referenceFallback")
          });
        }
        break;

      case ThProgressionFormat.readingOrderIndex:
        if (currentIndex !== undefined && totalItems !== undefined) {
          text = t("reader.progression.xOfY.compact", {
            x: currentIndex,
            y: totalItems
          });
        }
        break;
    }
    
    return text;
  }, [displayFormat, unstableTimeline, exactPageCount, exactPageCountApplies, t]);

  if (!displayText || displayFormat === ThProgressionFormat.none) {
    return null;
  }

  return (
    <ThProgression 
      id="current-progression" 
      className={ classNames(progressionStyles.wrapper, className) }
      aria-label={ t("reader.app.progression.wrapper") }
    >
      { displayText }
    </ThProgression>
  );
};