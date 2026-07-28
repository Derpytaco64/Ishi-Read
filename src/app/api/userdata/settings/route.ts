import { NextResponse } from "next/server";

import { getSettingsFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = readJsonFile(getSettingsFilePath(userId));
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await request.json().catch(() => null);

  if (!settings || typeof settings !== "object") {
    return NextResponse.json({ error: "A JSON settings object is required" }, { status: 400 });
  }

  writeJsonFileAtomic(getSettingsFilePath(userId), settings);

  return NextResponse.json({ ok: true });
}
