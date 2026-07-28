import { getLoginAccentColor, getLoginAccentTextColor } from "@/next-lib/userData/publicationsConfig";

import LoginPageClient from "./LoginPageClient";

export const runtime = "nodejs";

// CLAUDE-ADDED: Plain server component -- reads the admin-configured accent color straight off
// disk and hands it down as props, so the very first HTML sent already has the right colors (no
// client fetch, no flash of the default blue before a useEffect resolves).
export default function LoginPage() {
  return <LoginPageClient accentColor={ getLoginAccentColor() } accentTextColor={ getLoginAccentTextColor() } />;
}
