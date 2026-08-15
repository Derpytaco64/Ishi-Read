import { ReadingSpeedSample } from "@/lib/userData/readingTimeTypes";

// CLAUDE-ADDED: Below this many samples, a median/MAD estimate is too noisy to trust (e.g. 2 samples
// always have MAD 0 or a single "outlier" that's actually half the data) -- just average everything
// instead of trying to trim. Matches MAX_SPEED_SAMPLES (the rolling buffer's own cap, see
// readingTimeReducer.ts) so trimming never kicks in until the buffer is completely full of real
// samples -- otherwise an early, still-warming-up buffer could have a genuine read trimmed out as an
// "outlier" against only a handful of other samples.
const MIN_SAMPLES_FOR_TRIM = 50;

// CLAUDE-ADDED: A sample survives if its rate is within this many median-absolute-deviations of the
// median rate -- the Kindle/Moon+-style "discard outliers" step, using a robust (not mean/stddev,
// which outliers themselves would skew) measure of spread instead of a fixed top/bottom percentile
// trim, since a fixed percentile always throws away *something* even when every sample is honest.
const MAD_THRESHOLD = 2.5;

// CLAUDE-ADDED: Hard sanity ceiling on a single sample's implied wpm, applied before the median/MAD
// trim above ever runs. Median/MAD is a "majority wins" statistic -- it can't tell which side of a
// split is the real reading pace, so if enough inhuman-fast samples (e.g. flipping past a book's
// cover/title pages) land in the buffer together, they can outnumber genuine reading and make *that*
// the "outlier" that gets trimmed instead. This removes anything no human reading pace could produce
// before the trim runs, so it can't be out-voted by a cluster of bad data.
const PLAUSIBLE_WPM_CEILING = 600;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function weightedRate(samples: ReadingSpeedSample[]): number | null {
  const totalWords = samples.reduce((sum, s) => sum + s.deltaWords, 0);
  const totalSeconds = samples.reduce((sum, s) => sum + s.deltaSeconds, 0);
  return totalSeconds > 0 ? totalWords / (totalSeconds / 60) : null;
}

// CLAUDE-ADDED: Current words-per-minute estimate from the rolling sample buffer -- null means "not
// enough data yet" (empty state in the UI), not zero. Weights by sample size (Σwords / Σseconds)
// rather than averaging each sample's own rate, so a handful-of-words sample doesn't count as much as
// a full-page one.
export function computeCurrentWpm(samples: ReadingSpeedSample[]): number | null {
  if (samples.length === 0) return null;

  const rates = samples.map(s => s.deltaWords / (s.deltaSeconds / 60));
  const plausible = samples.filter((_, i) => rates[i]! >= 0 && rates[i]! <= PLAUSIBLE_WPM_CEILING);
  // CLAUDE-ADDED: If literally every sample is above the ceiling (a consistently very fast reader),
  // fall back to the full buffer rather than returning nothing -- the ceiling is meant to stop a
  // minority of bad data from out-voting good data, not to cap a real reader's pace.
  const pool = plausible.length > 0 ? plausible : samples;

  if (process.env.NODE_ENV !== "production") {
    console.debug(
      `[WpmDebug] buffer=${ samples.length } plausible(<=${ PLAUSIBLE_WPM_CEILING }wpm)=${ plausible.length } rates=[${ rates.map(r => r.toFixed(0)).join(", ") }]`
    );
  }

  if (pool.length < MIN_SAMPLES_FOR_TRIM) return weightedRate(pool);

  const poolRates = pool.map(s => s.deltaWords / (s.deltaSeconds / 60));
  const med = median(poolRates);
  const mad = median(poolRates.map(r => Math.abs(r - med)));

  // CLAUDE-ADDED: mad === 0 means every sample already has (near) the same rate -- nothing to trim.
  const survivors = mad === 0
    ? pool
    : pool.filter((_, i) => Math.abs(poolRates[i]! - med) / mad <= MAD_THRESHOLD);

  if (process.env.NODE_ENV !== "production") {
    console.debug(`[WpmDebug] median=${ med.toFixed(0) } mad=${ mad.toFixed(0) } survivors=${ survivors.length }/${ pool.length }`);
  }

  return weightedRate(survivors.length > 0 ? survivors : pool);
}

// CLAUDE-ADDED: Kindle-style "time left in book" -- words remaining (from the book's total word count
// and how far totalProgression currently is) divided by the current pace. Null when there's no pace
// estimate yet, same "not enough data" convention as computeCurrentWpm.
export function estimateSecondsLeft(wordCount: number, currentProgression: number, wpm: number | null): number | null {
  if (!wpm || wpm <= 0) return null;

  const wordsRemaining = wordCount * (1 - Math.min(1, Math.max(0, currentProgression)));
  return (wordsRemaining / wpm) * 60;
}
