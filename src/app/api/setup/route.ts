import { NextResponse } from "next/server";

import {
  getPublicationsDir,
  setPublicationsDir,
  getReadiumServerUrl,
  setReadiumServerUrl,
  normalizeReadiumUrl,
  getUserDataDir,
  setUserDataDirOverride,
  isSetupCompleted,
  markSetupCompleted,
  DEFAULT_PUBLICATIONS_DIR,
  DEFAULT_READIUM_SERVER_URL
} from "@/next-lib/userData/publicationsConfig";
import { migrateUserDataDir } from "@/next-lib/userData/migrateUserDataDir";

export const runtime = "nodejs";

// CLAUDE-ADDED: Public and unauthenticated -- there's no admin account to check against yet on a
// genuinely fresh install (that's the whole point of this route). Once setup has completed, both
// GET and POST refuse outright regardless of who's asking -- ongoing changes to these same three
// settings go through their own admin-gated routes (book-folder/readium-url/user-data-folder) in
// the admin panel instead, so this route only ever does anything once, ever, per install.
export async function GET() {
  if (isSetupCompleted()) return NextResponse.json({ error: "Setup already completed" }, { status: 403 });

  return NextResponse.json({
    booksFolder: getPublicationsDir(),
    userDataFolder: getUserDataDir(),
    readiumUrl: getReadiumServerUrl(),
    defaults: { booksFolder: DEFAULT_PUBLICATIONS_DIR, readiumUrl: DEFAULT_READIUM_SERVER_URL }
  });
}

export async function POST(request: Request) {
  if (isSetupCompleted()) return NextResponse.json({ error: "Setup already completed" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const booksFolder = body?.booksFolder;
  // CLAUDE-ADDED: Both optional -- a blank submission just means "use the computed default",
  // exactly like leaving them unset would from a fresh config file.
  const userDataFolder = body?.userDataFolder;
  const readiumUrl = body?.readiumUrl;

  if (typeof booksFolder !== "string" || booksFolder.trim() === "") {
    return NextResponse.json({ error: "A books folder is required" }, { status: 400 });
  }

  setPublicationsDir(booksFolder.trim());

  if (typeof userDataFolder === "string" && userDataFolder.trim() !== "") {
    const trimmed = userDataFolder.trim();
    // CLAUDE-ADDED: getUserDataDir() is read again here (after setPublicationsDir above) since its
    // computed fallback depends on the books folder -- this is "migrate from wherever it currently
    // resolves to" even though on a genuinely fresh install that's almost always an empty/missing
    // directory with nothing to move.
    const { error } = migrateUserDataDir(getUserDataDir(), trimmed);
    if (error) return NextResponse.json({ error }, { status: 400 });
    setUserDataDirOverride(trimmed);
  }

  if (typeof readiumUrl === "string" && readiumUrl.trim() !== "") {
    const { url, error } = normalizeReadiumUrl(readiumUrl);
    if (error) return NextResponse.json({ error }, { status: 400 });
    setReadiumServerUrl(url!);
  }

  markSetupCompleted();

  return NextResponse.json({ ok: true });
}
