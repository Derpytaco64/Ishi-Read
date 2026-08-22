"use client";

import { useEffect, useMemo, useRef } from "react";
import debounce from "debounce";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { incrementListeningSeconds, setDailyListeningHistory } from "@/lib/listeningTimeReducer";
import { saveListeningTimeToServer } from "@/lib/userData/listeningTimeApi";
import { saveDailyListeningHistoryToServer } from "@/lib/userData/dailyListeningHistoryApi";
import { DailyListeningBucket } from "@/lib/userData/listeningTimeTypes";

const PERSIST_INTERVAL_MS = 30_000;
const DAILY_HISTORY_PERSIST_DEBOUNCE_MS = 2000;

// CLAUDE-ADDED: Local (not UTC) calendar day -- same convention as useReadingSpeedSampler's own
// getLocalDateKey, so "today" for the weekly-by-type stats graph lines up with the day the user
// actually experiences listening in.
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${ year }-${ month }-${ day }`;
}

// CLAUDE-ADDED: The audiobook counterpart to useReadingTimer -- same tick-once-a-second-and-
// periodically-flush shape, but gated on actual playback (state.player.status === "playing") instead
// of tab visibility: unlike turning pages, audio can legitimately keep playing in a backgrounded tab
// (media session controls), and that time should still count as "listened", while a paused-but-visible
// tab should not. Invoked once, unconditionally, from StatefulPlayer so it runs for as long as the
// audiobook is open regardless of whether the Listening Timer button is visible or collapsed.
export const useListeningTimer = () => {
  const dispatch = useAppDispatch();
  const manifestUrl = useAppSelector(state => state.listeningTime.manifestUrl);
  const isLoaded = useAppSelector(state => state.listeningTime.isLoaded);
  const accumulatedSeconds = useAppSelector(state => state.listeningTime.accumulatedSeconds);
  const startedAt = useAppSelector(state => state.listeningTime.startedAt);
  const playerStatus = useAppSelector(state => state.player.status);
  const dailyListeningHistory = useAppSelector(state => state.listeningTime.dailyListeningHistory);

  // CLAUDE-ADDED: Kept fresh every render (no dependency array) so flush()/tick() -- called from
  // timers set up once per manifestUrl below -- always read the latest values instead of a stale
  // closure, same idiom as useReadingTimer's latestSecondsRef.
  const latestRef = useRef({ accumulatedSeconds, startedAt });
  useEffect(() => {
    latestRef.current = { accumulatedSeconds, startedAt };
  });

  // CLAUDE-ADDED: Same "read at fire time, not schedule time" reasoning as useReadingSpeedSampler's
  // dailyHistoryRef -- a completeListen landing inside the debounce window clears dailyListeningHistory
  // and writes the empty array right away, so this must reflect *current* state when the debounce
  // actually fires or it would resurrect an already-archived day's bucket.
  const dailyHistoryRef = useRef(dailyListeningHistory);
  useEffect(() => {
    dailyHistoryRef.current = dailyListeningHistory;
  });

  const manifestUrlRef = useRef(manifestUrl);
  useEffect(() => {
    manifestUrlRef.current = manifestUrl;
  });

  const debouncedSaveDailyHistory = useMemo(
    () => debounce(() => {
      const url = manifestUrlRef.current;
      if (url) saveDailyListeningHistoryToServer(url, dailyHistoryRef.current);
    }, DAILY_HISTORY_PERSIST_DEBOUNCE_MS),
    []
  );

  const playerStatusRef = useRef(playerStatus);
  useEffect(() => {
    playerStatusRef.current = playerStatus;
  });

  // CLAUDE-ADDED: Wall-clock checkpoint for the "playing" run currently in progress -- null whenever
  // not playing. Backgrounded/unfocused tabs get their setInterval throttled by the browser (firing
  // every several seconds, or only once a minute, instead of every 1000ms), so counting "+1 per tick"
  // silently undercounts listened time the moment the tab loses focus. Measuring the real elapsed time
  // between ticks via Date.now() instead stays correct regardless of how late a given tick fires.
  const lastAccountedAtRef = useRef<number | null>(null);
  const fractionalRemainderRef = useRef(0);

  useEffect(() => {
    if (!manifestUrl || !isLoaded) return;

    const flush = () => {
      saveListeningTimeToServer(manifestUrl, latestRef.current);
    };

    const tick = () => {
      if (playerStatusRef.current !== "playing") {
        lastAccountedAtRef.current = null;
        fractionalRemainderRef.current = 0;
        return;
      }

      const now = Date.now();
      if (lastAccountedAtRef.current === null) {
        lastAccountedAtRef.current = now;
        return;
      }

      const elapsedSeconds = fractionalRemainderRef.current + (now - lastAccountedAtRef.current) / 1000;
      lastAccountedAtRef.current = now;

      const wholeSeconds = Math.floor(elapsedSeconds);
      fractionalRemainderRef.current = elapsedSeconds - wholeSeconds;
      if (wholeSeconds === 0) return;

      dispatch(incrementListeningSeconds(wholeSeconds));

      // CLAUDE-ADDED: Roll wholeSeconds into today's bucket -- extends it if the last bucket is
      // already today's, otherwise starts a fresh one, same shape as useReadingSpeedSampler's own
      // bucket-crediting. progressionDelta stays 0: unlike reading, there's no locator-change hook
      // feeding this timer a progression signal, and per StatefulAudioListeningTimerContainer's own
      // comment the Listening Timer UI deliberately shows no daily/pace breakdown that would need it --
      // this bucket only exists to feed the weekly-by-type stats graph, which only needs seconds.
      const dailyHistory = dailyHistoryRef.current;
      const todayKey = getLocalDateKey(new Date());
      const lastBucket = dailyHistory[dailyHistory.length - 1];

      const todayBucket: DailyListeningBucket = lastBucket && lastBucket.date === todayKey
        ? { date: todayKey, seconds: lastBucket.seconds + wholeSeconds, progressionDelta: lastBucket.progressionDelta ?? 0 }
        : { date: todayKey, seconds: wholeSeconds, progressionDelta: 0 };

      const updatedDailyHistory = lastBucket && lastBucket.date === todayKey
        ? [...dailyHistory.slice(0, -1), todayBucket]
        : [...dailyHistory, todayBucket];

      dispatch(setDailyListeningHistory(updatedDailyHistory));
      debouncedSaveDailyHistory();
    };

    const tickIntervalId = window.setInterval(tick, 1000);
    const persistIntervalId = window.setInterval(flush, PERSIST_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
        debouncedSaveDailyHistory.flush();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(tickIntervalId);
      window.clearInterval(persistIntervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
      debouncedSaveDailyHistory.flush();
    };
  }, [manifestUrl, isLoaded, dispatch, debouncedSaveDailyHistory]);
};
