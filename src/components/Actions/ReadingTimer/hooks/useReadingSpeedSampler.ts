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
// accumulatedSeconds -- so a backgrounded tab never inflates a sample's elapsed time).
//
// Two separate ledgers come out of this: the rolling wpm buffer (speedSamples, feeds the live pace
// estimate) and today's daily bucket (feeds the daily-history view). Only "organic forward reading"
// intervals count toward the *former* -- backward navigation (deltaProgression <= 0), a jump bigger
// than JUMP_DISCARD_THRESHOLD of the whole book in one step (TOC click, search result, "go to
// position" -- not a page turn), or a rate above RAPID_TURN_WPM_CEILING (mashing next-page/flipping
// through rather than reading) all get excluded from it, since folding those in would corrupt the wpm
// estimate. What's left is genuinely noisy page-turn-to-page-turn data, which is exactly what
// computeCurrentWpm's median/MAD trimming is for.
//
// The *latter* (elapsed seconds) is credited to today's bucket regardless of any of the above -- a
// backward flip, a TOC jump, or a burst of rapid page-turning is still real time spent with the book
// open, and useReadingTimer's own accumulatedSeconds total counts it unconditionally too (see that
// hook). Excluding it here would silently leave the daily-history sum short of the lifetime total by
// however much reading happens to involve navigation rather than straight-through page turns.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Locator } from "@readium/shared";
import debounce from "debounce";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addSpeedSample, setCurrentProgression, setDailyReadingHistory } from "@/lib/readingTimeReducer";
import { saveGlobalReadingSpeedSamplesToServer } from "@/lib/userData/readingSpeedApi";
import { saveDailyReadingHistoryToServer } from "@/lib/userData/dailyReadingHistoryApi";
import { ReadingSpeedSample, DailyReadingBucket } from "@/lib/userData/readingTimeTypes";

const JUMP_DISCARD_THRESHOLD = 0.05;
const PERSIST_DEBOUNCE_MS = 2000;

// CLAUDE-ADDED: No human being reads this fast -- a sample above this rate is a rapid page-turn
// (mashing next-page, flipping through to find a spot) rather than a genuine read, and gets
// hard-discarded the same way a too-big jump or backward navigation does. Deliberately well above
// even a fast reader's real pace (unlike the stats route's own PLAUSIBLE_WPM_CEILING of 1000, which
// filters already-smoothed *daily* aggregates) -- this runs per individual page-turn sample, where a
// short/sparse page can honestly spike a genuine reader's instantaneous rate well past 1000 for one
// sample. It only needs to be low enough to catch the multiple-thousands-of-wpm rate flipping
// several pages in a couple of seconds actually produces.
const RAPID_TURN_WPM_CEILING = 2500;

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
  // at *fire* time instead of closing over the arrays computed when the save was scheduled: for
  // dailyHistory specifically, a save-and-reset (or discard-reset) can land inside this debounce's
  // window, synchronously clearing dailyReadingHistory and writing the empty array to the server right
  // away (see completeReadingTimer/resetReadingTimer) -- if this callback still saved the pre-reset
  // array it scheduled with, it would fire after that clear and silently resurrect the just-archived
  // day's bucket into the new "current" period. Reading the refs at fire time means this always persists
  // whatever is true *now*, so it's either a no-op (state hasn't changed since scheduling) or correctly
  // re-saves the post-reset state. speedSamples has no such reset path (it's global, see
  // readingTimeReducer.ts) but reads its ref at fire time too, for consistency.
  const debouncedSave = useMemo(
    () => debounce(() => {
      // CLAUDE-ADDED: The speed-sample buffer is global (not per-book, see readingTimeReducer.ts), so
      // it saves regardless of manifestUrl -- only the daily-history save still needs one.
      saveGlobalReadingSpeedSamplesToServer(samplesRef.current);

      const url = manifestUrlRef.current;
      if (url) saveDailyReadingHistoryToServer(url, dailyHistoryRef.current);
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

    if (!manifestUrl || lastProgression === null || lastAccumulatedSeconds === null) return;

    const deltaProgression = totalProgression - lastProgression;
    const deltaSeconds = accumulatedSeconds - lastAccumulatedSeconds;

    // CLAUDE-ADDED: Zero/negative elapsed active time means there's genuinely nothing to credit to
    // either ledger (e.g. two locator events in the same tick) -- everything below this assumes
    // deltaSeconds > 0.
    if (deltaSeconds <= 0) return;

    // CLAUDE-ADDED: Whether this interval qualifies as an organic-forward-reading sample for the wpm
    // ledger -- see the file-header comment for why backward nav, big jumps, and a null wordCount (word
    // count scan still running) all disqualify it there without disqualifying the seconds credit below.
    let deltaWords = 0;
    let acceptedSample = false;

    if (wordCount !== null && deltaProgression > 0 && deltaProgression <= JUMP_DISCARD_THRESHOLD) {
      const candidateWords = deltaProgression * wordCount;
      // CLAUDE-ADDED: Rapid-page-turn discard -- see RAPID_TURN_WPM_CEILING above. Anchors were
      // already re-seeded above, so a burst of fast turns just collapses into however much real time
      // and progression separates the *next* accepted sample from here, instead of poisoning the
      // buffer with one wildly-fast reading.
      const impliedWpm = candidateWords / (deltaSeconds / 60);
      if (impliedWpm <= RAPID_TURN_WPM_CEILING) {
        deltaWords = candidateWords;
        acceptedSample = true;
      }
    }

    if (acceptedSample) {
      const sample: ReadingSpeedSample = { deltaWords, deltaSeconds, timestamp: Date.now() };
      dispatch(addSpeedSample(sample));
    }

    // CLAUDE-ADDED: Roll deltaSeconds into today's bucket unconditionally (see file-header comment) --
    // extends it if the last bucket is already today's, otherwise starts a fresh one (a new calendar
    // day, or the very first bucket for this open period). deltaWords/progressionDelta only advance for
    // an accepted sample (deltaWords is already 0 otherwise); an unaccepted interval still contributes
    // its seconds so the bucket's own wpm stays honest rather than being inflated by uncredited words.
    const dailyHistory = dailyHistoryRef.current;
    const todayKey = getLocalDateKey(new Date());
    const lastBucket = dailyHistory[dailyHistory.length - 1];

    // CLAUDE-ADDED: `?? 0` guards against extending a bucket loaded from before progressionDelta
    // existed (it used to be called progressionAtEnd, a cumulative snapshot, not a per-day delta) --
    // without it, `undefined + deltaProgression` is NaN, which JSON.stringify silently turns into
    // `null` on disk and renders as "NaN%" forever after.
    const todayBucket: DailyReadingBucket = lastBucket && lastBucket.date === todayKey
      ? { date: todayKey, seconds: lastBucket.seconds + deltaSeconds, words: lastBucket.words + deltaWords, progressionDelta: (lastBucket.progressionDelta ?? 0) + (acceptedSample ? deltaProgression : 0) }
      : { date: todayKey, seconds: deltaSeconds, words: deltaWords, progressionDelta: acceptedSample ? deltaProgression : 0 };

    const updatedDailyHistory = lastBucket && lastBucket.date === todayKey
      ? [...dailyHistory.slice(0, -1), todayBucket]
      : [...dailyHistory, todayBucket];

    dispatch(setDailyReadingHistory(updatedDailyHistory));

    debouncedSave();
  }, [dispatch, debouncedSave]);

  return { notifyLocatorChanged };
};
