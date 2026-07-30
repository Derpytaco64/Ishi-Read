import { NextResponse } from "next/server";

import { getLoginThemeMode, setLoginThemeMode, type LoginThemeMode } from "@/next-lib/userData/publicationsConfig";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Same public-GET/admin-only-POST split as ../login-accent-color/route.ts -- /login
// needs to read this before any session exists, and it's no more sensitive than the accent color.
export async function GET() {
  return NextResponse.json({ loginThemeMode: getLoginThemeMode() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const loginThemeMode = body?.loginThemeMode as LoginThemeMode;

  if (loginThemeMode !== "light" && loginThemeMode !== "dark") {
    return NextResponse.json({ error: "loginThemeMode must be \"light\" or \"dark\"" }, { status: 400 });
  }

  setLoginThemeMode(loginThemeMode);
  return NextResponse.json({ loginThemeMode });
}
