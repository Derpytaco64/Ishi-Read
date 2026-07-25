"use client";

import { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { makeStore, hydrateFromServer, AppStore } from "./store";

export const ThStoreProvider = ({
  storageKey,
  store,
  children
}: {
  storageKey?: string,
  store?: AppStore,
  children: React.ReactNode
}) => {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = store || makeStore(storageKey);
  }

  // CLAUDE-ADDED: The store already rendered synchronously from localStorage (see makeStore) --
  // this reconciles it with the server-persisted copy shortly after mount, non-blocking.
  useEffect(() => {
    hydrateFromServer(storeRef.current!);
  }, []);

  return <Provider store={ storeRef.current }>{ children }</Provider>
}

export default ThStoreProvider;