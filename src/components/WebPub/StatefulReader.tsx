"use client";

import { useState, useRef, useCallback, useMemo, useLayoutEffect, useEffect } from "react";

import readerStyles from "../assets/styles/thorium-web.reader.app.module.css";

import { StatefulReaderProps } from "../Reader/StatefulReaderWrapper";

import {
  ThLayoutUI,
  ThDocumentTitleFormat,
  ThProgressionFormat,
  ThSpacingSettingsKeys,
  ThSettingsKeys,
  ThDockingKeys,
  ThActionsKeys
} from "@/preferences/models";

import { ThPluginRegistry } from "../Plugins/PluginRegistry";

import { ThPluginProvider } from "../Plugins/PluginProvider";
import { NavigatorProvider } from "@/core/Navigator";

import {
  BasicTextSelection,
  ContextMenuEvent,
  FrameClickEvent,
  SuspiciousActivityEvent,
} from "@readium/navigator-html-injectables";
import { WebPubNavigatorListeners } from "@readium/navigator";
import {
  Locator,
  Profile,
  Publication
} from "@readium/shared";

import { StatefulDockingWrapper } from "../Docking/StatefulDockingWrapper";
import { StatefulReaderHeader } from "../StatefulReaderHeader";
import { StatefulReaderFooter } from "../StatefulReaderFooter";
import { PositionStorage } from "../Reader/StatefulReaderWrapper";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useSettingsComponentStatus } from "@/components/Settings/hooks/useSettingsComponentStatus";
import { useWebPubNavigator } from "@/core/Hooks/WebPub";
import { useWebPubSettingsCache } from "@/core/Hooks/WebPub/useWebPubSettingsCache";
import { useWebPubReaderInit } from "./Hooks/useReaderInit";
import { useWebPubKeyboardPeripherals } from "./Hooks/useWebPubKeyboardPeripherals";
import { useFullscreen } from "@/core/Hooks/useFullscreen";
import { useI18n } from "@/i18n/useI18n";
import { useTimeline } from "@/core/Hooks/useTimeline";
import { usePositionStorage } from "@/hooks/usePositionStorage";
import { useDocumentTitle } from "@/core/Hooks/useDocumentTitle";
import { useSpacingPresets } from "../Settings/Spacing/hooks/useSpacingPresets";
import { useFonts } from "@/core/Hooks/fonts/useFonts";
import { useZoomCallbacks } from "@/components/Settings/hooks/useZoomCallbacks";
import { useFocusedDockableKey } from "../Docking/hooks/useFocusedDockableKey";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import {
  setLoading,
  setHovering, 
  toggleImmersive, 
  setFullscreen,
} from "@/lib/readerReducer";
import { 
  setTimeline,
  setPublicationStart,
  setPublicationEnd
} from "@/lib/publicationReducer";
import { toggleActionOpen, dockAction } from "@/lib/actionsReducer";

import classNames from "classnames";
import debounce from "debounce";
import { createDefaultPlugin } from "../Plugins/helpers/createDefaultPlugin";
import { getReaderClassNames } from "../Helpers/getReaderClassNames";
import { resolveContentProtectionConfig } from "@/preferences/models/protection";
import { NavPeripheralType, fromActionPeripheralType, fromDockingPeripheralType } from "@/helpers/peripherals";

