import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { CURRENT_USER_ID, ensureUsersRegistry, getPositionFilePath } from "@/next-lib/userData/paths";
import { readJsonFile, writeJsonFileAtomic } from "@/next-lib/userData/jsonStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const locator = readJsonFile(getPositionFilePath(CURRENT_USER_ID, hash));

  return NextResponse.json({ locator });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const locator = body?.locator;

  if (typeof manifestUrl !== "string" || !manifestUrl || !locator) {
    return NextResponse.json({ error: "manifestUrl and locator are required" }, { status: 400 });
  }

  ensureUsersRegistry();
  const hash = resolveBookIdentity(manifestUrl);
  writeJsonFileAtomic(getPositionFilePath(CURRENT_USER_ID, hash), locator);

  return NextResponse.json({ ok: true });
}
