"use client";

import { ThActionsKeys } from "@/preferences/models";

import AnnotationsIcon from "./assets/icons/notepad.svg";

import { StatefulActionTriggerProps } from "../models/actions";
import { ThActionsTriggerVariant } from "@/core/Components/Actions/ThActionsBar";

import { StatefulActionIcon } from "../Triggers/StatefulActionIcon";
import { StatefulOverflowMenuItem } from "../Triggers/StatefulOverflowMenuItem";

import { useActionsPreferences } from "@/preferences/hooks/useActionsPreferences";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";

export const StatefulAnnotationsTrigger = ({ variant }: StatefulActionTriggerProps) => {
  const preferences = useActionsPreferences();
  const { t } = useI18n();
  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.annotations] : undefined);
  const dispatch = useAppDispatch();

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({
        key: ThActionsKeys.annotations,
        isOpen: value,
        profile
      }));
    }
  };

  return(
    <>
    { (variant && variant === ThActionsTriggerVariant.menu)
      ? <StatefulOverflowMenuItem
          label={ t("reader.annotations.title") }
          SVGIcon={ AnnotationsIcon }
          shortcut={ preferences.actionsKeys[ThActionsKeys.annotations].shortcut }
          id={ ThActionsKeys.annotations }
          onAction={ () => setOpen(!actionState?.isOpen) }
        />
      : <StatefulActionIcon
          visibility={ preferences.actionsKeys[ThActionsKeys.annotations].visibility }
          aria-label={ t("reader.annotations.title") }
          placement="bottom"
          tooltipLabel={ t("reader.annotations.title") }
          shortcut={ preferences.actionsKeys[ThActionsKeys.annotations].shortcut }
          onPress={ () => setOpen(!actionState?.isOpen) }
        >
          <AnnotationsIcon aria-hidden="true" focusable="false" />
        </StatefulActionIcon>
    }
    </>
  )
}
