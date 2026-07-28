import { NextResponse } from "next/server";

import { unlockUser } from "@/next-lib/userData/auth";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    unlockUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to unlock user" }, { status: 400 });
  }
}
