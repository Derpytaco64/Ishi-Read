import { getLoginAccentColor } from "@/next-lib/userData/publicationsConfig";

import AdminPageClient from "./AdminPageClient";

export const runtime = "nodejs";

// CLAUDE-ADDED: Plain server component -- reads the admin-configured accent color straight off
// disk so the first paint already has the right color, same split as /login's page.tsx.
export default function AdminPage() {
  return <AdminPageClient initialLoginAccentColor={ getLoginAccentColor() } />;
}
