"use client";

import { useEffect, useState } from "react";

import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";
import { CUSTOM_SHELVES_STORAGE_KEY, CustomShelf, ShelfIcon } from "./customShelves";

// CLAUDE-ADDED: Reconciles a persisted array against the current shape -- drops anything malformed
// (e.g. hand-edited storage, or a future shape change) rather than letting a bad entry crash render.
function sanitizeShelves(stored: unknown): CustomShelf[] {
  if (!Array.isArray(stored)) return [];

  return stored.filter((shelf): shelf is CustomShelf =>
    !!shelf &&
    typeof shelf === "object" &&
    typeof (shelf as CustomShelf).id === "string" &&
    typeof (shelf as CustomShelf).name === "string" &&
    typeof (shelf as CustomShelf).icon === "string" &&
    Array.isArray((shelf as CustomShelf).books)
  );
}

export function useCustomShelves() {
  const [shelves, setShelves] = useState<CustomShelf[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_SHELVES_STORAGE_KEY);
      if (stored) setShelves(sanitizeShelves(JSON.parse(stored)));
    } catch (error) {
      console.error("Error reading custom shelves:", error);
    }
  }, []);

  useEffect(() => {
    fetchLibraryPrefsFromServer().then((server) => {
      if (server?.customShelves) {
        setShelves(sanitizeShelves(server.customShelves));
      }
    });
  }, []);

  const createShelf = (name: string, icon: ShelfIcon) => {
    setShelves((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), name, icon, books: [] }];
      localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ customShelves: next });
      return next;
    });
  };

  const addBookToShelf = (shelfId: string, bookUrl: string) => {
    setShelves((prev) => {
      const next = prev.map((shelf) => {
        if (shelf.id !== shelfId || shelf.books.some((book) => book.url === bookUrl)) return shelf;
        return { ...shelf, books: [...shelf.books, { url: bookUrl, addedAt: Date.now() }] };
      });
      localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ customShelves: next });
      return next;
    });
  };

  const removeBookFromShelf = (shelfId: string, bookUrl: string) => {
    setShelves((prev) => {
      const next = prev.map((shelf) => {
        if (shelf.id !== shelfId) return shelf;
        return { ...shelf, books: shelf.books.filter((book) => book.url !== bookUrl) };
      });
      localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ customShelves: next });
      return next;
    });
  };

  const updateShelf = (shelfId: string, patch: { name?: string; icon?: ShelfIcon }) => {
    setShelves((prev) => {
      const next = prev.map((shelf) => (shelf.id === shelfId ? { ...shelf, ...patch } : shelf));
      localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ customShelves: next });
      return next;
    });
  };

  const deleteShelf = (shelfId: string) => {
    setShelves((prev) => {
      const next = prev.filter((shelf) => shelf.id !== shelfId);
      localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ customShelves: next });
      return next;
    });
  };

  // CLAUDE-ADDED: The shelves array's own order *is* the display order (no separate ShelfKey-style
  // order array needed, since these are user-created objects, not a fixed set of keys) -- the
  // caller just hands back the already-reordered array (see StatefulLibraryMenu's drag-and-drop).
  const reorderShelves = (next: CustomShelf[]) => {
    setShelves(next);
    localStorage.setItem(CUSTOM_SHELVES_STORAGE_KEY, JSON.stringify(next));
    saveLibraryPrefsToServer({ customShelves: next });
  };

  return { shelves, createShelf, addBookToShelf, removeBookFromShelf, updateShelf, deleteShelf, reorderShelves };
}
