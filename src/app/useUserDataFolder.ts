"use client";

import { useEffect, useState } from "react";

// CLAUDE-ADDED: Same reasoning as useBookFolder.ts/useReadiumUrl.ts -- read by server-side code
// (the userData path helpers) so it can't live in localStorage alone. Talks to
// /api/settings/user-data-folder, which persists it next to the book folder in the same config
// file (see publicationsConfig.ts) and migrates any existing data into the new location.
export const useUserDataFolder = () => {
  const [userDataFolder, setUserDataFolderState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/user-data-folder")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.userDataFolder === "string") setUserDataFolderState(data.userDataFolder);
      })
      .catch((err) => console.error("Failed to load user data folder:", err));
  }, []);

  const saveUserDataFolder = async (folder: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/user-data-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userDataFolder: folder })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save user data folder");
        return false;
      }

      setUserDataFolderState(data.userDataFolder);
      return true;
    } catch (err) {
      console.error("Failed to save user data folder:", err);
      setError("Failed to save user data folder");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { userDataFolder, saveUserDataFolder, isSaving, error };
};
