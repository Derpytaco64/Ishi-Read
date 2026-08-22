"use client";

import { useCallback } from "react";

import { ThSettingsKeys } from "@/preferences/models";
import { SETTINGS_KEY_TO_PREFERENCE } from "../../Settings/helpers/settingsKeyMapping";

import { StatefulSwitch } from "../../Settings/StatefulSwitch";

import { useEpubNavigator } from "@/core/Hooks/Epub/useEpubNavigator";
import { useI18n } from "@/i18n/useI18n";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { setSpreadOffset } from "@/lib/settingsReducer";

// CLAUDE-ADDED: Comic-only. Lets the user shift which pages get paired into a two-page landscape
// spread by one (see the patched @readium/navigator FXLSpreader's spreadOffset doc comment) --
// for scanned/ripped comics where a two-page illustration is landing split across the wrong
// spread boundary. Gated on isComic the same way StatefulReadingTimerContainer is: this setting
// has no meaning for a real (non-comic) fixed-layout EPUB, whose spread pairing is defined by the
// publication itself rather than by scan artifacts.
export const StatefulSpreadOffset = () => {
  const { t } = useI18n();

  const isComic = useAppSelector(state => state.publication.isComic);
  const spreadOffset = useAppSelector(state => state.settings.spreadOffset);

  const dispatch = useAppDispatch();

  const { submitPreferences } = useEpubNavigator();

  const prefKey = SETTINGS_KEY_TO_PREFERENCE[ThSettingsKeys.spreadOffset];

  const updatePreference = useCallback(async (value: boolean) => {
    await submitPreferences({ [prefKey]: value });
    dispatch(setSpreadOffset(value));
  }, [prefKey, submitPreferences, dispatch]);

  if (!isComic) return null;

  return (
    <StatefulSwitch
      standalone={ true }
      heading={ t("reader.preferences.spreadOffset.title") }
      label={ t("reader.preferences.spreadOffset.label") }
      onChange={ async (isSelected: boolean) => await updatePreference(isSelected) }
      isSelected={ spreadOffset ?? false }
    />
  );
}
