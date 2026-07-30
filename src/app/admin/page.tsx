import { getLoginAccentColor, getLoginThemeMode } from "@/next-lib/userData/publicationsConfig";

import AdminPageClient from "./AdminPageClient";

export const runtime = "nodejs";

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
