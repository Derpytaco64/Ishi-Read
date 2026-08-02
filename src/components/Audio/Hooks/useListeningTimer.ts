"use client";

import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { incrementListeningSeconds } from "@/lib/listeningTimeReducer";
import { saveListeningTimeToServer } from "@/lib/userData/listeningTimeApi";

const PERSIST_INTERVAL_MS = 30_000;

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

  // CLAUDE-ADDED: Kept fresh every render (no dependency array) so flush()/tick() -- called from
  // timers set up once per manifestUrl below -- always read the latest values instead of a stale
  // closure, same idiom as useReadingTimer's latestSecondsRef.
  const latestRef = useRef({ accumulatedSeconds, startedAt });
  useEffect(() => {
    latestRef.current = { accumulatedSeconds, startedAt };
  });

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
      if (wholeSeconds > 0) dispatch(incrementListeningSeconds(wholeSeconds));
    };

    const tickIntervalId = window.setInterval(tick, 1000);
    const persistIntervalId = window.setInterval(flush, PERSIST_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);

    return () => {
      window.clearInterval(tickIntervalId);
      window.clearInterval(persistIntervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [manifestUrl, isLoaded, dispatch]);
};
