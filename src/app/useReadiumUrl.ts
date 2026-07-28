"use client";

import { useEffect, useState } from "react";

// CLAUDE-ADDED: Same reasoning as useBookFolder.ts -- read by server-side code (api/books/route.ts,
// bookIdentity.ts) so it can't live in localStorage alone. Talks to /api/settings/readium-url,
// which persists it next to the book folder in the same config file (see publicationsConfig.ts).
export const useReadiumUrl = () => {
  const [readiumUrl, setReadiumUrlState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/readium-url")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.readiumUrl === "string") setReadiumUrlState(data.readiumUrl);
      })
      .catch((err) => console.error("Failed to load Readium URL:", err));
  }, []);

  const saveReadiumUrl = async (url: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/readium-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiumUrl: url })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save Readium URL");
        return false;
      }

      setReadiumUrlState(data.readiumUrl);
      return true;
    } catch (err) {
      console.error("Failed to save Readium URL:", err);
      setError("Failed to save Readium URL");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { readiumUrl, saveReadiumUrl, isSaving, error };
};
