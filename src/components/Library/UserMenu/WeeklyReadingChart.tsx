"use client";

import { WeeklyBookTypeDay } from "@/lib/userData/weeklyStatsTypes";

import ChevronLeft from "@/components/Misc/assets/icons/chevron_left.svg";
import ChevronRight from "@/components/Misc/assets/icons/chevron_right.svg";

import styles from "./assets/styles/thorium-web.weeklyReadingChart.module.css";

// CLAUDE-ADDED: Mirrors the Android app's WeeklyReadingChart.kt -- same literal RGB and same stack
// order (EPUB top, Manga/Comic middle, Audiobooks bottom). Both the colors and the stack order were
// reassigned per explicit user requests (first Audiobook/Comic colors swapped, then Audiobook/Comic
// stack *positions* swapped too), so neither mapping matches the original red/green/blue-by-position
// mnemonic anymore -- that's intentional, not a bug.
const EPUB_COLOR = "#E53935";
const AUDIOBOOK_COLOR = "#1E88E5";
const COMIC_COLOR = "#43A047";

// CLAUDE-ADDED: Arbitrary "logical" viewBox units, not physical pixels -- the <svg> stretches to
// fill its container via preserveAspectRatio="none" (see .svg's width:100%/height:100% below), and
// every stroke uses vectorEffect="non-scaling-stroke" so that non-uniform stretch doesn't distort
// line thickness.
const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;
const AREA_FILL_OPACITY = 0.35;

interface WeeklyReadingChartProps {
  days: WeeklyBookTypeDay[];
  canGoToNextWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

// CLAUDE-ADDED: Appending a local midnight time avoids the UTC-parse shift new Date("YYYY-MM-DD")
// otherwise applies, which can land a day off depending on the browser's timezone -- same reasoning
// as the server's own getLocalDateKey helpers.
function parseLocalDate(dateStr: string): Date {
  return new Date(`${ dateStr }T00:00:00`);
}

function formatDateRangeTitle(days: WeeklyBookTypeDay[]): string {
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const start = formatter.format(parseLocalDate(days[0].date));
  const end = formatter.format(parseLocalDate(days[days.length - 1].date));
  return `${ start } – ${ end }`;
}

function formatDayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parseLocalDate(dateStr));
}

/** Compact single-unit axis label ("2h"/"45m"/"30s") -- mirrors Android's own formatAxisSeconds; an
 *  axis tick doesn't need every unit down to the second, just enough to read the scale at a glance. */
function formatAxisSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  if (whole >= 3600) return `${ Math.floor(whole / 3600) }h`;
  if (whole >= 60) return `${ Math.floor(whole / 60) }m`;
  return `${ whole }s`;
}

/**
 * Top-of-stats-dialog graph: 7 local calendar days of reading/listening time, stacked by book type.
 * Title is the covered date range, flanked by prev/next-week arrows (onNextWeek disabled once
 * canGoToNextWeek is false -- there's no "next week" past the one that includes today); a left-side
 * time scale and a legend below (identity is never color-alone) round it out.
 */
