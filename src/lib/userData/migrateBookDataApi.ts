// CLAUDE-ADDED: Talks to /api/userdata/migrateBookData -- carries one book's progress/annotations/
// reading-time onto a different library entry (see MigrateBookDataDialog). Returns an error message
// on failure so the dialog can show it, rather than the fire-and-forget pattern other *ToServer
// functions here use (this one has a visible result the user is actively waiting on).
export async function migrateBookDataOnServer(sourceManifestUrl: string, destManifestUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/userdata/migrateBookData", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceManifestUrl, destManifestUrl })
    });
    if (res.ok) return null;

    const data = await res.json().catch(() => null);
    return data?.error || "Failed to migrate book data";
  } catch (err) {
    console.error("Failed to migrate book data:", err);
    return "Failed to migrate book data";
  }
}
