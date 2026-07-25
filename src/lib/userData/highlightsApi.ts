import { StoredHighlight } from "./annotationTypes";
import { fetchItemsFromServer, saveItemToServer, deleteItemFromServer } from "./annotationsApiCore";

const ENDPOINT = "highlights";

export function fetchHighlightsFromServer(manifestUrl: string): Promise<StoredHighlight[]> {
  return fetchItemsFromServer<StoredHighlight>(ENDPOINT, manifestUrl);
}

export function saveHighlightToServer(manifestUrl: string, highlight: StoredHighlight): void {
  saveItemToServer(ENDPOINT, manifestUrl, highlight);
}

export function deleteHighlightFromServer(manifestUrl: string, id: string): void {
  deleteItemFromServer(ENDPOINT, manifestUrl, id);
}
