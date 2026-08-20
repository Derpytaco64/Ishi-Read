"use client";

import { useCallback, useEffect, useState } from "react";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  anilistConnected: boolean;
  anilistScoreFormat: string | null;
}

// CLAUDE-ADDED: Shared by the profile icon/context menu, the edit-user modal, and the library
// menu's admin-only Settings sections -- one /api/auth/me fetch, everything that needs to know
// "who's logged in and are they an admin" reads from this instead of hitting the endpoint itself.
export const useCurrentUser = () => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch (err) {
      console.error("Failed to load current user:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, isLoading, refresh };
};
