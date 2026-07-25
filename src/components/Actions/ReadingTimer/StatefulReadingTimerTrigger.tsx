"use client";

import { ThActionsKeys } from "@/preferences/models";
import { StatefulActionTriggerProps } from "../models/actions";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";

import readerSharedUI from "../../assets/styles/thorium-web.button.module.css";
import timerStyles from "./assets/styles/thorium-web.readingTimer.module.css";

import TimerIcon from "./assets/icons/timer.svg";

import { StatefulOverflowMenuItem } from "../Triggers/StatefulOverflowMenuItem";
import { StatefulActionIcon } from "../Triggers/StatefulActionIcon";

import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { formatReadingTime } from "./helpers/formatReadingTime";

// CLAUDE-ADDED: Live readout of state.readingTime, ticked up by useReadingTimer (invoked once,
// unconditionally, from the Epub reader shell so it keeps running whether this button is visible in the
// bar or collapsed into the overflow menu). Clicking opens StatefulReadingTimerContainer -- the exact
// larger readout, reset, and Completed Read Times history. Modeled on StatefulAnnotationsTrigger for the
// open-on-click wiring, and on StatefulAudioSleepTimerTrigger for the icon+live-badge display.
export const StatefulReadingTimerTrigger = ({ variant, ref }: StatefulActionTriggerProps) => {
  const { t } = useI18n();
  const preferences = useActionsPreferences();
  const dispatch = useAppDispatch();

  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.readingTimer] : undefined);
  const accumulatedSeconds = useAppSelector(state => state.readingTime.accumulatedSeconds);
  const isLoaded = useAppSelector(state => state.readingTime.isLoaded);

  const units = {
    seconds: t("reader.readingTimer.units.seconds"),
    minutes: t("reader.readingTimer.units.minutes"),
    hours: t("reader.readingTimer.units.hours")
  };
  const formatted = formatReadingTime(accumulatedSeconds, units);
  const label = t("reader.readingTimer.tooltip", { time: formatted });

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({ key: ThActionsKeys.readingTimer, isOpen: value, profile }));
    }
  };

  return (
    <>
    { (variant && variant === ThActionsTriggerVariant.menu)
      ? <StatefulOverflowMenuItem
          label={ label }
          SVGIcon={ TimerIcon }
          id={ ThActionsKeys.readingTimer }
          onAction={ () => setOpen(!actionState?.isOpen) }
        />
      : <StatefulActionIcon
          ref={ ref }
          className={ `${ readerSharedUI.iconCompSm } ${ timerStyles.button }` }
          visibility={ preferences.actionsKeys[ThActionsKeys.readingTimer].visibility }
          aria-label={ label }
          placement="bottom"
          tooltipLabel={ label }
          onPress={ () => setOpen(!actionState?.isOpen) }
        >
          <TimerIcon aria-hidden="true" focusable="false" />
          { isLoaded &&
            <span className={ timerStyles.label } aria-hidden="true">
              { formatted }
            </span>
          }
        </StatefulActionIcon>
    }
    </>
  );
};
