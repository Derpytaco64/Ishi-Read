import { getLoginAccentColor, getLoginThemeMode } from "@/next-lib/userData/publicationsConfig";

import AdminPageClient from "./AdminPageClient";

export const runtime = "nodejs";
// CLAUDE-ADDED: See login/page.tsx's comment on the same export -- without this, a production build
// would prerender this page once and keep serving that snapshot's colors forever, making every later
// change from this very page's own color picker look like it silently doesn't persist.
export const dynamic = "force-dynamic";

// CLAUDE-ADDED: Plain server component -- reads the admin-configured accent color and theme mode
// straight off disk so the first paint already has the right colors, same split as /login's page.tsx.
export default function AdminPage() {
  return (
    <AdminPageClient
      initialLoginAccentColor={ getLoginAccentColor() }
      initialThemeMode={ getLoginThemeMode() }
    />
  );
}
