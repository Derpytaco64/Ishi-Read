"use client";

import { useEffect, useState } from "react";

// CLAUDE-ADDED: Same shape as useReadiumUrl.ts, talking to /api/settings/anilist -- the instance-
// wide AniList app registration (client_id/client_secret) admins enter once from anilist.co's
// developer settings, shared by every user's per-account PIN-flow connect. The stored secret is
// never returned by the GET -- clientSecretSet just tells the UI whether one exists, same as a
// password field always rendering blank. Saving with an empty clientSecret field leaves the
// existing stored secret untouched (see the route's own comment).
export const useAniListSettings = () => {
  const [clientId, setClientIdState] = useState<string>("");
  const [clientSecretSet, setClientSecretSet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/anilist")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.clientId === "string") setClientIdState(data.clientId);
        setClientSecretSet(Boolean(data?.clientSecretSet));
      })
      .catch((err) => console.error("Failed to load AniList settings:", err));
  }, []);

  const saveAniListSettings = async (nextClientId: string, nextClientSecret: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/anilist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: nextClientId, clientSecret: nextClientSecret || undefined })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to save AniList settings");
        return false;
      }

      setClientIdState(data.clientId);
      setClientSecretSet(Boolean(data.clientSecretSet));
      return true;
    } catch (err) {
      console.error("Failed to save AniList settings:", err);
      setError("Failed to save AniList settings");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { clientId, clientSecretSet, saveAniListSettings, isSaving, error };
};
