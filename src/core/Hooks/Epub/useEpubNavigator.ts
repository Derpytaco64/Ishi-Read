"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  Link,
  Locator,
  Publication
} from "@readium/shared";
import {
  Decoration,
  DecorationObserver,
  EpubNavigator,
  EpubNavigatorListeners,
  EpubPreferences,
  EpubSettings,
  IContentProtectionConfig,
  IEpubDefaults,
  IEpubPreferences,
  IInjectablesConfig,
  IKeyboardPeripheralsConfig,
  getScriptMode,
  ScriptMode
} from "@readium/navigator";

import { useAppSelector } from "@/lib/hooks";

// CLAUDE-ADDED: Two rAFs (not a fixed setTimeout) to wait out a browser reflow -- same idiom
// useExactPageCount.ts's own nextFrame uses for the same reason: a ResizeObserver callback runs
// "after layout, before paint" of some upcoming frame, not synchronously with the DOM change that
// triggered it, so a single rAF isn't reliably guaranteed to land after it fires.
const nextFrame = (): Promise<void> => {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
};

type cbb = (ok: boolean) => void;

// Module scoped, singleton instance of navigator
let navigatorInstance: EpubNavigator | null = null;

export interface EpubNavigatorLoadProps {
  container: HTMLDivElement | null;
  publication: Publication;
  listeners: EpubNavigatorListeners;
  positionsList?: Locator[];
  initialPosition?: Locator;
  preferences?: IEpubPreferences;
  defaults?: IEpubDefaults;
  injectables?: IInjectablesConfig;
  contentProtection?: IContentProtectionConfig;
  keyboardPeripherals?: IKeyboardPeripheralsConfig;
}

