// CLAUDE-ADDED: Talks to /api/userdata/settings, the server-side counterpart to store.ts's existing
// localStorage persistence -- localStorage stays the instant synchronous boot path, this becomes the
// authoritative copy once it resolves (see hydrateFromServer in store.ts).

export async function fetchSettingsFromServer(): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("/api/userdata/settings");
    if (!res.ok) return null;
    const { settings } = await res.json();
    return settings ?? null;
  } catch (err) {
    console.error("Failed to load settings from server:", err);
    return null;
  }
}

export function saveSettingsToServer(settings: Record<string, unknown>): void {
  fetch("/api/userdata/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  }).catch(err => console.error("Failed to save settings to server:", err));
}
