import fs from "fs";
import path from "path";

import { getUserDir } from "./paths";

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

export const AVATAR_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

// CLAUDE-ADDED: Avatars come in as data URLs from a plain <input type="file"> read client-side --
// no multipart parsing needed. Any previously-saved avatar (possibly a different extension than
// the new one) is removed first so a user changing PNG -> JPEG doesn't leave the old file behind.
export function saveAvatarFromDataUrl(userId: string, dataUrl: string): string {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");

  const ext = ALLOWED_MIME_TO_EXT[match[1]];
  if (!ext) throw new Error("Unsupported image type -- use PNG, JPEG, WebP, or GIF");

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > MAX_AVATAR_BYTES) throw new Error("Image is too large (max 3MB)");

  const dir = getUserDir(userId);
  fs.mkdirSync(dir, { recursive: true });

  for (const knownExt of Object.values(ALLOWED_MIME_TO_EXT)) {
    const existingPath = path.join(dir, `avatar.${ knownExt }`);
    if (fs.existsSync(existingPath)) fs.unlinkSync(existingPath);
  }

  fs.writeFileSync(path.join(dir, `avatar.${ ext }`), buffer);
  return ext;
}

export function deleteAvatarFile(userId: string, ext: string | null): void {
  if (!ext) return;
  const filePath = getAvatarPath(userId, ext);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function getAvatarPath(userId: string, ext: string): string {
  return path.join(getUserDir(userId), `avatar.${ ext }`);
}
