import { StoredCompletedReadTime } from "./readingTimeTypes";
import { fetchItemsFromServer, saveItemToServer, deleteItemFromServer } from "./annotationsApiCore";

const ENDPOINT = "completedReadTimes";

export function fetchCompletedReadTimesFromServer(manifestUrl: string): Promise<StoredCompletedReadTime[]> {
  return fetchItemsFromServer<StoredCompletedReadTime>(ENDPOINT, manifestUrl);
}

export function saveCompletedReadTimeToServer(manifestUrl: string, item: StoredCompletedReadTime): void {
  saveItemToServer(ENDPOINT, manifestUrl, item);
}

export function deleteCompletedReadTimeFromServer(manifestUrl: string, id: string): void {
  deleteItemFromServer(ENDPOINT, manifestUrl, id);
}
