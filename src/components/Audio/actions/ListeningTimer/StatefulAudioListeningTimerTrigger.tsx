"use client";

import { ThAudioActionKeys } from "@/preferences/models";
import { StatefulActionTriggerProps } from "../../../Actions/models/actions";

import timerStyles from "../../../Actions/ReadingTimer/assets/styles/thorium-web.readingTimer.module.css";
import TimerIcon from "../../../Actions/ReadingTimer/assets/icons/timer.svg";

import { StatefulActionIcon } from "../../../Actions/Triggers/StatefulActionIcon";

import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { formatReadingTime } from "../../../Actions/ReadingTimer/helpers/formatReadingTime";

// CLAUDE-ADDED: Audiobook counterpart to StatefulReadingTimerTrigger -- same icon+live-badge shape
// (reusing its exact styles/icon/format helper, see the imports above), reading state.listeningTime
// instead of state.readingTime. Lives in the audio primary action bar (no menu-variant handling
// needed, matching StatefulAudioSleepTimerTrigger -- the audio bar doesn't collapse into an overflow
// menu the way the ebook one does).
export const StatefulAudioListeningTimerTrigger = ({ ref }: StatefulActionTriggerProps) => {
  const { t } = useI18n();
  const preferences = useActionsPreferences();
  const dispatch = useAppDispatch();

  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThAudioActionKeys.listeningTimer] : undefined);
  const accumulatedSeconds = useAppSelector(state => state.listeningTime.accumulatedSeconds);
  const isLoaded = useAppSelector(state => state.listeningTime.isLoaded);

  const units = {
    seconds: t("audio.listeningTimer.units.seconds"),
    minutes: t("audio.listeningTimer.units.minutes"),
    hours: t("audio.listeningTimer.units.hours")
  };
  const formatted = formatReadingTime(accumulatedSeconds, units);
  const label = t("audio.listeningTimer.tooltip", { time: formatted });

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({ key: ThAudioActionKeys.listeningTimer, isOpen: value, profile }));
    }
  };

  return (
    <StatefulActionIcon
      ref={ ref }
      className={ timerStyles.button }
      visibility={ preferences.actionsKeys[ThAudioActionKeys.listeningTimer]?.visibility }
      aria-label={ label }
      placement="top"
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
  );
};
