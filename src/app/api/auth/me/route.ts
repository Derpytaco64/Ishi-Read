import { NextResponse } from "next/server";

import { getUserById, toPublicUser } from "@/next-lib/userData/auth";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  const user = userId ? getUserById(userId) : null;

  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({ user: toPublicUser(user) });
}
