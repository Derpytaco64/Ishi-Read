"use client";

import React from "react";

import { ActionKeyType } from "@/preferences";
import { ThLayoutUI, ThRunningHeadFormat } from "@/preferences/models";
import { ThFormatPref } from "@/preferences";

import readerStyles from "./assets/styles/thorium-web.reader.app.module.css";
import readerHeaderStyles from "./assets/styles/thorium-web.reader.header.module.css";
import overflowMenuStyles from "./Actions/assets/styles/thorium-web.overflow.module.css";

import { ThHeader } from "@/core/Components/Reader/ThHeader";
import { StatefulBackLink } from "./StatefulBackLink";
import { StatefulReaderRunningHead } from "./StatefulReaderRunningHead";
import { ThInteractiveOverlay } from "../core/Components/Reader/ThInteractiveOverlay";
import { StatefulCollapsibleActionsBar } from "./Actions/StatefulCollapsibleActionsBar";

import { useReaderHeaderBase } from "./hooks/useReaderHeaderBase";
import { usePreferences } from "@/preferences/hooks";

import { useAppSelector } from "@/lib/hooks";
import { anyUIElementPinned } from "@/lib/globalPreferencesReducer";

import classNames from "classnames";

export const StatefulReaderHeader = ({
  actionKeys,
  actionsOrder,
  layout,
  runningHeadFormatPref
}: {
  actionKeys: ActionKeyType[];
  actionsOrder: ActionKeyType[];
  layout: ThLayoutUI;
  runningHeadFormatPref?: ThFormatPref<ThRunningHeadFormat>;
}) => {
  const {
    headerRef, focusWithinProps, setHover, removeHover,
    listActionItems, isImmersive, isHovering, isScroll, t,
  } = useReaderHeaderBase(actionKeys);

  const { preferences } = usePreferences();

  // CLAUDE-ADDED: See StatefulUIVisibilityToggles.tsx / StatefulReaderFooter.tsx's equivalent comment.
  const keepChromeVisible = useAppSelector(state => state.globalPreferences.keepChromeVisible);
  // CLAUDE-ADDED: See anyUIElementPinned's own comment in globalPreferencesReducer.ts -- pinning any one
  // of backLink/runningHead/overflowMenu/readingTimer keeps the whole header bar from fading, same as
  // keepChromeVisible alone already does (they share one CSS slide transform, not independent ones).
  const uiElementVisibility = useAppSelector(state => state.globalPreferences.uiElementVisibility);
  const headerAlwaysVisible = keepChromeVisible || anyUIElementPinned(uiElementVisibility);

  return (
    <>
      <ThInteractiveOverlay
        className={ classNames(readerStyles.barOverlay, readerStyles.headerOverlay) }
        isActive={ layout === ThLayoutUI.layered && isImmersive && !isHovering && !headerAlwaysVisible }
        onMouseEnter={ setHover }
        onMouseLeave={ removeHover }
      />

      <ThHeader
        ref={ headerRef }
        className={ classNames(readerStyles.topBar, readerHeaderStyles.header) }
        aria-label={ t("reader.app.header.label") }
        onMouseEnter={ setHover }
        onMouseLeave={ removeHover }
        { ...focusWithinProps }
      >
        { preferences.theming.header?.backLink &&
          <StatefulBackLink className={ readerHeaderStyles.backlinkWrapper } />
        }

        <StatefulReaderRunningHead formatPref={ runningHeadFormatPref } />

        <StatefulCollapsibleActionsBar
          id="reader-header-overflowMenu"
          items={ listActionItems() }
          prefs={{ ...preferences.actions, displayOrder: actionsOrder }}
          className={ readerHeaderStyles.actionsWrapper }
          aria-label={ t("reader.app.header.actions") }
          overflowMenuClassName={
            classNames(
              (!isScroll || preferences.affordances.scroll.hintInImmersive) && overflowMenuStyles.hint
            )
          }
        />
      </ThHeader>
    </>
  );
};