export function WeeklyReadingChart({ days, canGoToNextWeek, onPreviousWeek, onNextWeek }: WeeklyReadingChartProps) {
  if (days.length === 0) return null;

  const n = days.length;
  const hasActivity = days.some(day => day.epubSeconds + day.comicSeconds + day.audiobookSeconds > 0);
  const maxTotalSeconds = Math.max(
    60,
    ...days.map(day => day.epubSeconds + day.comicSeconds + day.audiobookSeconds)
  );

  // CLAUDE-ADDED: Points sit at the center of n equal-width columns, matching the flex/flex:1
  // day-label row below so the chart and its x-axis labels line up exactly.
  const xAt = (i: number) => (i + 0.5) / n * CHART_WIDTH;
  const yAt = (seconds: number) => CHART_HEIGHT - (seconds / maxTotalSeconds) * CHART_HEIGHT;

  const zero = days.map(() => 0);
  const audiobookTop = days.map(day => day.audiobookSeconds);
  const comicTop = days.map((day, i) => audiobookTop[i] + day.comicSeconds);
  const epubTop = days.map((day, i) => comicTop[i] + day.epubSeconds);

  const bandFillPath = (bottom: number[], top: number[]) => {
    const topPoints = top
      .map((value, i) => `${ i === 0 ? "M" : "L" }${ xAt(i).toFixed(2) },${ yAt(value).toFixed(2) }`)
      .join(" ");
    const bottomPoints = bottom
      .map((value, i) => ({ i, value }))
      .reverse()
      .map(({ i, value }) => `L${ xAt(i).toFixed(2) },${ yAt(value).toFixed(2) }`)
      .join(" ");
    return `${ topPoints } ${ bottomPoints } Z`;
  };

  const topEdgePath = (top: number[]) =>
    top.map((value, i) => `${ i === 0 ? "M" : "L" }${ xAt(i).toFixed(2) },${ yAt(value).toFixed(2) }`).join(" ");

  return (
    <div className={ styles.chart }>
      <div className={ styles.header }>
        <button type="button" className={ styles.navButton } onClick={ onPreviousWeek } aria-label="Previous week">
          <ChevronLeft aria-hidden="true" focusable="false" />
        </button>
        <span className={ styles.title }>{ formatDateRangeTitle(days) }</span>
        <button
          type="button"
          className={ styles.navButton }
          onClick={ onNextWeek }
          disabled={ !canGoToNextWeek }
          aria-label="Next week"
        >
          <ChevronRight aria-hidden="true" focusable="false" />
        </button>
      </div>

      <div className={ styles.body }>
        <div className={ styles.axisLabels }>
          <span>{ hasActivity ? formatAxisSeconds(maxTotalSeconds) : "" }</span>
          <span>{ hasActivity ? formatAxisSeconds(maxTotalSeconds / 2) : "" }</span>
          <span>0</span>
        </div>

        <div className={ styles.plotArea }>
          { !hasActivity && <span className={ styles.emptyState }>No reading this week</span> }
          <svg
            viewBox={ `0 0 ${ CHART_WIDTH } ${ CHART_HEIGHT }` }
            preserveAspectRatio="none"
            className={ styles.svg }
            aria-hidden="true"
          >
            { [0, 0.5, 1].map(fraction => (
              <line
                key={ fraction }
                x1={ 0 }
                y1={ CHART_HEIGHT * fraction }
                x2={ CHART_WIDTH }
                y2={ CHART_HEIGHT * fraction }
                className={ styles.gridline }
                vectorEffect="non-scaling-stroke"
              />
            )) }

            <path d={ bandFillPath(zero, audiobookTop) } fill={ AUDIOBOOK_COLOR } fillOpacity={ AREA_FILL_OPACITY } />
            <path d={ bandFillPath(audiobookTop, comicTop) } fill={ COMIC_COLOR } fillOpacity={ AREA_FILL_OPACITY } />
            <path d={ bandFillPath(comicTop, epubTop) } fill={ EPUB_COLOR } fillOpacity={ AREA_FILL_OPACITY } />

            <path d={ topEdgePath(audiobookTop) } fill="none" stroke={ AUDIOBOOK_COLOR } strokeWidth={ 2 } strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={ topEdgePath(comicTop) } fill="none" stroke={ COMIC_COLOR } strokeWidth={ 2 } strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={ topEdgePath(epubTop) } fill="none" stroke={ EPUB_COLOR } strokeWidth={ 2 } strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      <div className={ styles.dayLabels }>
        <span className={ styles.axisSpacer } aria-hidden="true" />
        { days.map(day => (
          <span key={ day.date } className={ styles.dayLabel }>{ formatDayLabel(day.date) }</span>
        )) }
      </div>

      <div className={ styles.legend }>
        <span className={ styles.legendItem }>
          <span className={ styles.legendSwatch } style={{ backgroundColor: EPUB_COLOR }} />
          EPUB
        </span>
        <span className={ styles.legendItem }>
          <span className={ styles.legendSwatch } style={{ backgroundColor: COMIC_COLOR }} />
          Manga/Comic
        </span>
        <span className={ styles.legendItem }>
          <span className={ styles.legendSwatch } style={{ backgroundColor: AUDIOBOOK_COLOR }} />
          Audiobook
        </span>
      </div>
    </div>
  );
}
