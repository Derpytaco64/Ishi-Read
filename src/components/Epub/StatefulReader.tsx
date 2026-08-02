"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  ThemeKeyType,
  useFilteredPreferenceKeys
} from "../../preferences";

import readerStyles from "../assets/styles/thorium-web.reader.app.module.css";
import arrowStyles from "../assets/styles/thorium-web.reader.paginatedArrow.module.css";

import {
  ThLayoutDirection,
  ThLayoutUI,
  ThDocumentTitleFormat,
  ThSpacingSettingsKeys,
  ThProgressionFormat,
  ThSettingsKeys,
  ThDockingKeys,
  ThActionsKeys
} from "../../preferences/models";

import { ThPluginRegistry } from "../Plugins/PluginRegistry";
import { ThPluginProvider } from "../Plugins/PluginProvider";
import { NavigatorProvider } from "@/core/Navigator";

import {
  BasicTextSelection,
  ContextMenuEvent,
  FrameClickEvent,
  SuspiciousActivityEvent
} from "@readium/navigator-html-injectables";
import { Decoration, DecorationActivationEvent, EpubNavigatorListeners, KeyboardPeripheralEventData } from "@readium/navigator";
import {
  Locator,
  LocatorText,
  Publication,
  Layout
} from "@readium/shared";
import { PositionStorage, StatefulReaderProps } from "../Reader/StatefulReaderWrapper";

import { StatefulDockingWrapper } from "../Docking/StatefulDockingWrapper";
import { StatefulReaderHeader } from "../StatefulReaderHeader";
import { StatefulReaderArrowButton } from "../StatefulReaderArrowButton";
import { StatefulReaderFooter } from "../StatefulReaderFooter";

import { useLocale } from "react-aria";
import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useSettingsComponentStatus } from "@/components/Settings/hooks/useSettingsComponentStatus";
import { useEpubStatelessCache } from "./Hooks/useEpubStatelessCache";
import { useEpubReaderInit } from "./Hooks/useReaderInit";
import { useMarginSync, applyMargin } from "./Hooks/useMarginSync";
import { useShortImageSpread } from "./Hooks/useShortImageSpread";
import { useExactPageCount } from "./Hooks/useExactPageCount";
import { useReadingTimer } from "@/components/Actions/ReadingTimer/hooks/useReadingTimer";
import { useReadingSpeedSampler } from "@/components/Actions/ReadingTimer/hooks/useReadingSpeedSampler";
import { useBookWordCount } from "./Hooks/useBookWordCount";
import { persistWordCount } from "@/lib/readingTimeReducer";
import { anyUIElementPinned } from "@/lib/globalPreferencesReducer";
import { PairedSpreadOverlay } from "./PairedSpreadOverlay";
import { useEpubNavigator } from "@/core/Hooks/Epub/useEpubNavigator";
import { useFullscreen } from "@/core/Hooks/useFullscreen";
import { usePrevious } from "@/core/Hooks/usePrevious";
import { useI18n } from "@/i18n/useI18n";
import { useTimeline, UnstableTimeline } from "@/core/Hooks/useTimeline";
import { resolveChapterTitle } from "@/helpers/resolveChapterTitle";
import { useIsScroll, usePositionStorage } from "@/hooks";
import { useDocumentTitle } from "@/core/Hooks/useDocumentTitle";
import { useSpacingPresets } from "../Settings/Spacing/hooks/useSpacingPresets";
import { usePaginatedArrows } from "@/hooks/usePaginatedArrows";
import { useFonts } from "@/core/Hooks/fonts/useFonts";
import { useZoomCallbacks } from "@/components/Settings/hooks/useZoomCallbacks";
import { useFocusedDockableKey } from "../Docking/hooks/useFocusedDockableKey";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";

import { 
  setTheme 
} from "@/lib/themeReducer";
import { 
  setImmersive, 
  setLoading,
  setHovering, 
  toggleImmersive, 
  setPlatformModifier, 
  setDirection, 
  setFullscreen,
  setScrollAffordance,
  setUserNavigated
} from "@/lib/readerReducer";
import {
  setTimeline,
  setPublicationStart,
  setPublicationEnd,
  setExactPageCount
} from "@/lib/publicationReducer";
import { setPendingSelection, openNoteOverlay, setFlashLocator } from "@/lib/annotationsReducer";
import { highlightToDecoration, noteToDecoration } from "@/components/Actions/Annotations/helpers/toDecoration";
import { formatTimestamp } from "@/components/Actions/Annotations/helpers/formatTimestamp";
import { NOTE_HOVER_MESSAGE_TYPE, NoteHoverEntry } from "./Hooks/noteHoverScript";
import { SelectionPopover } from "@/components/Actions/Annotations/SelectionPopover";
import { NoteOverlay } from "@/components/Actions/Annotations/NoteOverlay";
import { toggleActionOpen, dockAction } from "@/lib/actionsReducer";
import { openImageOverlay } from "@/lib/imageOverlayReducer";
import { getClickedImage } from "./Helpers/getClickedImage";
import { StatefulImageOverlay } from "./ImageOverlay/StatefulImageOverlay";

import classNames from "classnames";
import debounce from "debounce";
import { buildThemeObject } from "@/preferences/helpers/buildThemeObject";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { NavPeripheralType, fromActionPeripheralType, fromDockingPeripheralType } from "../../helpers/peripherals";
import { getPlatformModifier } from "@/core/Helpers/keyboardUtilities";
import { getReaderClassNames } from "../Helpers/getReaderClassNames";
import { resolveContentProtectionConfig } from "@/preferences/models/protection";

// We need to register plugins before hooks run
// otherwise we can’t access the values of spacing presets
// when the component is effectively mounted as we check
// if the component is registered and displayed from prefs
export const StatefulReader = ({
  publication,
  localDataKey,
  plugins,
  positionStorage,
  containerRefSetter
}: StatefulReaderProps) => {
  const [pluginsRegistered, setPluginsRegistered] = useState(false);

  useLayoutEffect(() => {
    if (plugins && plugins.length > 0) {
      plugins.forEach(plugin => {
        ThPluginRegistry.register(plugin);
      });
    } else {
      ThPluginRegistry.register(createDefaultPlugin());
    }
    setPluginsRegistered(true);
  }, [plugins]);

  if (!pluginsRegistered) {
    return null;
  }

  return (
    <>
      <ThPluginProvider>
        <StatefulReaderInner publication={ publication } localDataKey={ localDataKey } positionStorage={ positionStorage } containerRefSetter={ containerRefSetter } />
      </ThPluginProvider>
    </>
  );
};

