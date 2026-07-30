import { getLoginAccentColor, getLoginAccentTextColor, getLoginThemeMode } from "@/next-lib/userData/publicationsConfig";

import LoginPageClient from "./LoginPageClient";

export const runtime = "nodejs";
// CLAUDE-ADDED: Without this, `next build` sees no dynamic API usage in this page (getLoginAccentColor
// etc. are plain fs reads, which don't count) and prerenders it once at build time -- every later
// change to the admin-configured color/theme via the Settings panel would keep getting silently
// served the build-time snapshot forever after (`pnpm build` + `pnpm start` in prod, unlike `next dev`
// which always renders fresh and so never surfaced this).
export const dynamic = "force-dynamic";

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
