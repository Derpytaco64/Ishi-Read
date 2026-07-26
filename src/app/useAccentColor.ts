"use client";

import { useEffect, useState } from "react";

import { ACCENT_COLOR_STORAGE_KEY, DEFAULT_ACCENT_COLOR } from "./accentColorStorage";
import { isLightColor } from "@/preferences/helpers/themeGeneration";

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
  }, []);

  const setAccentColor = (hex: string) => {
    setAccentColorState(hex);
    localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, hex);
    applyAccentColor(hex);
  };

  return { accentColor, setAccentColor };
};
