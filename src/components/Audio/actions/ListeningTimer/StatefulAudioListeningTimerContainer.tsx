"use client";

import { useState } from "react";

import { ThAudioActionKeys } from "@/preferences/models";
import { StatefulActionContainerProps } from "../../../Actions/models/actions";

import timerStyles from "../../../Actions/ReadingTimer/assets/styles/thorium-web.readingTimer.module.css";

import DeleteIcon from "../../../Actions/ReadingTimer/assets/icons/delete.svg";
import CloseIcon from "../../../Actions/ReadingTimer/assets/icons/close.svg";

import { StatefulSheetWrapper } from "../../../Sheets/StatefulSheetWrapper";
import { ThModal } from "@/core/Components/Containers/ThModal";

import { useDocking } from "../../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { discardListenStart, completeListen, deleteCompletedListen } from "@/lib/listeningTimeReducer";

import { formatFullReadingTime, ReadingTimeUnitLabels } from "../../../Actions/ReadingTimer/helpers/formatReadingTime";
import { formatTimestamp } from "../../../Actions/Annotations/helpers/formatTimestamp";

// CLAUDE-ADDED: Only one confirmation can ever be pending -- mirrors StatefulReadingTimerContainer's
// own PendingConfirm pattern, minus the "reset without saving" branch: there's no accumulated-seconds
// session to discard here (accumulatedSeconds is a lifetime total, never reset -- see
// listeningTimeReducer.ts), so the only two things that ever need confirming are finishing the book
// early (manual "Mark as Finished") and deleting a past Completed Listen.
type PendingConfirm =
  | { type: "finish" }
  | { type: "deleteCompleted"; id: string }
  | null;

type ListeningTimerTab = "timer" | "completed";

const TABS: ListeningTimerTab[] = ["timer", "completed"];