export const ExperimentalWebPubStatefulReader = ({
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
  const { preferences, getFontMetadata, getFontInjectables } = usePreferences();
  const { t } = useI18n();
  const { getEffectiveSpacingValue } = useSpacingPresets();
  const { injectFontResources, removeFontResources } = useFonts();

  // Check if font family component is being used
  const { isComponentUsed: isFontFamilyUsed } = useSettingsComponentStatus({
    settingsKey: ThSettingsKeys.fontFamily,
    publicationType: "webpub",
  });

  const container = useRef<HTMLDivElement>(null);

  // CLAUDE-ADDED: Comic (CBZ/Divina) pages render as a bare <img> in an otherwise unstyled iframe
  // document -- there's no readium-css theming for that content, and @readium/navigator's own
  // per-frame placeholder background is hardcoded white while a page is loading/off-frame. Detecting
  // Divina here (rather than adding a new global ReaderProfile value, which other code switches on)
  // lets the CSS below default the comic reader to a dark surround without touching PDF, the other
  // publication type this same webPub reader handles.
  const isComic = publication.metadata.conformsTo?.includes(Profile.DIVINA) ?? false;

  const textAlign = useAppSelector(state => state.webPubSettings.textAlign);
  const fontFamily = useAppSelector(state => state.webPubSettings.fontFamily);
  const fontWeight = useAppSelector(state => state.webPubSettings.fontWeight);
  const hyphens = useAppSelector(state => state.webPubSettings.hyphens);
  const ligatures = useAppSelector(state => state.webPubSettings.ligatures);
  const noRuby = useAppSelector(state => state.webPubSettings.noRuby);
  const letterSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.letterSpacing);
  const lineHeight = getEffectiveSpacingValue(ThSpacingSettingsKeys.lineHeight);
  const paragraphIndent = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphIndent);
  const paragraphSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.paragraphSpacing);
  const publisherStyles = useAppSelector(state => state.webPubSettings.publisherStyles);
  const textNormalization = useAppSelector(state => state.webPubSettings.textNormalization);
  const wordSpacing = getEffectiveSpacingValue(ThSpacingSettingsKeys.wordSpacing);
  const zoom = useAppSelector(state => state.webPubSettings.zoom);
  const fontLanguage = useAppSelector(state => state.publication.fontLanguage);
  const hasDisplayTransformability = useAppSelector(state => state.publication.hasDisplayTransformability);
  const isImmersive = useAppSelector(state => state.reader.isImmersive);
  const isHovering = useAppSelector(state => state.reader.isHovering);
  const breakpoint = useAppSelector(state => state.theming.breakpoint);
  const containerBreakpoint = useAppSelector(state => state.theming.containerBreakpoint);

  const cache = useWebPubSettingsCache(
    fontFamily,
    fontWeight,
    hyphens,
    letterSpacing,
    ligatures,
    lineHeight,
    noRuby,
    paragraphIndent,
    paragraphSpacing,
    publisherStyles,
    textAlign,
    textNormalization,
    wordSpacing,
    zoom
  );

  const layoutUI = preferences.theming.layout.ui?.webPub || ThLayoutUI.stacked;

  const dispatch = useAppDispatch();
  const getFocusedDockableKey = useFocusedDockableKey();
  const profile = useAppSelector(state => state.reader.profile);
  const actionsState = useAppSelector(state => profile ? state.actions.keys[profile] : undefined);
  const keyboardPeripherals = useWebPubKeyboardPeripherals();

  const onFsChange = useCallback((isFullscreen: boolean) => {
    dispatch(setFullscreen(isFullscreen));
  }, [dispatch]);
  
  const { handleFullscreen } = useFullscreen(onFsChange);

  const webPubNavigator = useWebPubNavigator();
  const { 
    currentPositions,
    canGoBackward,
    canGoForward,
  } = webPubNavigator;

  const { setLocalData, getLocalData, localData } = usePositionStorage(localDataKey, positionStorage);

  const timeline = useTimeline({
    publication: publication,
    currentLocation: localData,
    currentPositions: currentPositions() || [],
    positionsList: undefined,
    onChange: (timeline) => {
      dispatch(setTimeline(timeline));
    }
  });

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

  const toggleIsImmersive = useCallback(() => {
    // If tap/click in iframe, then header/footer no longer hoovering
    dispatch(setHovering(false));
    dispatch(toggleImmersive());
  }, [dispatch]);

  const { zoomIn, zoomOut } = useZoomCallbacks(webPubNavigator);

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

  // CLAUDE-ADDED: positionChanged previously called setLocalData on every single event with no
  // debounce at all -- fine for a synchronous localStorage write, but expensive once it's a network
  // call (see StatefulReader.tsx's Epub counterpart for the same fix).
  const debouncedSavePosition = useMemo(
    () => debounce((locator: Locator) => setLocalData(locator), 250),
    [setLocalData]
  );

  useEffect(() => () => debouncedSavePosition.clear(), [debouncedSavePosition]);

  const listeners: WebPubNavigatorListeners = useMemo(() => ({
    frameLoaded: async function (_wnd: Window): Promise<void> {},
    positionChanged: async function (locator: Locator): Promise<void> {
      debouncedSavePosition(locator);

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
    },
    tap: function (_e: FrameClickEvent): boolean {
      toggleIsImmersive();
      return true;
    },
    click: function (_e: FrameClickEvent): boolean {
      return false;
    },
    zoom: function (_scale: number): void { },
    scroll: function (_delta: number): void { },
    customEvent: function (_key: string, _data: unknown): void { },
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
    textSelected: function (_selection: BasicTextSelection): void {},
    contentProtection: function (_type: string, _data: SuspiciousActivityEvent): void {},
    contextMenu: function (_data: ContextMenuEvent): void {},
    peripheral: function (data): void {
      switch (data.type) {
        case NavPeripheralType.zoomIn:     zoomIn();     break;
        case NavPeripheralType.zoomOut:    zoomOut();    break;
        case NavPeripheralType.exitReader: exitReader(); break;
        default: {
          const actionKey = fromActionPeripheralType(data.type);

          if (actionKey === ThActionsKeys.fullscreen) {
            handleFullscreen();
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
  }), [debouncedSavePosition, canGoBackward, canGoForward, dispatch, toggleIsImmersive, zoomIn, zoomOut, exitReader, profile, handleFullscreen, getFocusedDockableKey]);

  const initialPosition = useMemo(() => getLocalData(), [getLocalData]);

  // Initialize reader using the new composite hook
  useWebPubReaderInit({
    container,
    publication,
    initialPosition,
    listeners,
    preferences,
    cache,
    isFontFamilyUsed,
    fontLanguage,
    hasDisplayTransformability,
    getFontMetadata,
    injectFontResources,
    removeFontResources,
    getFontInjectables,
    contentProtectionConfig: resolveContentProtectionConfig(preferences.contentProtection, t),
    keyboardPeripherals,
    onNavigatorReady: () => {
      dispatch(setLoading(false));
    },
  });

  return (
    <>
    <NavigatorProvider visualNavigator={ webPubNavigator }>
      <main className={ readerStyles.main }>
        <StatefulDockingWrapper>
          <div
            ref={ containerRefSetter }
            className={
              classNames(
                getReaderClassNames({
                  isScroll: true,
                  isImmersive,
                  isHovering,
                  layoutUI,
                  breakpoint,
                  containerBreakpoint
                }),
                isComic && readerStyles.comicReader
              )
            }
          >
            <StatefulReaderHeader 
              actionKeys={ preferences.actions.webPubOrder }
              actionsOrder={ preferences.actions.webPubOrder }
              layout={ layoutUI } 
              runningHeadFormatPref={ preferences.theming.header?.runningHead?.format?.webPub }
            />

            <article className={ readerStyles.wrapper } aria-label={ t("reader.app.publicationWrapper") }>
              <div id="thorium-web-container" className={ readerStyles.iframeContainer } ref={ container }></div>
            </article>

          <StatefulReaderFooter 
            layout={ layoutUI } 
            progressionFormatPref={ preferences.theming.progression?.format?.webPub }
            progressionFormatFallback={ ThProgressionFormat.readingOrderIndex }
          />
        </div>
      </StatefulDockingWrapper>
    </main>
  </NavigatorProvider>
  </>
)};