"use client";

import { useEffect, useState } from "react";

import { COVER_SIZE_STORAGE_KEY, DEFAULT_COVER_SIZE, MIN_COVER_SIZE, MAX_COVER_SIZE } from "./coverSizeStorage";
import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";

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
    const storedValid = Number.isFinite(stored) && stored >= MIN_COVER_SIZE && stored <= MAX_COVER_SIZE;
    if (storedValid) {
      setCoverSizeState(stored);
    }

    // CLAUDE-ADDED: Same hydrateFromServer pattern the reader settings use -- the server copy
    // becomes authoritative shortly after mount so this preference follows across devices/reinstalls.
    fetchLibraryPrefsFromServer().then((server) => {
      const fromServer = Number(server?.coverSize);
      if (Number.isFinite(fromServer) && fromServer >= MIN_COVER_SIZE && fromServer <= MAX_COVER_SIZE) {
        setCoverSizeState(fromServer);
        localStorage.setItem(COVER_SIZE_STORAGE_KEY, String(fromServer));
      } else if (storedValid) {
        // CLAUDE-ADDED: The server has never been told this value -- e.g. it was set back when this
        // was localStorage-only, before library-prefs synced to the server at all. Seed it now so a
        // later cleared-storage load has something real to restore instead of falling back to
        // DEFAULT_COVER_SIZE.
        saveLibraryPrefsToServer({ coverSize: stored });
      }
    });
  }, []);

  const setCoverSize = (size: number) => {
    setCoverSizeState(size);
    localStorage.setItem(COVER_SIZE_STORAGE_KEY, String(size));
    saveLibraryPrefsToServer({ coverSize: size });
  };

  return { coverSize, setCoverSize };
};
