"use client";

import { StatefulSwitch } from "./StatefulSwitch";

import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setKeepChromeVisible } from "@/lib/globalPreferencesReducer";

// CLAUDE-ADDED: Unlike every other row rendered by StatefulVisualSettingsContainer, this isn't a
// Readium rendering preference -- it doesn't reflow anything, so it skips the whole
// submitPreferences/ThSettingsKeys plugin-registry machinery every other Settings/* component goes
// through and just dispatches a plain globalPreferences flag. Rendered directly by
// StatefulVisualSettingsContainer's initial panel rather than being registered in
// createDefaultPlugin.ts, since it isn't keyed off a settings/webPub preference profile.
export const StatefulKeepChromeVisible = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const keepChromeVisible = useAppSelector(state => state.globalPreferences.keepChromeVisible);

  return (
    <StatefulSwitch
      standalone
      heading={ t("reader.preferences.keepChromeVisible.title") }
      label={ t("reader.preferences.keepChromeVisible.label") }
      onChange={ (isSelected: boolean) => dispatch(setKeepChromeVisible(isSelected)) }
      isSelected={ keepChromeVisible ?? false }
    />
  );
};
