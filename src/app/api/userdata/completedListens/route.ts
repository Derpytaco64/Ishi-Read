import { NextResponse } from "next/server";

import { resolveBookIdentity } from "@/next-lib/userData/bookIdentity";
import { getCompletedListensFilePath } from "@/next-lib/userData/paths";
import { readItemList, upsertItem, removeItem } from "@/next-lib/userData/listStore";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  const items = readItemList(getCompletedListensFilePath(userId, hash));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const manifestUrl = body?.manifestUrl;
  const item = body?.item;

  if (typeof manifestUrl !== "string" || !manifestUrl || !item?.id) {
    return NextResponse.json({ error: "manifestUrl and item (with an id) are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  upsertItem(getCompletedListensFilePath(userId, hash), item);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");
  const id = searchParams.get("id");

  if (!manifestUrl || !id) {
    return NextResponse.json({ error: "manifestUrl and id parameters are required" }, { status: 400 });
  }

  const hash = resolveBookIdentity(manifestUrl);
  removeItem(getCompletedListensFilePath(userId, hash), id);

  return NextResponse.json({ ok: true });
}
