"use client";

import { useCallback, useEffect, useState, useRef } from "react";

import { Locator, Publication } from "@readium/shared";
import { EpubNavigatorListeners, IContentProtectionConfig, ILinkInjectable, IBlobInjectable } from "@readium/navigator";
import { useEpubKeyboardPeripherals } from "./useEpubKeyboardPeripherals";
import { ThPreferences } from "@/preferences";
import { FontMetadata, InjectableFontResources } from "@/preferences/services/fonts";

import { EPubStatelessCache } from "./useEpubStatelessCache";
import { useEpubPreferencesConfig } from "./usePreferencesConfig";
import { useEpubInjectablesConfig } from "./useInjectablesConfig";
import { useEpubNavigator, EpubNavigatorLoadProps } from "@/core/Hooks/Epub/useEpubNavigator";

interface UseEpubReaderInitProps {
  container: React.RefObject<HTMLDivElement | null>;
  publication: Publication | null;
  positionsList?: Locator[];
  initialPosition: Locator | null;
  listeners: EpubNavigatorListeners;
  preferences: ThPreferences;
  cache: React.RefObject<EPubStatelessCache>;
  isFontFamilyUsed: boolean;
  fontLanguage: string;
  getFontMetadata: (fontId: string) => FontMetadata;
  injectFontResources: (resources: InjectableFontResources | null) => void;
  removeFontResources: () => void;
  getAndroidFXLPatch: () => (ILinkInjectable & IBlobInjectable) | null;
  getFontInjectables: (options?: { language?: string } | { key?: string }, optimize?: boolean) => InjectableFontResources | null;
  fxlThemeKeys: string[];
  reflowThemeKeys: string[];
  arrowsOccupySpace: boolean;
  arrowsWidth: React.RefObject<number>;
  colorScheme: any;
  isFXL: boolean;
  contentProtectionConfig?: IContentProtectionConfig;
  onNavigatorReady?: () => void;
  onNavigatorLoaded?: () => void;
  onCleanup?: () => void;
}

export const useEpubReaderInit = ({
  container,
  publication,
  positionsList,
  initialPosition,
  listeners,
  preferences,
  cache,
  isFontFamilyUsed,
  fontLanguage,
  getFontMetadata,
  injectFontResources,
  removeFontResources,
  getAndroidFXLPatch,
  getFontInjectables,
  fxlThemeKeys,
  reflowThemeKeys,
  arrowsOccupySpace,
  arrowsWidth,
  colorScheme,
  isFXL,
  contentProtectionConfig,
  onNavigatorReady,
  onNavigatorLoaded,
  onCleanup,
}: UseEpubReaderInitProps) => {
  const [navigatorReady, setNavigatorReady] = useState(false);

  const { epubPreferences, epubDefaults } = useEpubPreferencesConfig({
    isFXL,
    settings: cache.current.settings,
    colorScheme,
    fontLanguage,
    arrowsOccupySpace,
    arrowsWidth,
    preferences,
    getFontMetadata,
    fxlThemeKeys,
    reflowThemeKeys,
  });

  const { injectables } = useEpubInjectablesConfig({
    isFXL,
    isFontFamilyUsed,
    fontLanguage,
    getFontInjectables,
    getAndroidFXLPatch,
    // CLAUDE-ADDED: Lets the cover-alone-on-right injectable target exactly the first reading-order resource.
    firstResourceHref: publication?.readingOrder?.items?.[0]?.href,
  });

  const handleCleanup = useCallback(() => {
    if (!isFXL) removeFontResources();
    onCleanup?.();
  }, [isFXL, removeFontResources, onCleanup]);

  const keyboardPeripherals = useEpubKeyboardPeripherals();
  const { EpubNavigatorLoad, EpubNavigatorDestroy } = useEpubNavigator();
  const isNavigatorLoadedEpub = useRef(false);
  
  useEffect(() => {
    // Only initialize once, never re-render
    if (!publication || isNavigatorLoadedEpub.current) return;

    // Add container protection
    if (!container.current) {
      console.error("Container ref is not available for navigator initialization");
      return;
    }

    // Initialize navigator for EPUB like WebPub
    const deserializedInitialPosition = initialPosition ? Locator.deserialize(initialPosition) : undefined;
    // CLAUDE-ADDED: FXLFramePoolManager.update()/FramePoolManager.update() both throw synchronously
    // if the locator's href isn't in the current readingOrder (see @readium/navigator's
    // apply()/framePool.update() -- a stale saved position, e.g. from a CBZ that got re-tagged/
    // re-saved since the position was recorded on another device, no longer has a matching entry).
    // EpubNavigatorLoad's own load().then() has no .catch(), so that throw currently propagates into
    // an unhandled rejection: onNavigatorLoaded/cb() never fires, and the reader is left stuck on
    // whatever FXLFramePoolManager's constructor defaults to (slide 0, the cover) with no visible
    // error -- exactly "opens to the cover instead of the saved position". Validating the href here
    // avoids ever reaching that throw: an unresolvable href falls back to undefined (the navigator's
    // own normal, error-free "no initial position" path), rather than a resolvable-looking Locator
    // that blows up three layers down.
    const validatedInitialPosition = deserializedInitialPosition && publication.readingOrder.findWithHref(deserializedInitialPosition.href)
      ? deserializedInitialPosition
      : (() => {
          if (deserializedInitialPosition) {
            console.warn("Saved reading position's href is not in this publication's reading order, starting from the beginning instead:", deserializedInitialPosition.href);
          }
          return undefined;
        })();
    const config: EpubNavigatorLoadProps = {
      container: container.current,
      publication,
      listeners,
      positionsList: positionsList?.flatMap(loc => Locator.deserialize(loc) ?? []) || [],
      initialPosition: validatedInitialPosition,
      preferences: epubPreferences,
      defaults: epubDefaults,
      injectables: injectables || undefined,
      contentProtection: contentProtectionConfig,
      keyboardPeripherals,
    };

    isNavigatorLoadedEpub.current = true;
    
    // Call onNavigatorReady outside of navigator load
    onNavigatorReady?.();
    
    // Pass onNavigatorLoaded as the callback to EpubNavigatorLoad
    EpubNavigatorLoad(config, () => {
      // Set navigatorReady to true only after navigator actually loads
      setNavigatorReady(true);
      onNavigatorLoaded?.();
    });

    return () => {
      if (isNavigatorLoadedEpub.current) {
        setNavigatorReady(false);
        EpubNavigatorDestroy(() => {
          isNavigatorLoadedEpub.current = false;
          handleCleanup();
        });
      }
    };
  }, []);

  // Handle font resource injection
  useEffect(() => {
    if (!isFXL && isFontFamilyUsed) {
      const fontResources = getFontInjectables({ language: fontLanguage });
      if (fontResources) {
        injectFontResources(fontResources);
      }
    }
  }, [isFXL, isFontFamilyUsed, fontLanguage, injectFontResources, getFontInjectables]);

  return {
    navigatorReady,
    isFXL,
  };
};
