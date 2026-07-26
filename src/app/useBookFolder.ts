"use client";

import { useEffect, useState } from "react";

// CLAUDE-ADDED: Unlike the other library preferences here (cover size, accent color, shelves),
// the book folder is read by server-side code (api/books/route.ts, the userData path helpers) so
// it can't live in localStorage alone -- this talks to /api/settings/book-folder instead, which
// persists it next to the rest of the app config (see publicationsConfig.ts).
export const useBookFolder = () => {
  const [bookFolder, setBookFolderState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/book-folder")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.bookFolder === "string") setBookFolderState(data.bookFolder);
      })
      .catch((err) => console.error("Failed to load book folder:", err));
  }, []);

  const saveBookFolder = async (folder: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/book-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookFolder: folder })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save book folder");
        return false;
      }

      setBookFolderState(data.bookFolder);
      return true;
    } catch (err) {
      console.error("Failed to save book folder:", err);
      setError("Failed to save book folder");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { bookFolder, saveBookFolder, isSaving, error };
};
