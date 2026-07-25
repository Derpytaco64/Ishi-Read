import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { CURRENT_USER_ID, ensureUsersRegistry, getBookmarksFilePath } from "@/next-lib/userData/paths";
import { readItemList, upsertItem, removeItem } from "@/next-lib/userData/listStore";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const items = readItemList(getBookmarksFilePath(CURRENT_USER_ID, hash));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const item = body?.item;

  if (typeof manifestUrl !== "string" || !manifestUrl || !item?.id) {
    return NextResponse.json({ error: "manifestUrl and item (with an id) are required" }, { status: 400 });
  }

  ensureUsersRegistry();
  const hash = resolveBookIdentity(manifestUrl);
  upsertItem(getBookmarksFilePath(CURRENT_USER_ID, hash), item);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");
  const id = searchParams.get("id");

  if (!manifestUrl || !id) {
    return NextResponse.json({ error: "manifestUrl and id parameters are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  removeItem(getBookmarksFilePath(CURRENT_USER_ID, hash), id);

  return NextResponse.json({ ok: true });
}
