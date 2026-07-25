"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { ThActionsKeys } from "@/preferences/models";
import { StatefulActionContainerProps } from "../models/actions";

import jumpToPositionStyles from "./assets/styles/thorium-web.jumpToPosition.module.css";

import { StatefulSheetWrapper } from "../../Sheets/StatefulSheetWrapper";
import { ThForm } from "@/core/Components/Form/ThForm";
import { ThFormNumberField } from "@/core/Components/Form/Fields/ThFormNumberField";

import { useEpubNavigator } from "@/core/Hooks/Epub/useEpubNavigator";
import { useDocking } from "../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { setImmersive, setUserNavigated } from "@/lib/readerReducer";

import { findExactPageLocator } from "@/helpers/exactPageLocator";
import { isPositionsListValid, isExactPageCountValid } from "./helpers/utils";

export const StatefulJumpToPositionContainer = ({
  triggerRef
}: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.jumpToPosition] : undefined);
  const positionsList = useAppSelector(state => state.publication.positionsList);

  const positionNumbers = useAppSelector(state => state.publication.unstableTimeline?.progression?.currentPositions);

  // CLAUDE-ADDED: Prefer the exact page-count system (useExactPageCount, dispatched via setExactPageCount)
  // over the coarse manifest positionsList when it has data -- it's only populated for reflowable,
  // non-scroll content, so FXL/scroll books fall back to the exact same positionsList-based path this
  // dialog already used before it existed.
  const exactTotalPages = useAppSelector(state => state.publication.exactPageCount?.totalPages);
  const exactCurrentPageRange = useAppSelector(state => state.publication.exactPageCount?.currentPageRange);
  const exactResourcePages = useAppSelector(state => state.publication.exactPageCount?.resourcePages);
  const usingExact = isExactPageCountValid(exactTotalPages);

  const reducedMotion = useAppSelector(state => state.theming.prefersReducedMotion);
  const dispatch = useAppDispatch();

  const docking = useDocking(ThActionsKeys.jumpToPosition);
  const sheetType = docking.sheetType;

  const { go } = useEpubNavigator();

  // Component has to handle updates locally since EpubNavigator updates positions,
  // so we use these as an intermediary
  const [position, setPosition] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>();

  // Position Numbers can be a range so we must check position is in range
  // And not only that the array simply includes the position
  const positionInRange = useCallback(() => {
    const range = usingExact ? exactCurrentPageRange : positionNumbers;
    if (!range || range.length === 0) return false;
    return range.length === 2
      ? position >= range[0]! && position <= range[1]!
      : position === range[0];
  }, [position, usingExact, exactCurrentPageRange, positionNumbers]);

  // CLAUDE-ADDED: Page 0 (the cover) is a valid target in the exact system, so the old `!position`
  // falsy check (which would treat 0 as "empty") can't be reused here.
  const hasValidPosition = position !== undefined && position !== null && !Number.isNaN(position);

  const minPosition = usingExact ? 0 : 1;
  const maxPosition = usingExact ? exactTotalPages! : positionsList.length;

  // Update the label to use react-i18next interpolation
  const label = t("reader.jumpToPosition.label", { positionStart: minPosition, positionEnd: maxPosition });

  const setOpen = useCallback((value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({
        key: ThActionsKeys.jumpToPosition,
        isOpen: value,
        profile
      }));
    }
  }, [dispatch, profile]);

  // NumberField onChange won’t fire if the value has been typed
  // so we need to handle the input manually
  const handleInput = useCallback((e: FormEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    setPosition(parseInt(target.value));
  }, []);

  // This is a form submit handler so we have to preventDefault
  // We have to use this otherwise any change will trigger a navigation
  const handleAction = useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMessage(undefined); // Clear previous errors

    const cb = () => {
      setOpen(false);
      dispatch(setImmersive(true));
      dispatch(setUserNavigated(true));
    };

    if (usingExact) {
      const locator = findExactPageLocator(exactResourcePages, position);

      if (!locator) {
        setErrorMessage(t("reader.jumpToPosition.error.notFound"));
        return;
      }

      if (positionInRange()) return setOpen(false);

      go(locator, !reducedMotion, cb);
      return;
    }

    if (!positionsList) return;

    const item = positionsList.find(item => item.locations.position === position);

    if (!item) {
      setErrorMessage(t("reader.jumpToPosition.error.notFound"));
      return;
    }

    if (positionInRange()) return setOpen(false);

    go(item, !reducedMotion, cb);
  }, [position, usingExact, exactResourcePages, positionsList, reducedMotion, t, positionInRange, go, setOpen, dispatch]);

  // Since we are using an intermediary local state, we must keep track when the current position changes
  useEffect(() => {
    if (usingExact) {
      exactCurrentPageRange && setPosition(exactCurrentPageRange[0]!);
    } else {
      positionNumbers && setPosition(positionNumbers[0]!);
    }
  }, [usingExact, exactCurrentPageRange, positionNumbers]);

  // In case there is no positions list or no valid positions (and no exact page count either) we return
  if (!isPositionsListValid(positionsList) && !usingExact) return null;

  return (
    <>
      <StatefulSheetWrapper
        sheetType={sheetType}
        sheetProps={{
          id: ThActionsKeys.jumpToPosition,
          triggerRef: triggerRef,
          heading: t("reader.actions.goToPosition.descriptive"),
          className: jumpToPositionStyles.wrapper,
          placement: "bottom",
          isOpen: actionState?.isOpen || false,
          onOpenChange: setOpen,
          onClosePress: () => setOpen(false),
          docker: docking.getDocker()
        }}
      >
        <ThForm
          label={ t("reader.jumpToPosition.go") }
          className={ jumpToPositionStyles.form }
          onSubmit={ handleAction }
          compounds={{
            button: {
              className: jumpToPositionStyles.button,
              isDisabled: !hasValidPosition || positionInRange()
            }
          }}
        >
          <ThFormNumberField
            label={ label }
            name="jumpToPosition"
            className={ jumpToPositionStyles.numberField }
            onChange={ setPosition }
            onInput={ handleInput }
            value={ position }
            minValue={ minPosition }
            maxValue={ maxPosition }
            step={ 1 }
            formatOptions={{ style: "decimal" }}
            isWheelDisabled={ true }
            errorMessage={ errorMessage }
            compounds={{
              label: {
                className: jumpToPositionStyles.label
              },
              input: {
                className: jumpToPositionStyles.input,
                inputMode: "numeric"
              }
            }}
          />
        </ThForm>
      </StatefulSheetWrapper>
    </>
  )
}
