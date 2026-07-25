import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { ThStoreProvider } from "@/lib/ThStoreProvider";
import { ThGlobalPreferencesProvider } from "@/preferences/ThGlobalPreferencesProvider";
import { THEME_STORAGE_KEY } from "./themeStorage";

import "./reset.css";

// CLAUDE-ADDED: Runs before first paint (blocking, in <head>) so the library page's saved/system dark-mode choice is applied to <html> before any content renders, instead of flashing light and then switching once React hydrates.
const themeInitScript = `
try {
  var stored = localStorage.getItem('${ THEME_STORAGE_KEY }');
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
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
