"use client";

import { useEffect, useState } from "react";

// CLAUDE-ADDED: Same reasoning/shape as useReadiumUrl.ts -- read by server-side code
// (scripts/run-with-readium.mjs, via its own duplicated config-file read) so it can't live in
// localStorage alone. Talks to /api/settings/readium-port, which persists it next to the book
// folder/Readium URL in the same config file (see publicationsConfig.ts). The value round-trips as
// a string (matching the text input it feeds) even though it's stored as a number server-side.
export const useReadiumPort = () => {
  const [readiumPort, setReadiumPortState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/readium-port")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.readiumPort === "number") setReadiumPortState(String(data.readiumPort));
      })
      .catch((err) => console.error("Failed to load Readium port:", err));
  }, []);

  const saveReadiumPort = async (port: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/readium-port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiumPort: port })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save Readium port");
        return false;
      }

      setReadiumPortState(String(data.readiumPort));
      return true;
    } catch (err) {
      console.error("Failed to save Readium port:", err);
      setError("Failed to save Readium port");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { readiumPort, saveReadiumPort, isSaving, error };
};
