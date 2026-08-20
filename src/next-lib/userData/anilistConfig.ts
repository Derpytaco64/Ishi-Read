import { readConfigFile, writeConfigFile } from "./publicationsConfig";
import { encryptSecret, decryptSecret } from "./secretBox";

// CLAUDE-ADDED: One AniList "app" (client_id/client_secret) per self-hosted instance, entered once
// by whoever administers it (anilist.co/settings/developer), shared by every user of that instance
// for the PIN-based OAuth exchange -- not per-user. This is deliberately separate from each user's
// own access token (auth.ts's UserRecord.anilistAccessToken): registering the AniList app is an
// instance-level admin action, connecting an individual AniList account is a per-user action done
// from the account menu. Stored as more keys in the same shallow-merged config.json publicationsConfig.ts
// already uses for other admin settings.
export function getAniListClientId(): string | null {
  const configured = readConfigFile().anilistClientId;
  return typeof configured === "string" && configured.length > 0 ? configured : null;
}

export function setAniListClientId(clientId: string): void {
  writeConfigFile({ anilistClientId: clientId.trim() });
}

// CLAUDE-ADDED: Encrypted at rest via secretBox.ts -- unlike client_id (public, sent in the
// authorize-URL redirect), client_secret is a durable server-side credential that must never leak
// (anyone with it plus a stolen user access token, or the ability to intercept the token exchange,
// could impersonate the whole instance's AniList app).
export function getAniListClientSecret(): string | null {
  const configured = readConfigFile().anilistClientSecretEnc;
  if (typeof configured !== "string") return null;
  return decryptSecret(configured);
}

export function setAniListClientSecret(secret: string): void {
  writeConfigFile({ anilistClientSecretEnc: encryptSecret(secret.trim()) });
}

export function isAniListConfigured(): boolean {
  return getAniListClientId() !== null && getAniListClientSecret() !== null;
}
