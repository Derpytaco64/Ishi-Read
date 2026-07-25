import { readJsonFile, writeJsonFileAtomic } from "./jsonStore";

export interface UserDataListItem {
  id: string;
}

export function readItemList<T extends UserDataListItem>(filePath: string): T[] {
  return readJsonFile<T[]>(filePath) ?? [];
}

// CLAUDE-ADDED: Shared upsert used by the highlights/bookmarks/notes routes -- replaces the item if its
// id already exists (edits), otherwise appends it (new highlight/bookmark/note).
export function upsertItem<T extends UserDataListItem>(filePath: string, item: T): T[] {
  const items = readItemList<T>(filePath);
  const index = items.findIndex(existing => existing.id === item.id);

  if (index === -1) {
    items.push(item);
  } else {
    items[index] = item;
  }

  writeJsonFileAtomic(filePath, items);
  return items;
}

export function removeItem<T extends UserDataListItem>(filePath: string, id: string): T[] {
  const items = readItemList<T>(filePath).filter(item => item.id !== id);
  writeJsonFileAtomic(filePath, items);
  return items;
}
