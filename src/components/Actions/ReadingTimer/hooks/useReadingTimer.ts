"use client";

import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { incrementReadingSeconds } from "@/lib/readingTimeReducer";
import { saveReadingTimeToServer } from "@/lib/userData/readingTimeApi";

const PERSIST_INTERVAL_MS = 30_000;

// CLAUDE-ADDED: The engine behind the reading-timer header button -- runs for as long as a book is open
// regardless of whether that button happens to be visible in the bar or collapsed into the "..."
// overflow menu (menu items aren't necessarily mounted while the menu is closed), so it's invoked once,
// unconditionally, from the reader shell rather than from the trigger component itself. Ticks once a
// second while the tab is visible (pauses on backgrounding via the Page Visibility API -- nothing else
// in this codebase used it yet), and only flushes the accumulated total to the server periodically, not
// every second, plus on backgrounding/unmount so nothing is lost when the tab closes.
export const useReadingTimer = () => {
  const dispatch = useAppDispatch();
  const manifestUrl = useAppSelector(state => state.readingTime.manifestUrl);
  const isLoaded = useAppSelector(state => state.readingTime.isLoaded);
  const accumulatedSeconds = useAppSelector(state => state.readingTime.accumulatedSeconds);

  // CLAUDE-ADDED: Kept fresh every render (no dependency array) so flush() -- called from timers/event
  // listeners set up once per manifestUrl below -- always persists the latest total instead of a value
  // captured in a stale closure.
  const latestSecondsRef = useRef(accumulatedSeconds);
  useEffect(() => {
    latestSecondsRef.current = accumulatedSeconds;
  });

  useEffect(() => {
    if (!manifestUrl || !isLoaded) return;

    const flush = () => {
      saveReadingTimeToServer(manifestUrl, latestSecondsRef.current);
    };

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      dispatch(incrementReadingSeconds(1));
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
