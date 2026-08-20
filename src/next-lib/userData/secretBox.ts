import fs from "fs";
import path from "path";
import crypto from "crypto";

import { CONFIG_DIR } from "./publicationsConfig";

// CLAUDE-ADDED: At-rest encryption for durable third-party secrets (AniList access tokens, the
// instance's AniList client_secret) -- introduced for AniList sync. Nothing in this codebase
// encrypts anything at rest today (passwordHash is a one-way scrypt hash, not reversible, so it's
// not a precedent for this); a year-long AniList bearer token is a materially different risk than
// a password hash, so it gets its own key rather than reusing/inventing a session-signing secret
// (there isn't one -- sessions are opaque tokens resolved against a file-backed store, see
// session.ts/auth.ts, not signed JWTs).
const KEY_FILE = path.join(CONFIG_DIR, "secret.key");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

// CLAUDE-ADDED: Generated once, on first use, and persisted as a 0600 file -- deliberately not a
// new required env var, so existing self-hosted installs don't need any manual step to pick this
// feature up. Uses exclusive create (`wx`) and falls back to reading the file on EEXIST rather than
// trusting its own freshly-generated buffer, so two module instances racing to create it on a fresh
// install (same root cause as publicationsConfig.ts's cross-module-graph cache note) can't each
// write a different key -- the first writer wins and everyone else reads it back.
function getOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;

  try {
    cachedKey = fs.readFileSync(KEY_FILE);
    return cachedKey;
  } catch {
    // fall through to generate
  }

  const generated = crypto.randomBytes(32);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  try {
    fs.writeFileSync(KEY_FILE, generated, { flag: "wx", mode: 0o600 });
    cachedKey = generated;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      cachedKey = fs.readFileSync(KEY_FILE);
    } else {
      throw err;
    }
  }
  return cachedKey;
}

// CLAUDE-ADDED: "v1:<iv>:<authTag>:<ciphertext>", all base64 -- versioned so a future algorithm
// change has somewhere to branch from without guessing the format of old values.
export function encryptSecret(plaintext: string): string {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

// CLAUDE-ADDED: Returns null rather than throwing on any failure (corrupt value, wrong key after a
// manual key-file replacement, etc.) -- callers treat a null decrypt the same as "no token stored",
// which for an AniList link just means the user needs to reconnect, not a hard server error.
export function decryptSecret(blob: string): string | null {
  try {
    const [version, ivB64, authTagB64, ciphertextB64] = blob.split(":");
    if (version !== "v1" || !ivB64 || !authTagB64 || !ciphertextB64) return null;

    const key = getOrCreateKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf-8");
  } catch {
    return null;
  }
}
