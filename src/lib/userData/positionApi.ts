import { Locator } from "@readium/shared";

// CLAUDE-ADDED: Talks to /api/userdata/position, which resolves the manifest URL to a book identity
// (KOSync content hash of the local file when possible) server-side -- the client never needs to know
// the hash itself, just the manifest URL it already has.

export async function fetchPositionFromServer(manifestUrl: string): Promise<Locator | null> {
  try {
    const res = await fetch(`/api/userdata/position?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return null;

    const { locator } = await res.json();
    if (!locator) return null;

    return Locator.deserialize(locator) ?? null;
  } catch (err) {
    console.error("Failed to load reading position from server:", err);
    return null;
  }
}

export function savePositionToServer(manifestUrl: string, locator: Locator): void {
  fetch("/api/userdata/position", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, locator: locator.serialize() }),
  }).catch(err => console.error("Failed to save reading position to server:", err));
}
