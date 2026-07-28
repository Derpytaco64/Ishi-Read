import { NextResponse } from "next/server";

import { toPublicUser, updateUser } from "@/next-lib/userData/auth";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Self-service display-name change only -- username changes stay admin-only (see
// /api/admin/users/[id]) to keep "what do other people see" separate from "what do I log in with".
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = body?.name;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const updated = updateUser(userId, { name });
    return NextResponse.json({ user: toPublicUser(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update profile" }, { status: 400 });
  }
}
