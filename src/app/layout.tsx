import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThStoreProvider } from "@/lib/ThStoreProvider";
import { ThGlobalPreferencesProvider } from "@/preferences/ThGlobalPreferencesProvider";
import { THEME_STORAGE_KEY } from "./themeStorage";
import { ACCENT_COLOR_STORAGE_KEY, DEFAULT_ACCENT_COLOR } from "./accentColorStorage";

import "./reset.css";

// CLAUDE-ADDED: Runs before first paint (blocking, in <head>) so the library page's saved/system
// dark-mode choice, and the saved/default accent color, are both applied to <html> before any
// content renders, instead of flashing the wrong one and then switching once React hydrates.
// The accent-text (foreground) color needs to be picked the same way useAccentColor.ts's runtime
// updates do -- by the *chosen* color's own WCAG luminance (isLightColor in themeGeneration.ts) --
// but that TS module can't be imported into a plain inline script, so luminance() here is a
// deliberate duplicate of that same formula/threshold. If that threshold ever changes, this needs
// to change with it or the two would disagree about which text color a given accent gets.
const themeInitScript = `
try {
  var stored = localStorage.getItem('${ THEME_STORAGE_KEY }');
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  var accent = localStorage.getItem('${ ACCENT_COLOR_STORAGE_KEY }') || '${ DEFAULT_ACCENT_COLOR }';
  document.documentElement.style.setProperty('--th-color-accent', accent);

  function toLinear(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  var r = toLinear(parseInt(accent.slice(1, 3), 16) / 255);
  var g = toLinear(parseInt(accent.slice(3, 5), 16) / 255);
  var b = toLinear(parseInt(accent.slice(5, 7), 16) / 255);
  var luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  document.documentElement.style.setProperty('--th-color-accent-text', luminance > 0.179 ? '#101010' : '#fff');
} catch (e) {}
`;

export const runtime = "edge";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Thorium Web",
  description: "Play with the capabilities of the Readium Web Toolkit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        { /* CLAUDE-ADDED: dangerouslySetInnerHTML is safe here — themeInitScript is a fixed, module-level string, not user input. */ }
        <script dangerouslySetInnerHTML={ { __html: themeInitScript } } />
      </head>
      <body className={ inter.className }>
        <ThStoreProvider>
          <ThGlobalPreferencesProvider>
            { children }
          </ThGlobalPreferencesProvider>
        </ThStoreProvider>
      </body>
    </html>
  );
}
