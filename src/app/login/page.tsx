import { getLoginAccentColor, getLoginAccentTextColor, getLoginThemeMode } from "@/next-lib/userData/publicationsConfig";

import LoginPageClient from "./LoginPageClient";

export const runtime = "nodejs";

// CLAUDE-ADDED: Plain server component -- reads the admin-configured accent color and theme mode
// straight off disk and hands them down as props, so the very first HTML sent already has the
// right colors (no client fetch, no flash of the default blue/light before a useEffect resolves).
export default function LoginPage() {
  return (
    <LoginPageClient
      accentColor={ getLoginAccentColor() }
      accentTextColor={ getLoginAccentTextColor() }
      themeMode={ getLoginThemeMode() }
    />
  );
}
