"use client";

import { useEffect, useState } from "react";

import { COVER_SIZE_STORAGE_KEY, DEFAULT_COVER_SIZE, MIN_COVER_SIZE, MAX_COVER_SIZE } from "./coverSizeStorage";

// CLAUDE-ADDED: Deliberately localStorage-only, unlike the other library-page preferences in this
// directory -- cover size is a per-screen display choice (a phone and a desktop monitor want
// different values), so syncing it through library-prefs made it flip-flop between devices on
// every load instead of following the user. Defaults to DEFAULT_COVER_SIZE on the server render so
// SSR/first paint always matches, then the mount effect reads back whatever this device has saved.
export const useCoverSize = () => {
  const [coverSize, setCoverSizeState] = useState<number>(DEFAULT_COVER_SIZE);

  useEffect(() => {
    const stored = Number(localStorage.getItem(COVER_SIZE_STORAGE_KEY));
    const storedValid = Number.isFinite(stored) && stored >= MIN_COVER_SIZE && stored <= MAX_COVER_SIZE;
    if (storedValid) {
      setCoverSizeState(stored);
    }
  }, []);

  const setCoverSize = (size: number) => {
    setCoverSizeState(size);
    localStorage.setItem(COVER_SIZE_STORAGE_KEY, String(size));
  };

  return { coverSize, setCoverSize };
};
