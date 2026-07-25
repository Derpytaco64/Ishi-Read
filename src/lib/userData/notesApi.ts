import { StoredNote } from "./annotationTypes";
import { fetchItemsFromServer, saveItemToServer, deleteItemFromServer } from "./annotationsApiCore";

const ENDPOINT = "notes";

export function fetchNotesFromServer(manifestUrl: string): Promise<StoredNote[]> {
  return fetchItemsFromServer<StoredNote>(ENDPOINT, manifestUrl);
}

export function saveNoteToServer(manifestUrl: string, note: StoredNote): void {
  saveItemToServer(ENDPOINT, manifestUrl, note);
}

export function deleteNoteFromServer(manifestUrl: string, id: string): void {
  deleteItemFromServer(ENDPOINT, manifestUrl, id);
}
