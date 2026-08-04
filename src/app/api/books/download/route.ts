import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";

import { resolveLocalFile } from "@/next-lib/userData/bookIdentity";
import { getCurrentUserId } from "@/next-lib/userData/session";

export const runtime = "nodejs";

// CLAUDE-ADDED: The Go readium server (see scripts/run-with-readium.mjs) only ever serves an
// exploded Readium Web Publication (manifest.json + per-resource routes) -- it has no endpoint
// that returns the original file bytes. The Android client needs the actual .epub/.pdf/.cbz on
// disk so its Readium Kotlin navigator can open a local asset instead of streaming a remote
// manifest resource-by-resource, so this route fills that gap directly from PUBLICATIONS_DIR.
const CONTENT_TYPES: Record<string, string> = {
  ".epub": "application/epub+zip",
  ".pdf": "application/pdf",
  ".cbz": "application/vnd.comicbook+zip",
};

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const manifestUrl = searchParams.get("manifestUrl");

  if (!manifestUrl) {
    return NextResponse.json({ error: "manifestUrl parameter is required" }, { status: 400 });
  }

  const filePath = resolveLocalFile(manifestUrl);
  if (!filePath) {
    return NextResponse.json({ error: "Publication file not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`,
    },
  });
}
