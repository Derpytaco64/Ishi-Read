"use client";

import { useCallback, useState } from "react";
import { Locator } from "@readium/shared";
import { PositionStorage } from "@/components/Reader/StatefulReaderWrapper";
import { useLocalStorage } from "../core/Hooks/useLocalStorage";

export const usePositionStorage = (key: string | null, customStorage?: PositionStorage) => {
  const localStorageData = useLocalStorage(key);
  const [customData, setCustomData] = useState<Locator | null>(() =>
    customStorage ? (customStorage.get() || null) : null
  );

  // CLAUDE-ADDED: Memoized (unlike the plain function literals this replaced) so callers -- e.g. the
  // debounced position save in StatefulReader.tsx -- get a stable reference instead of a new one
  // every render, which would otherwise silently defeat their debouncing.
  const setCustom = useCallback((newValue: Locator | null) => {
    if (newValue) {
      customStorage?.set(newValue);
    }
    setCustomData(newValue);
  }, [customStorage]);

  const getCustom = useCallback(() => customData, [customData]);

  if (customStorage) {
    return {
      setLocalData: setCustom,
      getLocalData: getCustom,
      localData: customData
    };
  }

  return localStorageData;
};
