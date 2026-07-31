import { StoredCompletedListen } from "./listeningTimeTypes";
import { fetchItemsFromServer, saveItemToServer, deleteItemFromServer } from "./annotationsApiCore";

const ENDPOINT = "completedListens";

export function fetchCompletedListensFromServer(manifestUrl: string): Promise<StoredCompletedListen[]> {
  return fetchItemsFromServer<StoredCompletedListen>(ENDPOINT, manifestUrl);
}

export function saveCompletedListenToServer(manifestUrl: string, item: StoredCompletedListen): void {
  saveItemToServer(ENDPOINT, manifestUrl, item);
}

export function deleteCompletedListenFromServer(manifestUrl: string, id: string): void {
  deleteItemFromServer(ENDPOINT, manifestUrl, id);
}
