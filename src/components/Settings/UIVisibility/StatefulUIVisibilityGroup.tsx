"use client";

import { useCallback } from "react";

import settingsStyles from "../assets/styles/thorium-web.reader.settings.module.css";
import readerSharedUI from "../../assets/styles/thorium-web.button.module.css";

import { ThSettingsContainerKeys } from "@/preferences/models";
import { ThSettingsWrapperButton } from "@/core/Components/Settings/ThSettingsWrapper/ThSettingsWrapperButton";

import { Heading } from "react-aria-components";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch } from "@/lib/hooks";
import { setSettingsContainer } from "@/lib/readerReducer";

import classNames from "classnames";

// CLAUDE-ADDED: Row rendered in the initial settings panel (see StatefulVisualSettingsContainer.tsx)
// that opens the "UI Element Visibility" subpanel (StatefulUIVisibilityToggles.tsx) -- mirrors
// StatefulSpacingGroup.tsx/StatefulTextGroup.tsx's own main-panel-entry-that-opens-a-subpanel pattern
// (same settingsStyles.group/advancedGroup/advancedIcon classes, same ThSettingsWrapperButton), but
// built directly rather than through StatefulGroupWrapper/ThSettingsWrapper -- those are wired to the
// Readium preferences plugin registry (componentsMap keyed by ThSettingsKeys), and this isn't a Readium
// rendering preference, same as StatefulKeepChromeVisible it replaces here.
export const StatefulUIVisibilityGroup = () => {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const dispatch = useAppDispatch();

  const setUIVisibilityContainer = useCallback(() => {
    dispatch(setSettingsContainer(ThSettingsContainerKeys.uiVisibility));
  }, [dispatch]);

  return (
    <div className={ classNames(settingsStyles.group, settingsStyles.advancedGroup) }>
      <Heading className={ classNames(settingsStyles.label, settingsStyles.groupLabel) }>
        { t("reader.preferences.uiVisibility.title") }
      </Heading>
      <ThSettingsWrapperButton
        className={ classNames(readerSharedUI.icon, settingsStyles.advancedIcon) }
        aria-label={ t("reader.settings.uiVisibility.advanced.trigger") }
        onPress={ setUIVisibilityContainer }
        compounds={{
          tooltipTrigger: {
            delay: preferences.theming.icon.tooltipDelay,
            closeDelay: preferences.theming.icon.tooltipDelay
          },
          tooltip: {
            className: readerSharedUI.tooltip,
            placement: "top",
            offset: preferences.theming.icon.tooltipOffset || 0
          },
          label: t("reader.settings.uiVisibility.advanced.tooltip")
        }}
      />
    </div>
  );
};
