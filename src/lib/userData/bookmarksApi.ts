import { StoredBookmark } from "./annotationTypes";
import { fetchItemsFromServer, saveItemToServer, deleteItemFromServer } from "./annotationsApiCore";

const ENDPOINT = "bookmarks";

export function fetchBookmarksFromServer(manifestUrl: string): Promise<StoredBookmark[]> {
  return fetchItemsFromServer<StoredBookmark>(ENDPOINT, manifestUrl);
}

export function saveBookmarkToServer(manifestUrl: string, bookmark: StoredBookmark): void {
  saveItemToServer(ENDPOINT, manifestUrl, bookmark);
}

export function deleteBookmarkFromServer(manifestUrl: string, id: string): void {
  deleteItemFromServer(ENDPOINT, manifestUrl, id);
}