export const useEpubNavigator = () => {
  const container = useRef<HTMLDivElement | null>(null);
  const containerParent = useRef<HTMLElement | null>(null);
  const publication = useRef<Publication | null>(null);

  // CLAUDE-ADDED: positionsList's own copy of the current position, kept fresh via ref (submitPreferences
  // below is a stable useCallback, so it needs a ref rather than closing over the selector value
  // directly) -- see submitPreferences' own comment for why this is needed.
  const positionsList = useAppSelector(state => state.publication.positionsList);
  const positionsListRef = useRef(positionsList);
  useEffect(() => {
    positionsListRef.current = positionsList;
  }, [positionsList]);

  // CLAUDE-ADDED: The reflow-drift correction below only applies to reflowable content -- FXL resources
  // don't reflow at all (a preference change there goes through handleFXLPrefs, not updateCSS/CSS
  // column reflow), so their position never drifts in the first place, and re-navigating anyway would
  // just add an unnecessary full resource reload (see go()'s own this.apply() call) on every zoom click.
  const isFXL = useAppSelector(state => state.publication.isFXL);
  const isFXLRef = useRef(isFXL);
  useEffect(() => {
    isFXLRef.current = isFXL;
  }, [isFXL]);

  // CLAUDE-ADDED: Guards the correction below against overlapping calls -- zoom's +/- buttons in
  // particular get rapid-clicked, and each click's own capture-change-wait-correct cycle now takes a
  // few frames, wide enough for a second click to land before the first's correction fires. Without
  // this, an in-flight correction from an *earlier* click could re-navigate to that click's now-stale
  // captured position, stepping on whatever the latest click already settled -- visible flicker. Only
  // the most recent call's correction is allowed to actually run; the preference value itself is
  // unaffected (that's applied synchronously inside navigatorInstance.submitPreferences above, every
  // call's own).
  const submitGenerationRef = useRef(0);

  // CLAUDE-ADDED: Shared by submitPreferences (font size/spacing/etc. changes) and the fullscreen
  // toggle correction below -- both trigger the same underlying problem: EpubNavigator's post-reflow
  // position recovery (see submitPreferences/syncLocation in @readium/navigator) approximates "where
  // you were" by clamping the previous *pixel* scroll offset into the resource's newly reflowed
  // scroll width, then re-deriving locations.position from that clamped fraction. That's fine for a
  // small nudge, but a large layout change -- a big font-size jump, or a fullscreen toggle changing
  // the viewport's available height/width -- can shrink/grow a resource's total width so much that
  // the clamped pixel position lands nowhere near the paragraph actually being read (jumping from
  // position 50 of 800 to 200 of 800 on one big font-size decrease, for example, or silently
  // reverting forward navigation made while fullscreen once exiting resizes the viewport back).
  // Capturing locations.position *before* the change and explicitly re-navigating to that same
  // positions-list entry afterward -- the identical lookup StatefulJumpToPositionContainer already
  // uses for manual position jumps -- corrects the drift regardless of how the internal auto-snap
  // landed, since the positions list itself is a fixed, content-based index that never depends on
  // layout. `action` is expected to be whatever synchronously (or via its own returned promise)
  // triggers the layout change; capturing happens before it runs, which is why this takes a callback
  // rather than just wrapping a promise passed in already-started.
  const correctPositionAround = useCallback(async (action: () => void | Promise<void>) => {
    const positionBefore = isFXLRef.current ? undefined : navigatorInstance?.currentLocator?.locations?.position;
    const generation = ++submitGenerationRef.current;

    await action();

    if (positionBefore === undefined) return;

    // CLAUDE-ADDED: The navigator's own ResizeObserver-driven auto-snap runs off a browser reflow, not
    // off action()'s own promise -- it can still be pending when the above await resolves. Wait it out
    // first so our corrective go() below is the last word, not something the auto-snap clobbers a
    // frame later.
    await nextFrame();

    if (submitGenerationRef.current !== generation) return;

    const target = positionsListRef.current.find(item => item.locations.position === positionBefore);
    if (!target) return;

    await new Promise<void>((resolve) => navigatorInstance?.go(target, false, () => resolve()));
  }, []);

  const submitPreferences = useCallback(async (preferences: IEpubPreferences) => {
    await correctPositionAround(() => navigatorInstance?.submitPreferences(new EpubPreferences(preferences)));
  }, [correctPositionAround]);

  const getSetting = useCallback(<K extends keyof EpubSettings>(settingKey: K) => {
    return navigatorInstance?.settings[settingKey] as EpubSettings[K];
  }, []);

  const EpubNavigatorLoad = useCallback((config: EpubNavigatorLoadProps, cb: Function) => {
    if (config.container) {
      container.current = config.container;
      containerParent.current = container.current? container.current.parentElement : null;
      
      publication.current = config.publication;

      navigatorInstance = new EpubNavigator(
        config.container,
        config.publication,
        config.listeners,
        config.positionsList,
        config.initialPosition,
        {
          preferences: config.preferences || {},
          defaults: config.defaults || {},
          injectables: config.injectables || undefined,
          contentProtection: config.contentProtection || undefined,
          keyboardPeripherals: config.keyboardPeripherals || [],
        }
      );

      navigatorInstance.load().then(() => {
        cb();
      });
    }
  }, []);

  const EpubNavigatorDestroy = useCallback((cb: Function) => {
    cb();

    navigatorInstance?.destroy().then(() => {
      navigatorInstance = null; // Clear the singleton reference
    });
  }, []);

  const goRight = useCallback((animated: boolean, callback: cbb) => {
    navigatorInstance?.goRight(animated, callback);
  }, []);

  const goLeft = useCallback((animated: boolean, callback: cbb) => {
    navigatorInstance?.goLeft(animated, callback)
  }, []);

  const goBackward = useCallback((animated: boolean, callback: cbb) => {
    navigatorInstance?.goBackward(animated, callback);
  }, []);

  const goForward = useCallback((animated: boolean, callback: cbb) => {
    navigatorInstance?.goForward(animated, callback);
  }, []);

  const goLink = useCallback((link: Link, animated: boolean, callback: cbb) => {
    navigatorInstance?.goLink(link, animated, callback);
  }, []);

  const go = useCallback((locator: Locator, animated: boolean, callback: cbb) => {
    navigatorInstance?.go(locator, animated, callback);
  }, []);

  const navLayout = useCallback(() => {
    return navigatorInstance?.layout;
  }, []);

  const currentLocator = useCallback(() => {
    return navigatorInstance?.currentLocator;
  }, []);

  const getLocatorAtOffset = useCallback((offset: number) => {
    const readingOrder = navigatorInstance?.publication?.readingOrder;
    if (!readingOrder) return null;

    const currentLocator = navigatorInstance?.currentLocator;
    if (!currentLocator) return null;

    const currentLocatorIndex = readingOrder.findIndexWithHref(currentLocator.href);
    if (currentLocatorIndex === -1) return null;
    
    const newIndex = currentLocatorIndex + offset;
    if (newIndex < 0 || newIndex >= readingOrder.items.length) return null;
    
    return readingOrder.items[newIndex];
  }, []);

  const previousLocator = useCallback(() => {
    const link = getLocatorAtOffset(-1);
    if (!link) return null;
    return navigatorInstance?.publication?.manifest?.locatorFromLink(link);
  }, [getLocatorAtOffset]);

  const nextLocator = useCallback(() => {
    const link = getLocatorAtOffset(1);
    if (!link) return null;
    return navigatorInstance?.publication?.manifest?.locatorFromLink(link);
  }, [getLocatorAtOffset]);

  const currentPositions = useCallback(() => {
    return navigatorInstance?.viewport?.positions;
  }, []);

  const canGoBackward = useCallback(() => {
    return navigatorInstance?.canGoBackward;
  }, []);

  const canGoForward = useCallback(() => {
    return navigatorInstance?.canGoForward;
  }, []);

  const isScrollStart = useCallback(() => {
    return navigatorInstance?.isScrollStart;
  }, []);

  const isScrollEnd = useCallback(() => {
    return navigatorInstance?.isScrollEnd;
  }, []);

  // Warning: this is an internal member that will become private, do not rely on it
  // See https://github.com/edrlab/thorium-web/issues/25
  const getCframes = useCallback(() => {
    return navigatorInstance?._cframes;
  }, []);

  const currentScriptMode = useCallback((): ScriptMode | undefined => {
    const metadata = navigatorInstance?.publication?.metadata;
    if (!metadata) return undefined;
    return getScriptMode(metadata);
  }, []);

  // CLAUDE-ADDED: Thin wrappers around EpubNavigator's DecorableNavigator API, used to render
  // highlights/notes and to detect taps on them (see StatefulReader.tsx's annotations decoration sync).
  const applyDecorations = useCallback((decorations: Decoration[], group: string) => {
    navigatorInstance?.applyDecorations(decorations, group);
  }, []);

  const registerDecorationObserver = useCallback((group: string, observer: DecorationObserver) => {
    navigatorInstance?.registerDecorationObserver(group, observer);
  }, []);

  const unregisterDecorationObserver = useCallback((observer: DecorationObserver) => {
    navigatorInstance?.unregisterDecorationObserver(observer);
  }, []);

  return { 
    EpubNavigatorLoad, 
    EpubNavigatorDestroy, 
    goRight, 
    goLeft, 
    goBackward, 
    goForward,
    goLink, 
    go, 
    navLayout, 
    currentLocator,
    previousLocator,
    nextLocator,
    currentPositions,
    canGoBackward,
    canGoForward,
    isScrollStart,
    isScrollEnd,
    preferencesEditor: navigatorInstance?.preferencesEditor,
    getSetting,
    submitPreferences,
    correctPositionAround,
    getCframes,
    getScriptMode: currentScriptMode,
    applyDecorations,
    registerDecorationObserver,
    unregisterDecorationObserver,
  }
}