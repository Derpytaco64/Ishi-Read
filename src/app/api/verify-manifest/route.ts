import { NextResponse } from "next/server";
import { verifyManifestUrlFromEnv } from "@/next-lib/helpers/verifyManifest";
import { getReadiumServerUrl } from "@/next-lib/userData/publicationsConfig";

// CLAUDE-ADDED: Was "edge" -- switched to nodejs so this can read the admin-configured Readium URL
// off disk (fs-backed, see publicationsConfig.ts), same runtime as every other API route in this app.
export const runtime = "nodejs";

// CLAUDE-ADDED: MANIFEST_ALLOWED_DOMAINS (see .env) is baked in at build time from upstream's own
// demo domains -- on this fork the actual Readium server is admin-configurable at runtime from the
// Settings panel (getReadiumServerUrl), so always trust whatever that's *currently* set to as well.
// Without this, changing the Readium URL from the admin panel would silently 403 every book again
// until the next full image rebuild.
function isConfiguredReadiumHost(manifestUrl: string): boolean {
  try {
    return new URL(manifestUrl).hostname === new URL(getReadiumServerUrl()).hostname;
  } catch {
    return false;
  }
}

// This function runs on the server
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("url");

  if (!manifestUrl) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 }
    );
  }

  if (isConfiguredReadiumHost(manifestUrl)) {
    return NextResponse.json({ allowed: true, url: manifestUrl });
  }

  const result = verifyManifestUrlFromEnv(manifestUrl);

  if (!result.allowed) {
    return NextResponse.json(
      { error: result.error || "Domain not allowed" },
      { status: result.error === "Invalid URL" ? 400 : 403 }
    );
  }

  return NextResponse.json({
    allowed: true,
    url: result.url
  });
}
