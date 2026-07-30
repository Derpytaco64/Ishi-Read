import { NextResponse } from "next/server";

import { deleteUser, updateUser } from "@/next-lib/userData/auth";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

function stripSecrets<T extends { passwordHash: unknown; passwordSalt: unknown }>(user: T) {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...rest } = user;
  return rest;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const patch: { username?: string; name?: string; isAdmin?: boolean; disabled?: boolean } = {};

  if (body?.username !== undefined) {
    if (typeof body.username !== "string" || !USERNAME_PATTERN.test(body.username.trim())) {
      return NextResponse.json({ error: "Username must be 3-32 characters (letters, numbers, _ . -)" }, { status: 400 });
    }
    patch.username = body.username;
  }
  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    }
    patch.name = body.name;
  }
  if (body?.isAdmin !== undefined) {
    if (typeof body.isAdmin !== "boolean") {
      return NextResponse.json({ error: "isAdmin must be a boolean" }, { status: 400 });
    }
    // CLAUDE-ADDED: Don't let an admin strip their own admin flag -- updateUser's "last admin"
    // guard only protects against there being zero admins left, not against the acting admin
    // locking themselves out of the panel they're currently using while other admins remain.
    if (id === admin.id && !body.isAdmin) {
      return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 400 });
    }
    patch.isAdmin = body.isAdmin;
  }
  if (body?.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") {
      return NextResponse.json({ error: "disabled must be a boolean" }, { status: 400 });
    }
    // CLAUDE-ADDED: Same reasoning as the self-remove-admin guard above -- updateUser's last-admin
    // guard only stops the count reaching zero, not an admin locking themselves out of the panel
    // they're currently using while other admins remain.
    if (id === admin.id && body.disabled) {
      return NextResponse.json({ error: "You can't disable your own account" }, { status: 400 });
    }
    patch.disabled = body.disabled;
  }

  try {
    const updated = updateUser(id, patch);
    return NextResponse.json({ user: stripSecrets(updated) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update user" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  try {
    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete user" }, { status: 400 });
  }
}
