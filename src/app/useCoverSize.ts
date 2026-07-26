"use client";

import { useEffect, useState } from "react";

import { COVER_SIZE_STORAGE_KEY, DEFAULT_COVER_SIZE, MIN_COVER_SIZE, MAX_COVER_SIZE } from "./coverSizeStorage";

// CLAUDE-ADDED: Same pattern as useAccentColor.ts -- defaults to DEFAULT_COVER_SIZE on the server
// render (so SSR/first paint always matches, same as every other library-page preference here),
// then the mount effect reads back whatever was actually saved. Unlike accent color (a CSS custom
// property applied straight to <html>, needing a blocking init script to avoid a full-page color
// flash), this only affects PublicationGrid's own columnWidth prop -- the brief reflow if a
// non-default size was saved matches the same accepted tradeoff shelfPrefs.ts's shelf
// order/visibility already makes, so no blocking script here either.
export const useCoverSize = () => {
  const [coverSize, setCoverSizeState] = useState<number>(DEFAULT_COVER_SIZE);

  useEffect(() => {
    const stored = Number(localStorage.getItem(COVER_SIZE_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_COVER_SIZE && stored <= MAX_COVER_SIZE) {
      setCoverSizeState(stored);
    }
  }, []);

  const setCoverSize = (size: number) => {
    setCoverSizeState(size);
    localStorage.setItem(COVER_SIZE_STORAGE_KEY, String(size));
  };

  return { coverSize, setCoverSize };
};
