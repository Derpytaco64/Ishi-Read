// CLAUDE-ADDED: Talks to /api/userdata/wordCount -- same single-value-per-book pattern as
// readingTimeApi.ts. Computed once client-side (see useBookWordCount) and cached here forever,
// since a book's word count never changes.

export async function fetchWordCountFromServer(manifestUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/userdata/wordCount?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return null;

    const { wordCount } = await res.json();
    return typeof wordCount === "number" ? wordCount : null;
  } catch (err) {
    console.error("Failed to load word count from server:", err);
    return null;
  }
}

export function saveWordCountToServer(manifestUrl: string, wordCount: number): void {
  fetch("/api/userdata/wordCount", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, wordCount })
  }).catch(err => console.error("Failed to save word count to server:", err));
}