const StatefulReaderInner = ({ publication, localDataKey, positionStorage, containerRefSetter }: { publication: Publication; localDataKey: string | null; positionStorage?: PositionStorage; containerRefSetter?: (el: Element | null) => void }) => {
  const { fxlActionKeys, fxlThemeKeys, reflowActionKeys, reflowThemeKeys } = useFilteredPreferenceKeys();
  const { preferences, getFontMetadata, getFontInjectables } = usePreferences();
  const { direction: uiDirection } = useLocale();
  const { t } = useI18n();
  const { getEffectiveSpacingValue } = useSpacingPresets();
  const { occupySpace: arrowsOccupySpace } = usePaginatedArrows();
  const { injectFontResources, removeFontResources, getAndroidFXLPatch } = useFonts();
  
  const container = useRef<HTMLDivElement>(null);
  const arrowsWidth = useRef(2 * ((preferences.theming.arrow.size || 40) + (preferences.theming.arrow.offset || 0)));

  const profile = useAppSelector(state => state.reader.profile);
  const isFXL = useAppSelector(state => state.publication.isFXL);
  const isRTL = useAppSelector(state => state.publication.isRTL);
  const positionsList = useAppSelector(state => state.publication.positionsList);
  const fontLanguage = useAppSelector(state => state.publication.fontLanguage);
  const highlights = useAppSelector(state => state.annotations.highlights);
  const notes = useAppSelector(state => state.annotations.notes);
  const flashLocator = useAppSelector(state => state.annotations.flashLocator);
  const pendingSelection = useAppSelector(state => state.annotations.pendingSelection);

  // CLAUDE-ADDED: Runs for the whole time this book is open, independent of whether the reading-timer
  // header button is currently visible or collapsed into the overflow menu -- see useReadingTimer.ts.
  useReadingTimer();

  // Check if font family component is being used
  const { isComponentUsed: isFontFamilyUsed } = useSettingsComponentStatus({
    settingsKey: ThSettingsKeys.fontFamily,
    publicationType: isFXL ? "fxl" : "reflow",
  });

  const textAlign = useAppSelector(state => state.settings.textAlign);
  const columnCount = useAppSelector(state => state.settings.columnCount);
  const fontFamily = useAppSelector(state => state.settings.fontFamily);
  const fontSize = useAppSelector(state => state.settings.fontSize);
  const fontWeight = useAppSelector(state => state.settings.fontWeight);
  const hyphens = useAppSelector(state => state.settings.hyphens);
  const ligatures = useAppSelector(state => state.settings.ligatures);
  const noRuby = useAppSelector(state => state.settings.noRuby);
  const letterSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.letterSpacing);
  const lineLength = useAppSelector(state => state.settings.lineLength);
  const lineHeight = getEffectiveSpacingValue(ThSpacingSettingsKeys.lineHeight);
  const marginHorizontal = useAppSelector(state => state.settings.marginHorizontal);
  const paragraphIndent = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphIndent);
  const paragraphSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphSpacing);
  const publisherStyles = useAppSelector(state => state.settings.publisherStyles);
  const isScroll = useIsScroll();
  const textNormalization = useAppSelector(state => state.settings.textNormalization);
  const wordSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.wordSpacing);
  const themeObject = useAppSelector(state => state.theming.theme);
  const theme = isFXL ? themeObject.fxl : themeObject.reflow;
  const previousTheme = usePrevious(theme);
  const colorScheme = useAppSelector(state => state.theming.colorScheme);
  const reducedMotion = useAppSelector(state => state.theming.prefersReducedMotion);

  const breakpoint = useAppSelector(state => state.theming.breakpoint);
  const containerBreakpoint = useAppSelector(state => state.theming.containerBreakpoint);
  
  const isImmersive = useAppSelector(state => state.reader.isImmersive);
  const isHovering = useAppSelector(state => state.reader.isHovering);
  // CLAUDE-ADDED: "Keep progress indicator visible while reading" setting, plus any individual "UI
  // Element Visibility" toggle pinned on -- see StatefulUIVisibilityToggles.tsx / anyUIElementPinned's
  // own comment in globalPreferencesReducer.ts. Combined only at the getReaderClassNames call below (the
  // CSS class that slides the whole header/footer bar out of view in immersive mode), not into the base
  // isHovering used above for useEpubStatelessCache's layout signature, which tracks the real hover
  // state independent of this display preference.
  const keepChromeVisible = useAppSelector(state => state.globalPreferences.keepChromeVisible);
  const uiElementVisibility = useAppSelector(state => state.globalPreferences.uiElementVisibility);
  const chromeAlwaysVisible = keepChromeVisible || anyUIElementPinned(uiElementVisibility);

  const layoutUI = isFXL 
    ? preferences.theming.layout.ui?.fxl || ThLayoutUI.layered 
    : isScroll 
      ? preferences.theming.layout.ui?.reflow || ThLayoutUI.layered
      : ThLayoutUI.stacked;

  const cache = useEpubStatelessCache(
    textAlign,
    columnCount,
    fontFamily,
    fontSize,
    fontWeight,
    hyphens,
    letterSpacing,
    ligatures,
    lineLength,
    lineHeight,
    marginHorizontal,
    noRuby,
    paragraphIndent,
    paragraphSpacing,
    publisherStyles,
    isScroll,
    textNormalization,
    wordSpacing,
    theme,
    positionsList,
    colorScheme,
    reducedMotion,
    layoutUI,
    isImmersive,
    isHovering,
    arrowsOccupySpace
  );

  const atPublicationStart = useAppSelector(state => state.publication.atPublicationStart);
  const atPublicationEnd = useAppSelector(state => state.publication.atPublicationEnd);
  const actionsState = useAppSelector(state => profile ? state.actions.keys[profile] : undefined);

  const dispatch = useAppDispatch();
  const getFocusedDockableKey = useFocusedDockableKey();

  useEffect(() => {
    // Reset top bar visibility and last position
    dispatch(setImmersive(false));
  }, [isScroll, dispatch]);

  const onFsChange = useCallback((isFullscreen: boolean) => {
    dispatch(setFullscreen(isFullscreen));
  }, [dispatch]);
  
  const { handleFullscreen } = useFullscreen(onFsChange);

  const epubNavigator = useEpubNavigator();
  const {
    goLeft,
    goRight,
    goBackward,
    goForward,
    navLayout,
    currentPositions,
    currentLocator,
    canGoBackward,
    canGoForward,
    isScrollStart,
    isScrollEnd,
    getCframes,
    submitPreferences,
    correctPositionAround,
    applyDecorations,
    registerDecorationObserver,
    unregisterDecorationObserver
  } = epubNavigator;

  // CLAUDE-ADDED: See useShortImageSpread.ts -- pairs consecutive image-only "insert" resources into one visible spread in two-column mode.
  const { pair: spreadPair, evaluate: evaluateSpread } = useShortImageSpread({
    publication,
    isFXL,
    isScroll,
    getCframes,
    goForward,
    goBackward,
    positionsList,
  });

  // CLAUDE-ADDED: Keeps already-loaded frames' horizontal margin in sync when the user changes the setting -- see useMarginSync.ts.
  useMarginSync({ getCframes, marginHorizontal });

  // CLAUDE-ADDED: useExactPageCount is called later (it needs navigatorReady, which itself comes from useEpubReaderInit, which consumes `listeners` below) -- listeners.positionChanged needs to call its notifyLocatorChanged on every navigation, so that call is routed through this ref instead of the hook's return value directly, breaking the circular ordering.
  const notifyExactPageCountRef = useRef<(locator: Locator) => void>(() => {});

  // CLAUDE-ADDED: Same ref-indirection as notifyExactPageCountRef above -- useReadingSpeedSampler has
  // no actual ordering dependency on navigatorReady, but keeping both positionChanged hookups in the
  // same shape (and next to each other) keeps this section easy to scan.
  const notifyReadingSpeedRef = useRef<(locator: Locator) => void>(() => {});
  const { notifyLocatorChanged: notifyReadingSpeed } = useReadingSpeedSampler();
  notifyReadingSpeedRef.current = notifyReadingSpeed;

  // CLAUDE-ADDED: Same ref-indirection pattern as the two above -- textSelected and the
  // highlight-tap observer (both inside the `listeners` useMemo below, which deliberately doesn't
  // depend on `timeline`) need the latest resolved chapter titles without forcing that memo to
  // recompute on every navigation (timeline's own identity changes on every locator change).
  const timelineItemsRef = useRef<UnstableTimeline["items"]>(undefined);

  const readingTimeIsLoaded = useAppSelector(state => state.readingTime.isLoaded);
  const wordCount = useAppSelector(state => state.readingTime.wordCount);
  const readingManifestUrl = useAppSelector(state => state.readingTime.manifestUrl);

  // CLAUDE-ADDED: Runs at most once ever per book -- gated off the moment the server-fetched value
  // (readingTimeIsLoaded) confirms wordCount is genuinely uncached, and turned back off as soon as
  // useBookWordCount reports a result (see the effect below persisting it, which then makes wordCount
  // non-null and this condition false on the next render).
  const bookWordCount = useBookWordCount({
    publication,
    enabled: readingTimeIsLoaded && wordCount === null
  });

  useEffect(() => {
    if (bookWordCount.wordCount !== null && readingManifestUrl) {
      dispatch(persistWordCount(readingManifestUrl, bookWordCount.wordCount));
    }
  }, [bookWordCount.wordCount, readingManifestUrl, dispatch]);

  // CLAUDE-ADDED: Latest note-hover-preview entries, kept in a ref so `listeners.frameLoaded` (bound
  // once via `listeners`'s own useMemo -- see there) can hand them to a newly-loaded frame without
  // needing `notes` in that useMemo's dependency array. Updated by the effect further down that also
  // broadcasts to already-live frames.
  const noteHoverEntriesRef = useRef<NoteHoverEntry[]>([]);

  const { setLocalData, getLocalData, localData } = usePositionStorage(localDataKey, positionStorage);

  // CLAUDE-ADDED: The real navigator's viewport only ever has one of the pair's two resources loaded (see useShortImageSpread.ts), so navigatorInstance.viewport.positions reports just that one resource's position -- not the pair -- while a paired spread is on screen. Substituting the pair's own leftPosition/rightPosition here is what makes the footer show both, the same way it does for a real two-column text spread. Deliberately not memoized -- like the currentPositions() call it replaces, this needs to read the navigator's live value on every render, not just when spreadPair itself changes.
  const activeCurrentPositions = spreadPair?.leftPosition !== undefined && spreadPair?.rightPosition !== undefined
    ? [spreadPair.leftPosition, spreadPair.rightPosition]
    : currentPositions() || [];

  const timeline = useTimeline({
    publication: publication,
    currentLocation: localData,
    currentPositions: activeCurrentPositions,
    positionsList: positionsList,
    onChange: (timeline) => {
      dispatch(setTimeline(timeline));
    }
  });
  timelineItemsRef.current = timeline.items;

  const documentTitleFormat = preferences.metadata?.documentTitle?.format;
  
  let documentTitle: string | undefined;
  
  if (documentTitleFormat) {
    if (typeof documentTitleFormat === "object" && "key" in documentTitleFormat) {
      const translatedTitle = t(documentTitleFormat.key);
      documentTitle = translatedTitle !== documentTitleFormat.key 
        ? translatedTitle 
        : documentTitleFormat.fallback;
    } else {
      switch (documentTitleFormat) {
        case ThDocumentTitleFormat.title:
          documentTitle = timeline?.title;
          break;
        case ThDocumentTitleFormat.chapter:
          documentTitle = timeline?.progression?.currentChapter;
          break;
        case ThDocumentTitleFormat.titleAndChapter:
          if (timeline?.title && timeline?.progression?.currentChapter) {
            documentTitle = `${ timeline.title } – ${ timeline.progression.currentChapter }`;
          }
          break;
        case ThDocumentTitleFormat.none:
          documentTitle = undefined;
          break;
        default: 
          documentTitle = documentTitleFormat;
          break;
      }
    }
  }

  useDocumentTitle(documentTitle);

  const activateImmersiveOnAction = useCallback(() => {
    if (!cache.current.isImmersive) dispatch(setImmersive(true));
  }, [cache, dispatch]);

  const toggleIsImmersive = useCallback(() => {
    // If tap/click in iframe, then header/footer no longer hovering 
    dispatch(setHovering(false));
    dispatch(toggleImmersive());
  }, [dispatch]);

  // Warning: this is using navigator’s internal methods that will become private, do not rely on them
  // See https://github.com/edrlab/thorium-web/issues/25
  const handleTap = useCallback((event: FrameClickEvent) => {
    const _cframes = getCframes();
    if (_cframes) {
      if (!cache.current.settings.scroll) {
        const oneQuarter = ((_cframes.length === 2 ? _cframes[0]!.window.innerWidth + _cframes[1]!.window.innerWidth : _cframes![0]!.window.innerWidth) * window.devicePixelRatio) / 4;
        
        const navigationCallback = () => {
          dispatch(setUserNavigated(true));
          activateImmersiveOnAction();
        };
    
        if (event.x < oneQuarter) {
          goLeft(!cache.current.reducedMotion, navigationCallback);
        } 
        else if (event.x > oneQuarter * 3) {
          goRight(!cache.current.reducedMotion, navigationCallback);
        } else if (oneQuarter <= event.x && event.x <= oneQuarter * 3) {
          toggleIsImmersive();
        }
      } else {
        if (preferences.affordances.scroll.toggleOnMiddlePointer.includes("tap")) {
          toggleIsImmersive();
        }
      }
    }
  }, [getCframes, cache, preferences.affordances.scroll, goLeft, goRight, dispatch, activateImmersiveOnAction, toggleIsImmersive]);

  const handleClick = useCallback((_event: FrameClickEvent) => {
    if (
      cache.current.layoutUI === ThLayoutUI.layered &&
      ( !cache.current.settings.scroll ||
        preferences.affordances.scroll.toggleOnMiddlePointer.includes("click") )
      ) {
        toggleIsImmersive();
      }
  }, [cache, preferences.affordances.scroll, toggleIsImmersive]);

  // CLAUDE-ADDED: Checked before handleTap/handleClick's own page-navigation/immersive-toggle logic --
  // tapping/clicking an <img> in the reading content should open the fullscreen image viewer instead of
  // navigating or toggling the header/footer. See getClickedImage.ts for why this parses outerHTML
  // rather than querying the iframe DOM directly.
  const handleImageClick = useCallback((_event: FrameClickEvent): boolean => {
    const image = getClickedImage(_event, getCframes);
    if (!image) return false;

    dispatch(openImageOverlay(image));
    return true;
  }, [dispatch, getCframes]);

  // We could use canGoBackward() and canGoForward() directly on arrows
  // but maybe we will need to sync the state for other features in the future
  const updatePublicationNavigationState = useCallback(() => {
    if (canGoBackward()) {
      dispatch(setPublicationStart(false));
    } else {
      dispatch(setPublicationStart(true));
    }
    
    if (canGoForward()) {
      dispatch(setPublicationEnd(false));
    } else {
      dispatch(setPublicationEnd(true));
    }
  }, [canGoBackward, canGoForward, dispatch]);

  const moveTo = useCallback((direction: "left" | "right" | "up" | "down" | "home" | "end") => {
    const navigationCallback = () => {
      dispatch(setUserNavigated(true));
      activateImmersiveOnAction();
    };
    switch (direction) {
      case "right":
        !cache.current.settings.scroll && goRight(!cache.current.reducedMotion, navigationCallback);
        break;
      case "left":
        !cache.current.settings.scroll && goLeft(!cache.current.reducedMotion, navigationCallback);
        break;
      default:
        break;
    }
  }, [dispatch, activateImmersiveOnAction, cache, goRight, goLeft]);

  const { zoomIn, zoomOut } = useZoomCallbacks(epubNavigator);

  // CLAUDE-ADDED: Escape exits back to the backLink href, but only when no transient overlay
  // (Toc, Settings, JumpToPosition...) is open -- that Escape press just closes it instead
  const backLinkHref = preferences.theming.header?.backLink?.href;
  const exitReader = useCallback(() => {
    if (!backLinkHref) return;

    const hasOpenOverlay = Object.values(actionsState ?? {}).some(
      (action) => action?.isOpen && (!action.docking || action.docking === ThDockingKeys.transient)
    );
    if (hasOpenOverlay) return;

    window.location.href = backLinkHref;
  }, [backLinkHref, actionsState]);

  const goProgression = useCallback((shiftKey?: boolean) => {
    if (!cache.current.settings?.scroll) {
      const cb = () => {
        dispatch(setUserNavigated(true));
        activateImmersiveOnAction();
      };
      shiftKey
        ? goBackward(!cache.current.reducedMotion, cb)
        : goForward(!cache.current.reducedMotion, cb);
    }
  }, [dispatch, activateImmersiveOnAction, cache, goBackward, goForward]);

  // CLAUDE-ADDED: Memoized once (unlike the previous inline `debounce(...)` call, which built a fresh
  // debounced function on every positionChanged event -- since each one got its own independent timer,
  // none of them actually coalesced rapid position changes, they just each fired ~250ms later
  // unthrottled. Reusing one stable instance here means only the last position in a burst gets saved.
  const debouncedSavePosition = useMemo(
    () => debounce((locator: Locator) => {
      setLocalData(locator);
      updatePublicationNavigationState();
    }, 250),
    [setLocalData, updatePublicationNavigationState]
  );

  // CLAUDE-ADDED: flush(), not clear() -- clear() would silently discard whatever position change was
  // still pending inside the 250ms debounce window at the moment this unmounts (e.g. exiting the reader
  // via in-app navigation rather than a full page reload), leaving the server's saved position up to one
  // debounce interval stale. flush() runs the pending save immediately instead of dropping it.
  //
  // That React-unmount cleanup alone isn't enough, though: exitReader below navigates away via a hard
  // `window.location.href` assignment, not client-side routing, and on mobile in particular the page can
  // be torn down (backgrounded/killed) before a pending React effect cleanup gets a chance to run at all
  // -- the exact same problem useReadingTimer.ts already solved for the reading-time counter. pagehide
  // fires reliably in both cases (hard nav and mobile backgrounding); visibilitychange's "hidden" state
  // covers app-switch-without-navigating, which pagehide alone would miss.
  useEffect(() => {
    const flush = () => debouncedSavePosition.flush();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [debouncedSavePosition]);

  const listeners: EpubNavigatorListeners = useMemo(() => ({
    // CLAUDE-ADDED: Applies the current horizontal margin to every freshly-loaded frame -- see useMarginSync.ts (keeps already-loaded frames in sync when the setting changes).
    frameLoaded: async function (wnd: Window): Promise<void> {
      applyMargin(wnd, cache.current.settings.marginHorizontal);
      // CLAUDE-ADDED: A freshly-loaded frame's noteHoverScript has no data yet -- the notes-changed
      // effect below only broadcasts to frames that are *already* live at the time notes change, so a
      // new frame needs its own, one-time push of whatever the current entries are.
      wnd.postMessage({ type: NOTE_HOVER_MESSAGE_TYPE, notes: noteHoverEntriesRef.current }, "*");
    },
    positionChanged: async function (locator: Locator): Promise<void> {
      // CLAUDE-ADDED: correctPositionAround's requestFirstVisibleLocator (useEpubNavigator.ts) triggers
      // EpubNavigator's own "first_visible_locator" round trip as a side effect, which fires this same
      // positionChanged listener with a priming locator that has no locations.position/progression at
      // all (see findFirstVisibleLocator in @readium/navigator-html-injectables -- href is hardcoded to
      // "#", locations only ever carries a cssSelector). Every real, settled position update in this
      // library -- syncLocation's scroll/paginate reporting, changeResource's page turns -- always comes
      // from a positions-list entry and therefore always has .position set, so this is a safe filter
      // that only drops that one synthetic priming event. Without it, whichever of these four listeners
      // last received an event before correctPositionAround's own corrective go() lands (up to a few
      // frames later, sometimes longer on slow devices) could act on/persist this position-less locator
      // -- debouncedSavePosition in particular could flush it to the server as the resume position.
      if (locator.locations?.position === undefined) return;

      debouncedSavePosition(locator);

      // CLAUDE-ADDED: Not debounced, unlike the above -- the pairing/auto-advance logic in useShortImageSpread needs to react to every single position change in sequence to correctly detect "user paged past an already-shown pair".
      evaluateSpread(locator);

      // CLAUDE-ADDED: See notifyExactPageCountRef's declaration above for why this is a ref call.
      notifyExactPageCountRef.current(locator);
      notifyReadingSpeedRef.current(locator);
    },
    // CLAUDE-ADDED: tap/click only ever fire when the iframe's selection is collapsed at pointerup (see
    // Peripherals.onPointUp's own early returns) -- i.e. never on the same pointerup that just produced
    // a real text selection -- so clearing pendingSelection here is exactly "closed the popover because
    // the user deselected or tapped elsewhere", never a race with opening a fresh one. This is also the
    // only signal available for that: the popover's own "click outside" listener is on the parent
    // document, which never sees pointerdown events that happen inside the cross-origin reading iframe.
    tap: function (_e: FrameClickEvent): boolean {
      dispatch(setPendingSelection(null));
      if (handleImageClick(_e)) return true;
      handleTap(_e);
      return true;
    },
    click: function (_e: FrameClickEvent): boolean {
      dispatch(setPendingSelection(null));
      if (handleImageClick(_e)) return true;
      handleClick(_e);
      return true;
    },
    zoom: function (_scale: number): void {},
    miscPointer: function (_amount: number): void {},
    scroll: function (_delta: number): void {
      if (
        cache.current.settings.scroll && 
        navLayout() !== Layout.fixed
      ) {        
        if (isScrollStart() || isScrollEnd()) {
          if (
            // Keep consistent with pagination behavior
            cache.current.layoutUI === ThLayoutUI.layered
          ) {
            dispatch(setScrollAffordance(true));
          }
        } else if (!cache.current.isImmersive && _delta > 20) {
          if (preferences.affordances.scroll.hideOnForwardScroll) {
            dispatch(setImmersive(true));
          }
        } else if (cache.current.isImmersive && _delta < -20) {
          if (
            // Keep consistent with pagination behavior
            cache.current.layoutUI === ThLayoutUI.layered && 
            preferences.affordances.scroll.showOnBackwardScroll
          ) {
            dispatch(setImmersive(false));
          }
        }
      }
    },
    customEvent: function (_key: string, _data: unknown): void {},
    handleLocator: function (locator: Locator): boolean {
      const href = locator.href;

      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        if (confirm(`Open "${href}" ?`)) window.open(href, "_blank");
      } else {
        console.warn("Unhandled locator", locator);
      }
      return false;
    },
    // CLAUDE-ADDED: Builds a Locator anchored on the selection's text (plus before/after context from
    // the patch-package patch on @readium/navigator-html-injectables -- see Peripherals.ts) rather than
    // the tracked reading position, since the two can diverge on a long scrolled/paginated resource.
    // Readium's own decoration renderer resolves this via text search (rangeFromLocator), so href +
    // text is all a highlight/note/selection-bookmark Locator actually needs.
    textSelected: function (selection: BasicTextSelection): void {
      const base = currentLocator();
      if (!base || !selection.text) return;

      const locator = new Locator({
        href: base.href,
        type: base.type,
        title: base.title,
        locations: base.locations,
        text: new LocatorText({
          highlight: selection.text,
          before: selection.before,
          after: selection.after
        })
      });

      // CLAUDE-ADDED: selection.x/y are relative to the reading iframe's own content window (they come
      // from a Range inside that document), not the parent page -- translate to page-absolute
      // coordinates via the iframe element's own bounding rect so SelectionPopover needs no cross-origin
      // DOM access. Picks the first iframe in the container; in two-column/paired-spread layouts with
      // more than one mounted iframe this can target the wrong one -- acceptable v1 simplification.
      const iframeRect = container.current?.querySelector("iframe")?.getBoundingClientRect();

      dispatch(setPendingSelection({
        locator: locator.serialize(),
        text: selection.text,
        x: (iframeRect?.left ?? 0) + selection.x,
        y: (iframeRect?.top ?? 0) + selection.y,
        width: selection.width,
        height: selection.height,
        chapterTitle: resolveChapterTitle(timelineItemsRef.current, base.href)
      }));
    },
    contentProtection: function (_type: string, _data: SuspiciousActivityEvent): void {},
    contextMenu: function (_data: ContextMenuEvent): void {},
    peripheral: function (data: KeyboardPeripheralEventData): void {
      switch (data.type) {
        case NavPeripheralType.progressForward:  goProgression(false); break;
        case NavPeripheralType.progressBackward: goProgression(true);  break;
        case NavPeripheralType.moveRight:        moveTo("right");      break;
        case NavPeripheralType.moveLeft:         moveTo("left");       break;
        case NavPeripheralType.moveUp:           moveTo("up");         break;
        case NavPeripheralType.moveDown:         moveTo("down");       break;
        case NavPeripheralType.moveHome:         moveTo("home");       break;
        case NavPeripheralType.moveEnd:          moveTo("end");        break;
        case NavPeripheralType.zoomIn:           zoomIn();             break;
        case NavPeripheralType.zoomOut:          zoomOut();            break;
        case NavPeripheralType.exitReader:       exitReader();         break;
        default: {
          const actionKey = fromActionPeripheralType(data.type);

          if (actionKey === ThActionsKeys.fullscreen) {
            // CLAUDE-ADDED: See correctPositionAround's own comment -- a fullscreen toggle resizes the
            // viewport, which can trip the vendor navigator's imprecise reflow auto-snap the same way a
            // font-size change does.
            correctPositionAround(() => handleFullscreen());
            return;
          }

          if (actionKey && profile) {
            dispatch(toggleActionOpen({ key: actionKey, profile }));
            return;
          }

          const dockingKey = fromDockingPeripheralType(data.type);

          if (dockingKey && profile) {
            const actionKey = getFocusedDockableKey(dockingKey as ThDockingKeys);
            if (actionKey) {
              dispatch(dockAction({ key: actionKey, dockingKey: dockingKey as ThDockingKeys, profile }));
            }
          }
        }
      }
    },
  }), [navLayout, debouncedSavePosition, dispatch, handleTap, handleClick, handleImageClick, cache, preferences.affordances.scroll, isScrollStart, isScrollEnd, moveTo, goProgression, zoomIn, zoomOut, exitReader, profile, handleFullscreen, correctPositionAround, getFocusedDockableKey, evaluateSpread, currentLocator]);
  
  const initialPosition = useMemo(() => getLocalData(), [getLocalData]);

  // Initialize reader using the new composite hook
  const { navigatorReady } = useEpubReaderInit({
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
    contentProtectionConfig: resolveContentProtectionConfig(preferences.contentProtection, t),

    onNavigatorReady: () => {
      dispatch(setLoading(false));
    }
  });

  // CLAUDE-ADDED: Renders saved highlights/notes as decorations whenever the underlying Redux lists
  // change (annotationsReducer, hydrated on book open by loadAnnotations) or the navigator (re)mounts --
  // applyDecorations diffs against the previous list for that group internally, so this is safe to call
  // on every render of the effect without manually tracking what's already applied.
  useEffect(() => {
    if (!navigatorReady) return;

    const highlightDecorations = highlights
      .map(highlightToDecoration)
      .filter((decoration): decoration is Decoration => decoration !== null);

    applyDecorations(highlightDecorations, "highlights");
  }, [navigatorReady, highlights, applyDecorations]);

  useEffect(() => {
    if (!navigatorReady) return;

    const noteDecorations = notes
      .map(noteToDecoration)
      .filter((decoration): decoration is Decoration => decoration !== null);

    applyDecorations(noteDecorations, "notes");
  }, [navigatorReady, notes, applyDecorations]);

  // CLAUDE-ADDED: Posts the current notes' quote/preview text directly to every currently-live reading
  // iframe for noteHoverScript.ts (injected into every resource) to pick up -- see that file's own
  // comment for why postMessage rather than localStorage (some publisher-prepared EPUBs, Kobo-formatted
  // ones in particular, embed their own script that replaces window.localStorage with a fake stub,
  // silently breaking any feature that depends on it). noteHoverEntriesRef mirrors the computed entries
  // so frameLoaded below can hand them to a *newly*-loaded frame without needing `notes` in the
  // `listeners` useMemo's own dependency array.
  useEffect(() => {
    const NOTE_PREVIEW_LENGTH = 120;
    const entries: NoteHoverEntry[] = notes
      .map(note => {
        const quote = Locator.deserialize(note.locator)?.text?.highlight;
        if (!quote) return null;
        const preview = note.text.length > NOTE_PREVIEW_LENGTH
          ? `${ note.text.slice(0, NOTE_PREVIEW_LENGTH) }…`
          : note.text;
        const timestamp = formatTimestamp(note.updatedAt ?? note.createdAt);
        return { id: note.id, quote, preview, timestamp };
      })
      .filter((entry): entry is NoteHoverEntry => entry !== null);

    noteHoverEntriesRef.current = entries;

    getCframes()?.forEach(frame => {
      frame?.window?.postMessage({ type: NOTE_HOVER_MESSAGE_TYPE, notes: entries }, "*");
    });
  }, [notes, getCframes]);

  // CLAUDE-ADDED: Creating a highlight (or saving/cancelling a note from the selection popover) leaves
  // the reading iframe's native window.getSelection() non-collapsed -- it's the same drag-selection that
  // triggered the popover in the first place, and nothing ever explicitly clears it once the popover
  // closes. Peripherals.onPointUp's own `!selection?.isCollapsed` guard then silently swallows the very
  // next tap/click anywhere in the content (no "tap"/"click" comms message is sent at all, so
  // setPendingSelection(null) never dispatches from there), even though that same click *does* collapse
  // the stale selection as a side effect -- so a second click was needed to actually register. Clearing
  // the selection ourselves the moment the popover closes (pendingSelection: something -> null) means the
  // very next click is a normal, first-time close.
  const pendingSelectionRef = useRef(pendingSelection);
  useEffect(() => {
    if (pendingSelectionRef.current && !pendingSelection) {
      getCframes()?.forEach(frame => frame?.window?.getSelection()?.removeAllRanges());
    }
    pendingSelectionRef.current = pendingSelection;
  }, [pendingSelection, getCframes]);

  // CLAUDE-ADDED: Briefly re-decorates a jump target (set by StatefulAnnotationsContainer right after
  // navigating there) in a dedicated "flash" group so it's easy to spot after a jump from the
  // Annotations panel -- cleared via the same applyDecorations([], group) call the decoration API
  // already uses to remove a group, then the Redux flag is cleared so it doesn't refire on rerender.
  useEffect(() => {
    if (!navigatorReady || !flashLocator) return;

    const locator = Locator.deserialize(flashLocator);
    if (!locator) {
      dispatch(setFlashLocator(null));
      return;
    }

    applyDecorations([{
      id: "flash",
      locator,
      style: { tint: "#FF6B35", layout: "bounds", width: "wrap" } as Decoration["style"]
    }], "flash");

    const timeout = window.setTimeout(() => {
      applyDecorations([], "flash");
      dispatch(setFlashLocator(null));
    }, 1300);

    return () => window.clearTimeout(timeout);
  }, [navigatorReady, flashLocator, applyDecorations, dispatch]);

  // CLAUDE-ADDED: Tapping an existing highlight opens the same SelectionPopover used for a fresh
  // selection, just with `existing` set so it shows edit-color/delete instead of the initial
  // color/bookmark/note choices -- see SelectionPopover.tsx. Tapping an existing *note* instead opens
  // NoteOverlay, which reads it before offering a begin-editing button (see annotationsReducer.ts's
  // noteOverlay state) -- unlike a highlight, a note has content worth reading before deciding to edit it.
  useEffect(() => {
    if (!navigatorReady) return;

    const highlightObserver = {
      onDecorationActivated: (event: DecorationActivationEvent): boolean => {
        // CLAUDE-ADDED: Despite the type doc's "navigator container coordinates" claim, the actual
        // bundled implementation (inside @readium/navigator's dist) reports event.rect as the
        // decoration's Range.getBoundingClientRect() *within the reading iframe's own viewport*,
        // multiplied by devicePixelRatio -- the same scaling Peripherals applies to tap/click x/y.
        // Needs the same iframe-rect + DPR conversion as the text-selection path in `textSelected`
        // below, not the outer container's rect (which double-counts/omits the iframe's own offset
        // and left the popover positioned nowhere near the actual highlighted text).
        const iframeRect = container.current?.querySelector("iframe")?.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const rect = event.rect;
        dispatch(setPendingSelection({
          locator: event.decoration.locator.serialize(),
          text: event.decoration.locator.text?.highlight ?? "",
          x: (iframeRect?.left ?? 0) + (rect?.left ?? 0) / dpr,
          y: (iframeRect?.top ?? 0) + (rect?.top ?? 0) / dpr,
          width: (rect?.width ?? 0) / dpr,
          height: (rect?.height ?? 0) / dpr,
          chapterTitle: resolveChapterTitle(timelineItemsRef.current, event.decoration.locator.href),
          existing: { type: "highlight", id: event.decoration.id }
        }));
        // CLAUDE-ADDED: Returning true here is documented as "suppresses normal tap/click navigation",
        // implemented via a `_decorationActivationConsumed` flag (inside @readium/navigator's bundled
        // dist) that's meant to swallow the one tap/click message accompanying this same activation.
        // But Peripherals sends that tap/click *before* Decorator sends decoration_activated for the
        // same pointerup (Peripherals mounts before the Decorator module, so its listener attaches --
        // and therefore fires -- first), so the flag actually arms too late to catch its intended
        // target and instead swallows the *next* unrelated click/tap, whenever that happens to be --
        // which is what made closing this popover by clicking elsewhere require two clicks (the first
        // silently consumed the stale flag, only the second one actually reached tap/click). Returning
        // false avoids arming it at all; the accompanying tap/click's own side effects (chrome
        // toggle/page-turn) already run independently of this return value, so nothing is lost.
        return false;
      }
    };

    const noteObserver = {
      onDecorationActivated: (event: DecorationActivationEvent): boolean => {
        dispatch(openNoteOverlay(event.decoration.id));
        return false;
      }
    };

    registerDecorationObserver("highlights", highlightObserver);
    registerDecorationObserver("notes", noteObserver);

    return () => {
      unregisterDecorationObserver(highlightObserver);
      unregisterDecorationObserver(noteObserver);
    };
  }, [navigatorReady, registerDecorationObserver, unregisterDecorationObserver, dispatch]);

  // CLAUDE-ADDED: Test/spike for an "exact" page-turn count -- see useExactPageCount.ts. Signature string covers every setting that can change how many columns of content fit per screen, so the full-book measurement pass only reruns when one of them actually changes, not on every render.
  const exactPageCountLayoutSignature = useMemo(() => JSON.stringify({
    textAlign, columnCount, fontFamily, fontSize, fontWeight, hyphens, letterSpacing, ligatures,
    lineLength, lineHeight, noRuby, paragraphIndent, paragraphSpacing, publisherStyles,
    textNormalization, wordSpacing, theme, colorScheme
  }), [
    textAlign, columnCount, fontFamily, fontSize, fontWeight, hyphens, letterSpacing, ligatures,
    lineLength, lineHeight, noRuby, paragraphIndent, paragraphSpacing, publisherStyles,
    textNormalization, wordSpacing, theme, colorScheme
  ]);

  const exactPageCount = useExactPageCount({
    publication,
    isFXL,
    isScroll,
    navigatorReady,
    enabled: true,
    getCframes,
    currentLocator,
    layoutSignature: exactPageCountLayoutSignature
  });

  notifyExactPageCountRef.current = exactPageCount.notifyLocatorChanged;

  useEffect(() => {
    if (exactPageCount.elapsedMs !== null) {
      console.info(
        `[ExactPageCount] ${ exactPageCount.currentPageRange?.join("-") }/${ exactPageCount.totalPages } pages ` +
        `across ${ exactPageCount.resourceCount } resources, computed in ${ Math.round(exactPageCount.elapsedMs) }ms`
      );
    }
    if (exactPageCount.error) {
      console.warn(`[ExactPageCount] failed: ${ exactPageCount.error }`);
    }
  }, [exactPageCount.elapsedMs, exactPageCount.error, exactPageCount.currentPageRange, exactPageCount.totalPages, exactPageCount.resourceCount]);

  // CLAUDE-ADDED: Dispatched independently of setTimeline/unstableTimeline -- useExactPageCount is called
  // after useTimeline in this component (it needs navigatorReady), so it can't feed into useTimeline's own
  // props without an awkward hook reorder. The footer and "Go to position" dialog read this directly via
  // state.publication.exactPageCount.
  useEffect(() => {
    dispatch(setExactPageCount({
      totalPages: exactPageCount.totalPages,
      currentPageRange: exactPageCount.currentPageRange,
      resourcePages: exactPageCount.resourcePages
    }));
  }, [dispatch, exactPageCount.totalPages, exactPageCount.currentPageRange, exactPageCount.resourcePages]);

  const applyConstraint = useCallback(async (value: number) => {
    await submitPreferences({
      constraint: value
    })
  }, [submitPreferences]);

  useLayoutEffect(() => {
    if (!navigatorReady) return;

    applyConstraint(arrowsOccupySpace ? arrowsWidth.current : 0)
      .catch(console.error);
  }, [arrowsOccupySpace, applyConstraint, navigatorReady]);

  // Theme can also change on colorScheme change so
  // we have to handle this side-effect but we can’t
  // from the ReadingDisplayTheme component since it
  // would have to be mounted for this to work
  useLayoutEffect(() => {
    if (!navigatorReady) return;

    if (cache.current.colorScheme !== colorScheme) {
      cache.current.colorScheme = colorScheme;
    }

    const theme = isFXL ? (themeObject.fxl ?? "auto") : (themeObject.reflow ?? "auto");

    // Protecting against re-applying on theme change
    if (theme !== "auto" && previousTheme !== theme) return;

    const applyCurrentTheme = async () => {
      const themeKeys = isFXL ? fxlThemeKeys : reflowThemeKeys;
      const themeKey = themeKeys.includes(theme as any) ? theme : "auto";
      const themeProps = buildThemeObject<ThemeKeyType>({
        theme: themeKey,
        themeKeys: preferences.theming.themes.keys,
        systemThemes: preferences.theming.themes.systemThemes,
        colorScheme
      });
      await submitPreferences(themeProps);
      dispatch(setTheme({ 
        key: isFXL ? "fxl" : "reflow", 
        value: themeKey 
      }));
    };

    applyCurrentTheme()
      .catch(console.error);
  }, [cache, themeObject, previousTheme, preferences.theming.themes, fxlThemeKeys, reflowThemeKeys, colorScheme, isFXL, submitPreferences, dispatch, navigatorReady]);

  useLayoutEffect(() => {
    dispatch(setDirection(uiDirection as ThLayoutDirection));
    dispatch(setPlatformModifier(getPlatformModifier()));
  }, [uiDirection, dispatch]);

  return (
    <>
    <NavigatorProvider visualNavigator={ epubNavigator }>
      <main className={ readerStyles.main }>
        <StatefulDockingWrapper>
          <div
            ref={ containerRefSetter }
            className={
              getReaderClassNames({
                isScroll,
                isImmersive,
                isHovering: isHovering || chromeAlwaysVisible,
                isFXL,
                layoutUI,
                breakpoint,
                containerBreakpoint
              })
            }
          >
            <StatefulReaderHeader 
              actionKeys={ isFXL ? fxlActionKeys : reflowActionKeys }
              actionsOrder={ isFXL ? preferences.actions.fxlOrder : preferences.actions.reflowOrder }
              layout={ layoutUI }
              runningHeadFormatPref={
                isFXL 
                  ? preferences.theming.header?.runningHead?.format?.fxl 
                  : preferences.theming.header?.runningHead?.format?.reflow
              } 
            />

          { !isScroll 
            ? <nav className={ classNames(arrowStyles.container, arrowStyles.leftContainer) }>
                <StatefulReaderArrowButton 
                  direction="left" 
                  isDisabled={ isRTL ? atPublicationEnd : atPublicationStart } 
                  onPress={ () => {
                    const navigationCallback = () => {
                      dispatch(setUserNavigated(true));
                      activateImmersiveOnAction();
                    };
                    goLeft(!reducedMotion, navigationCallback);
                  }}
                />
            </nav> 
            : <></> }

            <article className={ readerStyles.wrapper } aria-label={ t("reader.app.publicationWrapper") }>
              <div id="thorium-web-container" className={ readerStyles.iframeContainer } ref={ container }></div>
              { /* CLAUDE-ADDED: Rendered as a sibling, not a child, of #thorium-web-container -- that div's contents are managed imperatively by @readium/navigator, so React must never reconcile children into it directly. */ }
              <PairedSpreadOverlay pair={ spreadPair } />
            </article>

          { !isScroll
            ? <nav className={ classNames(arrowStyles.container, arrowStyles.rightContainer) }>
                <StatefulReaderArrowButton 
                  direction="right" 
                  isDisabled={ isRTL ? atPublicationStart : atPublicationEnd } 
                  onPress={ () => {
                    const navigationCallback = () => {
                      dispatch(setUserNavigated(true));
                      activateImmersiveOnAction();
                    };
                    goRight(!reducedMotion, navigationCallback);
                  }}
                />
              </nav> 
            : <></> }

          <StatefulReaderFooter 
            layout={ layoutUI } 
            progressionFormatPref={
              isFXL 
                ? preferences.theming.progression?.format?.fxl 
                : preferences.theming.progression?.format?.reflow
            }
            progressionFormatFallback={
              isFXL 
                ? ThProgressionFormat.readingOrderIndex
                : ThProgressionFormat.resourceProgression
            }
          />
        </div>
      </StatefulDockingWrapper>
    </main>
    <SelectionPopover />
    <NoteOverlay />
    <StatefulImageOverlay />
  </NavigatorProvider>
  </>
)};