"use client";

import { useCallback } from "react";

import settingsStyles from "../../Settings/assets/styles/thorium-web.reader.settings.module.css";
import readerSharedUI from "../../assets/styles/thorium-web.button.module.css";

import { ThSettingsKeys, ThSettingsRangeVariant } from "@/preferences/models";
import { ThSettingsResetButton } from "@/core/Components/Settings/ThSettingsResetButton";

import { StatefulNumberField } from "../../Settings/StatefulNumberField";
import { StatefulSlider } from "../../Settings/StatefulSlider";

import { usePreferences } from "@/preferences/hooks/usePreferences";
import { useI18n } from "@/i18n/useI18n";
import { usePlaceholder } from "../../Settings/hooks/usePlaceholder";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { setMarginHorizontal } from "@/lib/settingsReducer";

import classNames from "classnames";

export const StatefulMarginHorizontal = () => {
  const { preferences } = usePreferences();
  const { t } = useI18n();

  const marginHorizontal = useAppSelector(state => state.settings.marginHorizontal);

  const dispatch = useAppDispatch();

  const config = preferences.settings.keys[ThSettingsKeys.marginHorizontal];

  const placeholderText = usePlaceholder(config.placeholder, config.range, "number");

  // CLAUDE-ADDED: Dispatches straight to Redux -- unlike most settings, horizontal margin is not
  // submitted to readium's preferences editor. See useMarginSync.ts for why: submitting it as the
  // live pageGutter preference didn't visually shrink the text column (readium grows the column
  // box to compensate) and fed into readium's own "Auto" column-count decision, causing small
  // margins to silently flip 1-column layouts to 2. Applied instead as a direct inline style by
  // useMarginSync/StatefulReader's frameLoaded listener.
  const updatePreference = useCallback(async (value: number | number[]) => {
    const normalizedValue = Array.isArray(value) ? value[0] : value;
    dispatch(setMarginHorizontal(normalizedValue));
  }, [dispatch]);

  const defaultMarginHorizontal = preferences.typography.pageGutter;
  const canReset = marginHorizontal !== defaultMarginHorizontal;

  return (
    <div className={ settingsStyles.group }>
      {/* CLAUDE-ADDED: Own label row (rather than StatefulNumberField's standalone label) so the
          reset button can sit right next to the label text instead of pinned to the far right of
          the field -- StatefulNumberField's built-in reset placement is shared by every other
          number field, so it's not changed globally. */}
      <div className={ classNames(settingsStyles.label, settingsStyles.labelWithReset) }>
        <span>{ t("reader.preferences.margin.horizontal") }</span>
        { canReset &&
          <ThSettingsResetButton
            className={ classNames(readerSharedUI.icon, settingsStyles.resetButton) }
            onClick={ async () => await updatePreference(defaultMarginHorizontal) }
            compounds={{
              tooltipTrigger: {
                delay: preferences.theming.arrow.tooltipDelay,
                closeDelay: preferences.theming.arrow.tooltipDelay
              },
              tooltip: {
                className: readerSharedUI.tooltip
              },
              label: t("common.actions.reset")
            }}
          />
        }
      </div>
      { config.variant === ThSettingsRangeVariant.numberField
        ? <StatefulNumberField
          standalone={ false }
          defaultValue={ defaultMarginHorizontal }
          value={ marginHorizontal }
          onChange={ async (value) => await updatePreference(value) }
          label={ t("reader.preferences.margin.horizontal") }
          placeholder={ placeholderText }
          range={ config.range }
          step={ config.step }
          steppers={{
            decrementLabel: t("common.actions.decrease"),
            incrementLabel: t("common.actions.increase")
          }}
          isWheelDisabled={ true }
          isVirtualKeyboardDisabled={ true }
        />
        : <StatefulSlider
          standalone={ false }
          displayTicks={ config.variant === ThSettingsRangeVariant.incrementedSlider }
          defaultValue={ defaultMarginHorizontal }
          value={ marginHorizontal }
          onChange={ async (value) => await updatePreference(value as number) }
          label={ t("reader.preferences.margin.horizontal") }
          placeholder={ placeholderText }
          range={ config.range }
          step={ config.step }
        />
      }
    </div>
  );
};
