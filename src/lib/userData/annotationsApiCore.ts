// CLAUDE-ADDED: Generic fetch/upsert/delete used by highlightsApi.ts/bookmarksApi.ts/notesApi.ts --
// same request/response contract for all three (see the matching route.ts files), only the endpoint
// differs, so the actual HTTP logic lives here once.

export async function fetchItemsFromServer<T>(endpoint: string, manifestUrl: string): Promise<T[]> {
  try {
    const res = await fetch(`/api/userdata/${ endpoint }?manifestUrl=${ encodeURIComponent(manifestUrl) }`);
    if (!res.ok) return [];

    const { items } = await res.json();
    return Array.isArray(items) ? items : [];
  } catch (err) {
    console.error(`Failed to load ${ endpoint } from server:`, err);
    return [];
  }
}

export function saveItemToServer<T>(endpoint: string, manifestUrl: string, item: T): void {
  fetch(`/api/userdata/${ endpoint }`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifestUrl, item }),
  }).catch(err => console.error(`Failed to save ${ endpoint } item to server:`, err));
}

export function deleteItemFromServer(endpoint: string, manifestUrl: string, id: string): void {
  fetch(`/api/userdata/${ endpoint }?manifestUrl=${ encodeURIComponent(manifestUrl) }&id=${ encodeURIComponent(id) }`, {
    method: "DELETE",
  }).catch(err => console.error(`Failed to delete ${ endpoint } item on server:`, err));
}
