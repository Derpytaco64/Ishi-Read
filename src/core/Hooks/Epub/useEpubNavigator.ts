"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  Link,
  Locator,
  LocatorLocations,
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

  // CLAUDE-ADDED: EpubNavigator/the injectable content script already ship a full "find the first
  // visible element, turn it into a Locator" pipeline (ColumnSnapper.ts's "first_visible_locator"
  // comms handler -> helpers/dom.ts's findFirstVisibleLocator, which walks the DOM for the smallest
  // fully-visible element and builds a Locator with a cssSelector *and* text.highlight set to that
  // element's own text) -- it's just never triggered from anywhere in the compiled bundle. _cframes is
  // the same internal escape hatch getCframes() already exposes to the rest of the app (see its own
  // "will become private" warning); .msg is EpubNavigator's own internal comms channel, the same one
  // go()/submitPreferences use themselves. Sending the command directly and awaiting
  // navigatorInstance.currentLocator afterward -- rather than reading it in the ack callback -- relies
  // on the frame posting its "first_visible_locator" event (which is what actually updates
  // currentLocator, inside EpubNavigator's own eventListener) before it acks our command; both are sent
  // from the same synchronous handler in the frame, so postMessage ordering guarantees the event lands
  // first.
  const requestFirstVisibleLocator = useCallback((): Promise<Locator | undefined> => {
    return new Promise((resolve) => {
      const frame = navigatorInstance?._cframes?.[0];
      if (!frame?.msg) { resolve(undefined); return; }
      frame.msg.send("first_visible_locator", undefined, () => {
        resolve(navigatorInstance?.currentLocator);
      });
    });
  }, []);

  // CLAUDE-ADDED: Shared by correctPositionAround (reflow-drift correction, below) and
  // getTextAnchoredLocator (exposed for saving the reading position, so a reopened book can re-find the
  // same text regardless of layout differences between sessions -- see EpubNavigatorLoad's own comment).
  // Both need the same "capture a text.highlight anchor for wherever the reader currently is, merged onto
  // a real positions-list entry" Locator, and the same currentLocation repair afterward.
  const captureTextAnchoredLocator = useCallback(async (): Promise<Locator | undefined> => {
    if (isFXLRef.current) return undefined;

    const positionBefore = navigatorInstance?.currentLocator?.locations?.position;
    // CLAUDE-ADDED: positionTarget (not anchor) is the required anchor for everything below -- it's
    // always a real positions-list entry, so its own locations.position is guaranteed valid. Bail out
    // before ever calling requestFirstVisibleLocator if we don't have one (positions list not ready yet,
    // or currentLocator itself has no position), rather than risk the repair below writing back a
    // locator with no position at all -- see its own comment for why that specifically crashes.
    const positionTarget = positionBefore !== undefined
      ? positionsListRef.current.find(item => item.locations.position === positionBefore)
      : undefined;
    if (!positionTarget) return undefined;

    const anchor = await requestFirstVisibleLocator();

    const target = anchor?.text?.highlight
      ? new Locator({
          href: positionTarget.href,
          type: positionTarget.type,
          text: anchor.text,
          locations: new LocatorLocations({
            ...positionTarget.locations,
            otherLocations: anchor.locations?.otherLocations,
          }),
        })
      : positionTarget;

    // CLAUDE-ADDED: requestFirstVisibleLocator's own round trip above is Readium's "first_visible_locator"
    // event handling (EpubNavigator.ts's eventListener), which unconditionally replaces
    // navigatorInstance's own currentLocation.locations wholesale with whatever the frame reports -- a
    // cssSelector only, no position/progression (see helpers/dom.ts's findFirstVisibleLocator, which
    // never sets either). Harmless for our own read of it above (anchor is a local copy), but left
    // uncorrected it leaves the navigator's *shared* currentLocation without a valid locations.position --
    // which crashes FramePoolManager.update's `this.positions.findIndex(l => l.locations.position ===
    // locator.locations.position)` (throws "Locator not found in position list") the instant something
    // else triggers a layout switch (scroll <-> paginated, e.g. StatefulLayout's radio group) right after,
    // since setLayout reads navigatorInstance.currentLocator directly rather than anything of ours.
    // There's no public setter for currentLocation (private field, TS-only enforced), so this repairs it
    // directly -- with the exact same well-formed, guaranteed-to-have-a-position locator being returned,
    // i.e. the same kind of direct currentLocation assignment EpubNavigator's own internal code already
    // does in several places (e.g. that same first_visible_locator handler). Note this round trip also
    // re-fires the app's own positionChanged listener with the *uncorrected* (position-less) locator as a
    // side effect, before this repair runs -- StatefulReader.tsx's listener filters that one out.
    if (navigatorInstance) (navigatorInstance as unknown as { currentLocation: Locator }).currentLocation = target;

    return target;
  }, [requestFirstVisibleLocator]);

  // CLAUDE-ADDED: Shared by submitPreferences (font size/spacing/etc. changes) and the fullscreen
  // toggle correction below -- both trigger the same underlying problem: EpubNavigator's post-reflow
  // position recovery (see submitPreferences/syncLocation in @readium/navigator) approximates "where
  // you were" by clamping the previous *pixel* scroll offset into the resource's newly reflowed
  // scroll width, then re-deriving locations.position from that clamped fraction. That's fine for a
  // small nudge, but a large layout change -- a big font-size jump, or a fullscreen toggle changing
  // the viewport's available height/width -- can shrink/grow a resource's total width so much that
  // the clamped pixel position lands nowhere near the paragraph actually being read.
  //
  // The primary fix is content-anchored, not index-anchored: capture the actual text of whatever
  // element is first visible *before* the change (captureTextAnchoredLocator above), then after the
  // change ask the frame to re-find that same text via rangeFromLocator's TextQuoteAnchor search (see
  // EpubNavigator.ts's loadLocator -- passing a Locator with text.highlight set makes go() try this
  // automatically) and scroll it into view. That's anchored to the content itself, so it's correct
  // regardless of how the internal auto-snap's pixel-clamping landed, and regardless of device/viewport.
  // locations.position (the positions-list index lookup this used to rely on exclusively) is kept as a
  // merged-in fallback on the same target Locator -- loadLocator falls through to it automatically if
  // the text search comes up empty (e.g. a quote that's no longer unique). `action` is expected to be
  // whatever synchronously (or via its own returned promise) triggers the layout change; capturing
  // happens before it runs, which is why this takes a callback rather than just wrapping an
  // already-started promise.
  const correctPositionAround = useCallback(async (action: () => void | Promise<void>) => {
    const target = await captureTextAnchoredLocator();
    if (!target) { await action(); return; }

    const generation = ++submitGenerationRef.current;

    await action();

    // CLAUDE-ADDED: The navigator's own ResizeObserver-driven auto-snap runs off a browser reflow, not
    // off action()'s own promise -- it can still be pending when the above await resolves. Wait it out
    // first so our corrective go() below is the last word, not something the auto-snap clobbers a
    // frame later.
    await nextFrame();

    if (submitGenerationRef.current !== generation) return;

    await new Promise<void>((resolve) => navigatorInstance?.go(target, false, () => resolve()));
  }, [captureTextAnchoredLocator]);

  // CLAUDE-ADDED: Exposed for the reading-position save path (see Epub/StatefulReader.tsx's
  // debouncedSavePosition) -- ordinary position saves during normal reading/scrolling only ever carry
  // locations.position/progression (from EpubNavigator's own syncLocation reporting), never a
  // text.highlight anchor; that's only ever produced by this same captureTextAnchoredLocator, previously
  // only invoked from correctPositionAround. Without an anchor on the *saved* locator, EpubNavigatorLoad's
  // reopen-time go() (see its own comment) has nothing to search for and silently falls back to the old
  // progression-only placement -- which is exactly the drift this whole mechanism exists to prevent.
  const getTextAnchoredLocator = useCallback((): Promise<Locator | undefined> => {
    return captureTextAnchoredLocator();
  }, [captureTextAnchoredLocator]);

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
        // CLAUDE-ADDED: load()'s own initial placement (apply() -> FramePoolManager.update()) only ever
        // uses locations.progression -- a raw scrollLeft/scrollWidth fraction *within the resource* -- to
        // show the frame (see FramePoolManager.ts's `newFrame.show(locator.locations.progression)`); it
        // never looks at text.highlight/cssSelector. That fraction was measured against whatever column
        // width was active when it was saved -- a window resize, a docking panel/sidebar toggled open or
        // closed, or a margin/font-size change between sessions all change the reading pane's width, so
        // the same fraction lands somewhere else in the text on reopen (forwards or backwards -- most
        // visible in single-column mode, where one page holds a lot of text). This is the exact same
        // approximation correctPositionAround corrects for font-size/fullscreen/scroll-mode changes made
        // *after* a book is open, via requestFirstVisibleLocator's text-anchor search -- except load()
        // only runs once, for the initial open, which correctPositionAround never wraps. Routing the
        // initial position through go() (the same method correctPositionAround uses for its own
        // corrections) makes loadLocator try the saved text.highlight anchor first, falling back to
        // cssSelector then progression exactly like every other correction in this codebase already does
        // -- so reopening a book always lands on the same text regardless of layout differences since it
        // was saved.
        if (config.initialPosition?.text?.highlight) {
          navigatorInstance?.go(config.initialPosition, false, () => cb());
        } else {
          cb();
        }
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
    getTextAnchoredLocator,
    getCframes,
    getScriptMode: currentScriptMode,
    applyDecorations,
    registerDecorationObserver,
    unregisterDecorationObserver,
  }
}