import { NextResponse } from "next/server";

import { getUserDataDir, setUserDataDirOverride } from "@/next-lib/userData/publicationsConfig";
import { migrateUserDataDir } from "@/next-lib/userData/migrateUserDataDir";
import { getCurrentUser } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: Admin-only -- same reasoning as book-folder. This one's especially sensitive since
// it relocates (moves, not copies) every user's data on disk.
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ userDataFolder: getUserDataDir() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userDataFolder = body?.userDataFolder;

  if (typeof userDataFolder !== "string" || userDataFolder.trim() === "") {
    return NextResponse.json({ error: "A folder path is required" }, { status: 400 });
  }

  const trimmed = userDataFolder.trim();
  const currentDir = getUserDataDir();

  // CLAUDE-ADDED: Migrate existing data into the new location *before* persisting the config
  // change below -- if this fails, the app keeps pointing at the old (still-intact) folder
  // instead of ending up configured to look somewhere that doesn't actually have the data.
  const { error } = migrateUserDataDir(currentDir, trimmed);
  if (error) return NextResponse.json({ error }, { status: 400 });

  setUserDataDirOverride(trimmed);

  return NextResponse.json({ userDataFolder: trimmed });
}
