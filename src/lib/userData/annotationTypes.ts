// CLAUDE-ADDED: Shared shapes for highlights/bookmarks/notes, stored server-side as one JSON array per
// book (see listStore.ts) and mirrored in annotationsReducer.ts. `locator` is always a serialized
// Readium Locator (Locator.serialize()/.deserialize()), same convention as reading position.

export interface StoredHighlight {
  id: string;
  locator: unknown;
  color: string;
  createdAt: number;
}

export interface StoredBookmark {
  id: string;
  locator: unknown;
  createdAt: number;
}

export interface StoredNote {
  id: string;
  locator: unknown;
  text: string;
  createdAt: number;
  updatedAt: number;
}
