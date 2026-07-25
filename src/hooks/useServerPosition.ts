"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Locator } from "@readium/shared";
import { PositionStorage } from "@/components/Reader/StatefulReaderWrapper";
import { fetchPositionFromServer, savePositionToServer } from "@/lib/userData/positionApi";

// CLAUDE-ADDED: PositionStorage.get() is read synchronously (see usePositionStorage.ts) when the
// reader mounts, so the fetch has to happen and resolve *before* StatefulReaderWrapper renders --
// callers gate rendering on `isLoading`, same pattern as the existing publication-loading gate. A
// wrong reading position "flash" (start of book, then jump) would be far more jarring than a brief
// spinner, unlike settings (see store.ts's non-blocking hydrateFromServer for that tradeoff).
export const useServerPosition = (manifestUrl: string | null) => {
  const [isLoading, setIsLoading] = useState(!!manifestUrl);
  const locatorRef = useRef<Locator | null>(null);

  useEffect(() => {
    if (!manifestUrl) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    locatorRef.current = null;

    const decodedUrl = decodeURIComponent(manifestUrl);

    fetchPositionFromServer(decodedUrl).then((locator) => {
      if (cancelled) return;
      locatorRef.current = locator;
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  const positionStorage: PositionStorage | undefined = useMemo(() => {
    if (!manifestUrl) return undefined;
    const decodedUrl = decodeURIComponent(manifestUrl);

    return {
      get: () => locatorRef.current ?? undefined,
      set: (locator: Locator) => savePositionToServer(decodedUrl, locator)
    };
  }, [manifestUrl]);

  return { isLoading, positionStorage };
};
