"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsClient } from "./useIsClient";
import { isIOSish } from "../Helpers/getPlatform";

export const useFullscreen = (onChange?: (isFullscreen: boolean) => void) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isClient, isClientRef } = useIsClient();
  const isSupported = isClient && !isIOSish() && Boolean(document.fullscreenEnabled);

  // CLAUDE-ADDED: Returns the underlying requestFullscreen()/exitFullscreen() promise (rather than a
  // fire-and-forget void call) so callers that need to react *after* the transition has actually
  // completed -- not just after the call was issued -- have a real signal to await, instead of
  // guessing with a timeout. See useEpubNavigator.ts's correctPositionAround, used to correct reflow
  // drift the fullscreen resize can cause.
  const handleFullscreen = useCallback((): Promise<void> => {
    if (!isClientRef.current || isIOSish()) return Promise.resolve();

    if (!document.fullscreenElement) {
      return document.documentElement.requestFullscreen();
    } else if (document.exitFullscreen) {
      return document.exitFullscreen();
    }

    return Promise.resolve();
  }, [isClientRef]);

  useEffect(() => {
    const onFSchange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
      onChange && onChange(isFs);
    };
    document.addEventListener("fullscreenchange", onFSchange);

    return () => {
      document.removeEventListener("fullscreenchange", onFSchange);
    };
  }, [onChange]);

  return { isFullscreen, isSupported, handleFullscreen };
};
