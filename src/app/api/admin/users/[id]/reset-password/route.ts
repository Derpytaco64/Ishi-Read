import { NextResponse } from "next/server";

import { adminResetPassword } from "@/next-lib/userData/auth";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const newPassword = body?.newPassword;

  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${ MIN_PASSWORD_LENGTH } characters` }, { status: 400 });
  }

  try {
    adminResetPassword(id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to reset password" }, { status: 400 });
  }
}
