import { redirect } from "next/navigation";

import {
  isSetupCompleted,
  getPublicationsDir,
  getReadiumServerUrl,
  getLoginAccentColor,
  getLoginAccentTextColor,
  getLoginThemeMode
} from "@/next-lib/userData/publicationsConfig";

import SetupPageClient from "./SetupPageClient";

export const runtime = "nodejs";

// CLAUDE-ADDED: proxy.ts already redirects everything else to /setup while it isn't completed, but
// this page can still be reached directly (e.g. a stale bookmark) after setup finishes -- redirect
// away rather than showing the wizard again.
export default function SetupPage() {
  if (isSetupCompleted()) redirect("/login");

  return (
    <SetupPageClient
      accentColor={ getLoginAccentColor() }
      accentTextColor={ getLoginAccentTextColor() }
      themeMode={ getLoginThemeMode() }
      booksFolderDefault={ getPublicationsDir() }
      readiumUrlDefault={ getReadiumServerUrl() }
    />
  );
}
