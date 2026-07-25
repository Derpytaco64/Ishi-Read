import { ReadingSpeedSample } from "@/lib/userData/readingTimeTypes";

// CLAUDE-ADDED: Below this many samples, a median/MAD estimate is too noisy to trust (e.g. 2 samples
// always have MAD 0 or a single "outlier" that's actually half the data) -- just average everything
// instead of trying to trim.
const MIN_SAMPLES_FOR_TRIM = 5;

// CLAUDE-ADDED: A sample survives if its rate is within this many median-absolute-deviations of the
// median rate -- the Kindle/Moon+-style "discard outliers" step, using a robust (not mean/stddev,
// which outliers themselves would skew) measure of spread instead of a fixed top/bottom percentile
// trim, since a fixed percentile always throws away *something* even when every sample is honest.
const MAD_THRESHOLD = 2.5;

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
  if (samples.length < MIN_SAMPLES_FOR_TRIM) return weightedRate(samples);

  const rates = samples.map(s => s.deltaWords / (s.deltaSeconds / 60));
  const med = median(rates);
  const mad = median(rates.map(r => Math.abs(r - med)));

  // CLAUDE-ADDED: mad === 0 means every sample already has (near) the same rate -- nothing to trim.
  const survivors = mad === 0
    ? samples
    : samples.filter((_, i) => Math.abs(rates[i]! - med) / mad <= MAD_THRESHOLD);

  return weightedRate(survivors.length > 0 ? survivors : samples);
}

// CLAUDE-ADDED: Kindle-style "time left in book" -- words remaining (from the book's total word count
// and how far totalProgression currently is) divided by the current pace. Null when there's no pace
// estimate yet, same "not enough data" convention as computeCurrentWpm.
export function estimateSecondsLeft(wordCount: number, currentProgression: number, wpm: number | null): number | null {
  if (!wpm || wpm <= 0) return null;

  const wordsRemaining = wordCount * (1 - Math.min(1, Math.max(0, currentProgression)));
  return (wordsRemaining / wpm) * 60;
}
