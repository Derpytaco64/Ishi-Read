// CLAUDE-ADDED: Talks to /api/userdata/pageCount. Unlike wordCountApi.ts's fetch (which only ever
// reads a value some other client-side computation already pushed), this GET is the computation
// trigger itself -- the route computes-and-caches on a miss, so simply calling this is what makes a
// book's page count exist, without needing the reader ever opened.

export async function fetchPageCountFromServer(manifestUrl: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/userdata/pageCount?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return null;

    const { pageCount } = await res.json();
    return typeof pageCount === "number" ? pageCount : null;
  } catch (err) {
    console.error("Failed to load page count from server:", err);
    return null;
  }
}
