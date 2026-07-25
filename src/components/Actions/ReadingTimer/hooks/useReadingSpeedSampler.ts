"use client";

// CLAUDE-ADDED: The reading-speed counterpart to useReadingTimer -- runs unconditionally from the
// reader shell (not gated on the Reading Speed tab being open, for the same reason useReadingTimer
// isn't gated on the timer button being visible: menu items aren't necessarily mounted while their
// panel is closed). Exposes notifyLocatorChanged, called from StatefulReader.tsx's positionChanged
// listener via a ref, the same pattern useExactPageCount's notifyLocatorChanged already uses.
//
// Each call turns a progression delta (locator.locations.totalProgression, resolution-independent
// unlike page numbers) into a words-read delta using the book's total word count, and divides by the
// *active* seconds elapsed since the last call (useReadingTimer's own visibility-aware clock, read via
// accumulatedSeconds -- so a backgrounded tab never inflates a sample's elapsed time). Samples that
// aren't organic forward reading are hard-discarded before they ever reach the rolling buffer:
// backward navigation (deltaProgression <= 0), a jump bigger than JUMP_DISCARD_THRESHOLD of the whole
// book in one step (TOC click, search result, "go to position" -- not a page turn), or zero elapsed
// active time. What's left is genuinely noisy page-turn-to-page-turn data, which is exactly what
// computeCurrentWpm's median/MAD trimming is for.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Locator } from "@readium/shared";
import debounce from "debounce";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addSpeedSample, setCurrentProgression, setDailyReadingHistory } from "@/lib/readingTimeReducer";
import { saveReadingSpeedSamplesToServer } from "@/lib/userData/readingSpeedApi";
import { saveDailyReadingHistoryToServer } from "@/lib/userData/dailyReadingHistoryApi";
import { ReadingSpeedSample, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";

const JUMP_DISCARD_THRESHOLD = 0.05;
const PERSIST_DEBOUNCE_MS = 2000;

// CLAUDE-ADDED: Local (not UTC) calendar day, so "today" lines up with the day the user actually
// experiences reading in, not whatever day UTC midnight happens to fall on for their timezone.
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ year }-${ month }-${ day }`;
}

export const useReadingSpeedSampler = () => {
  const dispatch = useAppDispatch();
  const manifestUrl = useAppSelector(state => state.readingTime.manifestUrl);
  const wordCount = useAppSelector(state => state.readingTime.wordCount);
  const accumulatedSeconds = useAppSelector(state => state.readingTime.accumulatedSeconds);
  const speedSamples = useAppSelector(state => state.readingTime.speedSamples);
  const dailyReadingHistory = useAppSelector(state => state.readingTime.dailyReadingHistory);

  // CLAUDE-ADDED: Kept fresh every render (no dependency array), same idiom as useReadingTimer's
  // latestSecondsRef -- notifyLocatorChanged is called from the navigator's own event, not from
  // React, so it needs a way to read current values without going stale in a closure.
  const manifestUrlRef = useRef(manifestUrl);
  const wordCountRef = useRef(wordCount);
  const accumulatedSecondsRef = useRef(accumulatedSeconds);
  const samplesRef = useRef(speedSamples);
  const dailyHistoryRef = useRef(dailyReadingHistory);
  useEffect(() => {
    manifestUrlRef.current = manifestUrl;
    wordCountRef.current = wordCount;
    accumulatedSecondsRef.current = accumulatedSeconds;
    samplesRef.current = speedSamples;
    dailyHistoryRef.current = dailyReadingHistory;
  });

  // CLAUDE-ADDED: The previous sample's anchor point -- null means "no anchor yet for this book",
  // which seeds silently on the next call instead of producing a (meaningless, deltaProgression
  // against nothing real) sample. Reset on manifestUrl change so switching books doesn't diff against
  // the previous book's last position.
  const lastProgressionRef = useRef<number | null>(null);
  const lastAccumulatedSecondsRef = useRef<number | null>(null);
  useEffect(() => {
    lastProgressionRef.current = null;
    lastAccumulatedSecondsRef.current = null;
  }, [manifestUrl]);

  // CLAUDE-ADDED: One shared debounce for both -- they're always updated together (see the accepted-
  // sample branch below), so persisting them in the same debounced call halves the network chatter
  // rapid page turns would otherwise cause. Deliberately reads samplesRef/dailyHistoryRef/manifestUrlRef
  // at *fire* time instead of closing over the arrays computed when the save was scheduled: a
  // save-and-reset (or discard-reset) can land inside this debounce's window, synchronously clearing
  // dailyReadingHistory and writing the empty array to the server right away (see completeReadingTimer/
  // resetReadingTimer) -- if this callback still saved the pre-reset array it scheduled with, it would
  // fire after that clear and silently resurrect the just-archived day's bucket into the new "current"
  // period. Reading the refs at fire time means this always persists whatever is true *now*, so it's
  // either a no-op (state hasn't changed since scheduling) or correctly re-saves the post-reset state.
  const debouncedSave = useMemo(
    () => debounce(() => {
      const url = manifestUrlRef.current;
      if (!url) return;
      saveReadingSpeedSamplesToServer(url, samplesRef.current);
      saveDailyReadingHistoryToServer(url, dailyHistoryRef.current);
    }, PERSIST_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    const flush = () => debouncedSave.flush();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [debouncedSave]);

  const notifyLocatorChanged = useCallback((locator: Locator) => {
    const manifestUrl = manifestUrlRef.current;
    const totalProgression = locator.locations.totalProgression;
    if (typeof totalProgression !== "number") return;

    if (manifestUrl) dispatch(setCurrentProgression(totalProgression));

    const wordCount = wordCountRef.current;
    const accumulatedSeconds = accumulatedSecondsRef.current;
    const lastProgression = lastProgressionRef.current;
    const lastAccumulatedSeconds = lastAccumulatedSecondsRef.current;

    // CLAUDE-ADDED: Always re-seed for the next interval before any early return below -- otherwise a
    // single discarded jump (or the very first call for this book) would leave a stale anchor that
    // corrupts every subsequent delta.
    lastProgressionRef.current = totalProgression;
    lastAccumulatedSecondsRef.current = accumulatedSeconds;

    if (!manifestUrl || wordCount === null || lastProgression === null || lastAccumulatedSeconds === null) return;

    const deltaProgression = totalProgression - lastProgression;
    if (deltaProgression <= 0 || deltaProgression > JUMP_DISCARD_THRESHOLD) return;

    const deltaSeconds = accumulatedSeconds - lastAccumulatedSeconds;
    if (deltaSeconds <= 0) return;

    const deltaWords = deltaProgression * wordCount;
    const sample: ReadingSpeedSample = { deltaWords, deltaSeconds, timestamp: Date.now() };

    dispatch(addSpeedSample(sample));

    // CLAUDE-ADDED: Roll the same accepted sample into today's bucket -- extends it if the last bucket
    // is already today's, otherwise starts a fresh one (a new calendar day, or the very first bucket
    // for this open period).
    const dailyHistory = dailyHistoryRef.current;
    const todayKey = getLocalDateKey(new Date());
    const lastBucket = dailyHistory[dailyHistory.length - 1];

    // CLAUDE-ADDED: `?? 0` guards against extending a bucket loaded from before progressionDelta
    // existed (it used to be called progressionAtEnd, a cumulative snapshot, not a per-day delta) --
    // without it, `undefined + deltaProgression` is NaN, which JSON.stringify silently turns into
    // `null` on disk and renders as "NaN%" forever after.
    const todayBucket: DailyReadingBucket = lastBucket && lastBucket.date === todayKey
      ? { date: todayKey, seconds: lastBucket.seconds + deltaSeconds, words: lastBucket.words + deltaWords, progressionDelta: (lastBucket.progressionDelta ?? 0) + deltaProgression }
      : { date: todayKey, seconds: deltaSeconds, words: deltaWords, progressionDelta: deltaProgression };

    const updatedDailyHistory = lastBucket && lastBucket.date === todayKey
      ? [...dailyHistory.slice(0, -1), todayBucket]
      : [...dailyHistory, todayBucket];

    dispatch(setDailyReadingHistory(updatedDailyHistory));

    debouncedSave();
  }, [dispatch, debouncedSave]);

  return { notifyLocatorChanged };
};
