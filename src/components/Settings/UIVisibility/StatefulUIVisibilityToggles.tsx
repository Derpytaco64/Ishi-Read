"use client";

import { StatefulSwitch } from "../StatefulSwitch";

import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setKeepChromeVisible, setUIElementVisibility } from "@/lib/globalPreferencesReducer";

// CLAUDE-ADDED: Subpanel content for StatefulUIVisibilityGroup.tsx's entry row (rendered by
// StatefulVisualSettingsContainer.tsx's ThSettingsContainerKeys.uiVisibility case) -- one plain
// globalPreferences switch per reader chrome element. keepChromeVisible below used to be its own
// standalone toggle (formerly StatefulKeepChromeVisible.tsx, now deleted) with its own top-level row
// in the initial settings panel; folded in here as the first toggle since it's the same "chrome
// visibility" family of settings -- each of the others below is a per-element version of the same
// "pin always visible" behavior, not a hide switch. `?? false` defaults every toggle off (unpinned,
// original immersive hiding/fading behavior) -- see UIElementVisibility's own comment in
// globalPreferencesReducer.ts.
export const StatefulUIVisibilityToggles = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const keepChromeVisible = useAppSelector(state => state.globalPreferences.keepChromeVisible);
  const uiElementVisibility = useAppSelector(state => state.globalPreferences.uiElementVisibility);

  return (
    <>
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.keepChromeVisible.title") }
      label={ t("reader.preferences.keepChromeVisible.label") }
      onChange={ (isSelected: boolean) => dispatch(setKeepChromeVisible(isSelected)) }
      isSelected={ keepChromeVisible ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.backLink") }
      label={ t("reader.preferences.uiVisibility.backLink") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "backLink", value: isSelected })) }
      isSelected={ uiElementVisibility?.backLink ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.runningHead") }
      label={ t("reader.preferences.uiVisibility.runningHead") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "runningHead", value: isSelected })) }
      isSelected={ uiElementVisibility?.runningHead ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.readingTimer") }
      label={ t("reader.preferences.uiVisibility.readingTimer") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "readingTimer", value: isSelected })) }
      isSelected={ uiElementVisibility?.readingTimer ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.overflowMenu") }
      label={ t("reader.preferences.uiVisibility.overflowMenu") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "overflowMenu", value: isSelected })) }
      isSelected={ uiElementVisibility?.overflowMenu ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.progression") }
      label={ t("reader.preferences.uiVisibility.progression") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "progression", value: isSelected })) }
      isSelected={ uiElementVisibility?.progression ?? false }
    />
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.uiVisibility.pagination") }
      label={ t("reader.preferences.uiVisibility.pagination") }
      onChange={ (isSelected: boolean) => dispatch(setUIElementVisibility({ key: "pagination", value: isSelected })) }
      isSelected={ uiElementVisibility?.pagination ?? false }
    />
    </>
  );
};
