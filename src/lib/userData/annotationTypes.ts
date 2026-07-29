// CLAUDE-ADDED: Shared shapes for highlights/bookmarks/notes, stored server-side as one JSON array per
// book (see listStore.ts) and mirrored in annotationsReducer.ts. `locator` is always a serialized
// Readium Locator (Locator.serialize()/.deserialize()), same convention as reading position.

// CLAUDE-ADDED: chapterTitle is resolved once at creation time (see resolveChapterTitle.ts) from
// the reading order/TOC, not read off locator.title -- that field is the raw, unresolved title of
// whatever spine resource the navigator happened to report, which can be wrong/generic (e.g. an
// EPUB's own internal title for that XHTML file, unrelated to which chapter it's actually in).
// Optional because annotations created before this field existed have none.

export interface StoredHighlight {
  id: string;
  locator: unknown;
  color: string;
  createdAt: number;
  chapterTitle?: string;
}

export interface StoredBookmark {
  id: string;
  locator: unknown;
  createdAt: number;
  chapterTitle?: string;
}

export interface StoredNote {
  id: string;
  locator: unknown;
  text: string;
  createdAt: number;
  updatedAt: number;
  chapterTitle?: string;
}
