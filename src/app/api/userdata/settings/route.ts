import { NextResponse } from "next/server";

import { CURRENT_USER_ID, ensureUsersRegistry, getSettingsFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";

export const runtime = "nodejs";

export async function GET() {
  const settings = readJsonFile(getSettingsFilePath(CURRENT_USER_ID));
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const settings = await request.json().catch(() => null);

  if (!settings || typeof settings !== "object") {
    return NextResponse.json({ error: "A JSON settings object is required" }, { status: 400 });
  }

  ensureUsersRegistry();
  writeJsonFileAtomic(getSettingsFilePath(CURRENT_USER_ID), settings);

  return NextResponse.json({ ok: true });
}
