"use client";

import { useEffect, useState } from "react";

import { ACCENT_COLOR_STORAGE_KEY, DEFAULT_ACCENT_COLOR } from "./accentColorStorage";
import { isLightColor } from "@/preferences/helpers/themeGeneration";
import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";

// CLAUDE-ADDED: Applies both --th-color-accent and its WCAG-contrast text counterpart to <html> --
// shared by the color picker (StatefulLibraryMenu) so a live edit updates every accent-colored
// element on the page (currently just StatefulBookSheet's play button/progress dial, which read
// these vars directly rather than having their own local --th-color-accent anymore) without a
// reload.
const applyAccentColor = (hex: string) => {
  document.documentElement.style.setProperty("--th-color-accent", hex);
  document.documentElement.style.setProperty("--th-color-accent-text", isLightColor(hex) ? "#101010" : "#fff");
};

// CLAUDE-ADDED: Same pattern as StatefulLibraryMenu's own theme state -- defaults to
// DEFAULT_ACCENT_COLOR on the server render, then the mount effect reads back what the blocking
// init script (layout.tsx) already applied, so this never overwrites it and can't cause a flash.
export const useAccentColor = () => {
  const [accentColor, setAccentColorState] = useState(DEFAULT_ACCENT_COLOR);

  useEffect(() => {
    setAccentColorState(localStorage.getItem(ACCENT_COLOR_STORAGE_KEY) || DEFAULT_ACCENT_COLOR);

    // CLAUDE-ADDED: Same hydrateFromServer pattern the reader settings use. Unlike the localStorage
    // seed above (already applied by layout.tsx's blocking init script before this ever runs), a
    // value that arrives from the server here can genuinely differ, so it has to actually repaint.
    fetchLibraryPrefsFromServer().then((server) => {
      const fromServer = server?.accentColor;
      if (typeof fromServer === "string" && fromServer) {
        setAccentColorState(fromServer);
        localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, fromServer);
        applyAccentColor(fromServer);
      }
    });
  }, []);

  const setAccentColor = (hex: string) => {
    setAccentColorState(hex);
    localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, hex);
    applyAccentColor(hex);
    saveLibraryPrefsToServer({ accentColor: hex });
  };

  return { accentColor, setAccentColor };
};