// CLAUDE-ADDED: Audiobook counterpart to StatefulReadingTimerContainer -- deliberately simpler, per
// the user's own request: no wpm/pace/daily-history breakdown (audio progress is already exact via
// the position locator), and Completed Listens only ever show a started/finished date pair, never a
// duration. "Mark as Finished" is the manual trigger the user asked for alongside the automatic one
// (StatefulPlayer's trackEnded, when the audiobook reaches its own end).
export const StatefulAudioListeningTimerContainer = ({ triggerRef }: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThAudioActionKeys.listeningTimer] : undefined);

  const manifestUrl = useAppSelector(state => state.listeningTime.manifestUrl);
  const accumulatedSeconds = useAppSelector(state => state.listeningTime.accumulatedSeconds);
  const startedAt = useAppSelector(state => state.listeningTime.startedAt);
  const completedListens = useAppSelector(state => state.listeningTime.completedListens);

  const docking = useDocking(ThAudioActionKeys.listeningTimer);
  const sheetType = docking.sheetType;

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [activeTab, setActiveTab] = useState<ListeningTimerTab>("timer");

  const units: ReadingTimeUnitLabels = {
    seconds: t("audio.listeningTimer.units.seconds"),
    minutes: t("audio.listeningTimer.units.minutes"),
    hours: t("audio.listeningTimer.units.hours")
  };

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({ key: ThAudioActionKeys.listeningTimer, isOpen: value, profile }));
    }
  };

  const closeConfirm = () => setPendingConfirm(null);

  const handleFinishPress = () => setPendingConfirm({ type: "finish" });
  const handleDeletePress = (id: string) => setPendingConfirm({ type: "deleteCompleted", id });

  const handleConfirmFinish = () => {
    if (manifestUrl) dispatch(completeListen(manifestUrl));
    closeConfirm();
  };

  const handleClearStart = () => {
    if (manifestUrl) dispatch(discardListenStart(manifestUrl));
    closeConfirm();
  };

  const handleConfirmDelete = () => {
    if (manifestUrl && pendingConfirm?.type === "deleteCompleted") {
      dispatch(deleteCompletedListen(manifestUrl, pendingConfirm.id));
    }
    closeConfirm();
  };

  // CLAUDE-ADDED: Most recent first -- upsertCompletedListen appends, so this doesn't rely on save order.
  const sortedCompletedListens = [...completedListens].sort((a, b) => b.completedAt - a.completedAt);

  return (
    <>
      <StatefulSheetWrapper
        sheetType={ sheetType }
        sheetProps={ {
          id: ThAudioActionKeys.listeningTimer,
          triggerRef: triggerRef,
          heading: t("audio.listeningTimer.title"),
          className: timerStyles.wrapper,
          placement: "top",
          isOpen: actionState?.isOpen || false,
          onOpenChange: setOpen,
          onClosePress: () => setOpen(false),
          docker: docking.getDocker()
        } }
      >
        <div className={ timerStyles.panel }>
          <div className={ timerStyles.panelTabs } role="tablist">
            { TABS.map(tab => (
              <button
                key={ tab }
                type="button"
                role="tab"
                className={ timerStyles.panelTab }
                data-selected={ activeTab === tab || undefined }
                aria-selected={ activeTab === tab }
                onClick={ () => setActiveTab(tab) }
              >
                { t(`audio.listeningTimer.tabs.${ tab }`) }
              </button>
            )) }
          </div>

          { activeTab === "timer" ? (
            <>
              <div className={ timerStyles.bigTime }>
                { formatFullReadingTime(accumulatedSeconds, units) }
              </div>
              <div className={ timerStyles.speedLabel }>
                { t("audio.listeningTimer.totalListened") }
              </div>

              { startedAt !== null && (
                <p className={ timerStyles.emptyState }>
                  { t("audio.listeningTimer.startedOn", { date: formatTimestamp(startedAt) }) }
                </p>
              ) }

              <button type="button" className={ timerStyles.resetButton } onClick={ handleFinishPress }>
                { t("audio.listeningTimer.markFinished") }
              </button>

              { startedAt !== null && (
                <button type="button" className={ timerStyles.resetButton } onClick={ handleClearStart }>
                  { t("audio.listeningTimer.clearStart") }
                </button>
              ) }
            </>
          ) : (
            sortedCompletedListens.length === 0 ? (
              <p className={ timerStyles.emptyState }>{ t("audio.listeningTimer.completedEmptyState") }</p>
            ) : (
              <ul className={ timerStyles.completedList }>
                { sortedCompletedListens.map(item => (
                  <li key={ item.id } className={ timerStyles.completedItem }>
                    <div className={ timerStyles.completedItemHeader }>
                      <div className={ timerStyles.completedItemInfo }>
                        <span className={ timerStyles.completedItemDate }>
                          { t("audio.listeningTimer.started") }: { formatTimestamp(item.startedAt) }
                        </span>
                        <span className={ timerStyles.completedItemDate }>
                          { t("audio.listeningTimer.finished") }: { formatTimestamp(item.completedAt) }
                        </span>
                      </div>
                      <button
                        type="button"
                        className={ timerStyles.completedItemDelete }
                        aria-label={ t("audio.listeningTimer.delete") }
                        onClick={ () => handleDeletePress(item.id) }
                      >
                        <DeleteIcon aria-hidden="true" focusable="false" />
                      </button>
                    </div>
                  </li>
                )) }
              </ul>
            )
          ) }
        </div>
      </StatefulSheetWrapper>

      <ThModal
        isOpen={ pendingConfirm !== null }
        onOpenChange={ open => { if (!open) closeConfirm(); } }
        isDismissable={ true }
        className={ timerStyles.confirmBackdrop }
        compounds={ {
          dialog: {
            className: timerStyles.confirmDialog,
            "aria-label": pendingConfirm?.type === "deleteCompleted"
              ? t("audio.listeningTimer.deleteConfirmTitle")
              : t("audio.listeningTimer.finishConfirmTitle")
          }
        } }
      >
        <div className={ timerStyles.confirmText }>
          <button
            type="button"
            className={ timerStyles.confirmClose }
            aria-label={ t("common.actions.close") }
            onClick={ closeConfirm }
          >
            <CloseIcon aria-hidden="true" focusable="false" />
          </button>
          { pendingConfirm?.type === "deleteCompleted"
            ? t("audio.listeningTimer.deleteConfirmText")
            : t("audio.listeningTimer.finishConfirmText") }
        </div>
        <div className={ timerStyles.confirmActions }>
          { pendingConfirm?.type === "deleteCompleted" ? (
            <>
              <button type="button" className={ timerStyles.confirmButton } onClick={ closeConfirm }>
                { t("common.actions.cancel") }
              </button>
              <button type="button" className={ `${ timerStyles.confirmButton } ${ timerStyles.confirmButtonPrimary }` } onClick={ handleConfirmDelete }>
                { t("audio.listeningTimer.delete") }
              </button>
            </>
          ) : (
            <>
              <button type="button" className={ timerStyles.confirmButton } onClick={ closeConfirm }>
                { t("common.actions.cancel") }
              </button>
              <button type="button" className={ `${ timerStyles.confirmButton } ${ timerStyles.confirmButtonPrimary }` } onClick={ handleConfirmFinish }>
                { t("audio.listeningTimer.markFinished") }
              </button>
            </>
          ) }
        </div>
      </ThModal>
    </>
  );
};
