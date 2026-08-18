"use client";

import { useEffect, useState } from "react";

import { ThActionsKeys } from "@/preferences/models";
import { StatefulActionContainerProps } from "../models/actions";

import panelStyles from "./assets/styles/thorium-web.readingTimer.module.css";

import DeleteIcon from "./assets/icons/delete.svg";
import CloseIcon from "./assets/icons/close.svg";

import { StatefulSheetWrapper } from "../../Sheets/StatefulSheetWrapper";
import { ThModal } from "@/core/Components/Containers/ThModal";

import { useDocking } from "../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { resetReadingTimer, completeReadingTimer, deleteCompletedReadTime } from "@/lib/readingTimeReducer";

import { formatFullReadingTime, formatEstimatedTime, ReadingTimeUnitLabels } from "./helpers/formatReadingTime";
import { formatTimestamp, formatDateOnly } from "../Annotations/helpers/formatTimestamp";
import { computeCurrentWpm, estimateSecondsLeft } from "./helpers/computeReadingSpeed";
import { DailyReadingBucket } from "@/lib/userData/readingTimeTypes";
import { fetchPageCountFromServer } from "@/lib/userData/pageCountApi";

// CLAUDE-ADDED: Only one confirmation can ever be pending -- a single ThModal instance renders
// different copy/buttons depending on which. This also rules out a whole bug class (e.g. a stray click
// opening the delete dialog while the reset dialog is already up) by construction, since there's only
// one piece of state to represent "what's pending" instead of two independent booleans.
type PendingConfirm =
  | { type: "reset" }
  | { type: "deleteCompleted"; id: string }
  | null;

type ReadingTimerTab = "timer" | "completed";

const TABS: ReadingTimerTab[] = ["timer", "completed"];

// CLAUDE-ADDED: The Moon+-style "reading history in days" rows, shared between two call sites: the
// Timer tab's own currently-open period, and (nested/indented) each Completed Reads entry's archived
// days. Newest first, matching the screenshot this was modeled on. wpm is computed from the bucket's
// raw seconds/words here rather than stored pre-computed (see DailyReadingBucket), same reasoning as
// computeCurrentWpm deriving its rate from raw sample deltas instead of storing one.
const DailyHistoryRows = ({ buckets, units }: { buckets: DailyReadingBucket[]; units: ReadingTimeUnitLabels }) => {
  const { t } = useI18n();

  if (buckets.length === 0) return null;

  const sorted = [...buckets].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ul className={ panelStyles.dailyHistoryList }>
      { sorted.map(bucket => {
        const wpm = bucket.seconds > 0 ? Math.round(bucket.words / (bucket.seconds / 60)) : null;
        // CLAUDE-ADDED: Defends against buckets persisted before progressionDelta existed (formerly
        // progressionAtEnd, a cumulative snapshot with no equivalent value here) -- rendering
        // Math.round(undefined * 100) would print "NaN%" forever for any such leftover entry.
        const percent = Number.isFinite(bucket.progressionDelta) ? Math.round(bucket.progressionDelta * 100) : 0;

        return (
          <li key={ bucket.date } className={ panelStyles.dailyHistoryItem }>
            <span className={ panelStyles.dailyHistoryDate }>
              { formatDateOnly(new Date(`${ bucket.date }T00:00:00`)) }
            </span>
            <span>{ formatFullReadingTime(bucket.seconds, units) }</span>
            <span>{ wpm !== null ? `${ wpm } ${ t("reader.readingTimer.speed.wpmUnit") }` : "—" }</span>
            <span className={ panelStyles.dailyHistoryPercent }>
              { percent }%
            </span>
          </li>
        );
      }) }
    </ul>
  );
};

// CLAUDE-ADDED: The reading timer's Target -- a live, exact (down-to-the-second) readout of the same
// state.readingTime.accumulatedSeconds the header badge shows rounded, a Reset button, and the history
// of past sessions archived via that reset flow (each with its own delete button). Both the reset and
// delete flows confirm first in a standalone centered ThModal, not routed through the sheet system,
// since it needs to appear "in the middle of the screen" regardless of whether this panel is currently a
// popover, bottom sheet, or docked. Dismissing that dialog (Escape/backdrop) always cancels outright --
// for reset that's distinct from explicitly choosing to reset without saving; for delete it's the same
// as pressing Cancel.
export const StatefulReadingTimerContainer = ({ triggerRef }: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.readingTimer] : undefined);

  const manifestUrl = useAppSelector(state => state.readingTime.manifestUrl);
  const accumulatedSeconds = useAppSelector(state => state.readingTime.accumulatedSeconds);
  const completedReadTimes = useAppSelector(state => state.readingTime.completedReadTimes);
  const wordCount = useAppSelector(state => state.readingTime.wordCount);
  const speedSamples = useAppSelector(state => state.readingTime.speedSamples);
  const currentProgression = useAppSelector(state => state.readingTime.currentProgression);
  const dailyReadingHistory = useAppSelector(state => state.readingTime.dailyReadingHistory);
  const isComic = useAppSelector(state => state.publication.isComic);

  const docking = useDocking(ThActionsKeys.readingTimer);
  const sheetType = docking.sheetType;

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [activeTab, setActiveTab] = useState<ReadingTimerTab>("timer");

  // CLAUDE-ADDED: null (not 0) means "not enough data yet" -- computeCurrentWpm's own empty-state
  // convention, carried through to secondsLeft since a time-left estimate needs a pace to divide by.
  const currentWpm = computeCurrentWpm(speedSamples);
  const secondsLeft = wordCount !== null && currentProgression !== null
    ? estimateSecondsLeft(wordCount, currentProgression, currentWpm)
    : null;

  // CLAUDE-ADDED: A comic has no words, so wpm/secondsLeft above are always null for it (see
  // useReadingSpeedSampler's isComic gate) -- there's no pace to show. "Time left" is still
  // meaningful, just derived from pages instead: pageCount is fetched once per book (same endpoint/
  // cache the book-detail sheet uses), and the rate is a plain pagesRead/timeSpent ratio for *this*
  // book -- no rolling sample buffer needed, since (unlike wpm) it isn't shared across books.
  const [comicPageCount, setComicPageCount] = useState<number | null>(null);
  useEffect(() => {
    setComicPageCount(null);
    if (!isComic || !manifestUrl) return;

    let cancelled = false;
    fetchPageCountFromServer(manifestUrl).then((count) => {
      if (!cancelled) setComicPageCount(count);
    });
    return () => { cancelled = true; };
  }, [isComic, manifestUrl]);

  const comicSecondsLeft = (() => {
    if (!isComic || comicPageCount === null || comicPageCount <= 0 || currentProgression === null || accumulatedSeconds <= 0) return null;

    const pagesRead = currentProgression * comicPageCount;
    if (pagesRead <= 0) return null;

    const pagesRemaining = comicPageCount - pagesRead;
    if (pagesRemaining <= 0) return 0;

    return (pagesRemaining / pagesRead) * accumulatedSeconds;
  })();

  const units = {
    seconds: t("reader.readingTimer.units.seconds"),
    minutes: t("reader.readingTimer.units.minutes"),
    hours: t("reader.readingTimer.units.hours")
  };

  const setOpen = (value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({ key: ThActionsKeys.readingTimer, isOpen: value, profile }));
    }
  };

  const closeConfirm = () => setPendingConfirm(null);

  const handleResetPress = () => setPendingConfirm({ type: "reset" });
  const handleDeletePress = (id: string) => setPendingConfirm({ type: "deleteCompleted", id });

  const handleResetWithoutSaving = () => {
    if (manifestUrl) dispatch(resetReadingTimer(manifestUrl));
    closeConfirm();
  };

  const handleSaveAndReset = () => {
    if (manifestUrl) dispatch(completeReadingTimer(manifestUrl, accumulatedSeconds));
    closeConfirm();
  };

  const handleConfirmDelete = () => {
    if (manifestUrl && pendingConfirm?.type === "deleteCompleted") {
      dispatch(deleteCompletedReadTime(manifestUrl, pendingConfirm.id));
    }
    closeConfirm();
  };

  // CLAUDE-ADDED: Most recent first -- upsertCompletedReadTime appends, so this doesn't rely on save order.
  const sortedCompletedReadTimes = [...completedReadTimes].sort((a, b) => b.completedAt - a.completedAt);

  return (
    <>
      <StatefulSheetWrapper
        sheetType={ sheetType }
        sheetProps={ {
          id: ThActionsKeys.readingTimer,
          triggerRef: triggerRef,
          heading: t("reader.readingTimer.title"),
          className: panelStyles.wrapper,
          placement: "bottom",
          isOpen: actionState?.isOpen || false,
          onOpenChange: setOpen,
          onClosePress: () => setOpen(false),
          docker: docking.getDocker()
        } }
      >
        <div className={ panelStyles.panel }>
          <div className={ panelStyles.panelTabs } role="tablist">
            { TABS.map(tab => (
              <button
                key={ tab }
                type="button"
                role="tab"
                className={ panelStyles.panelTab }
                data-selected={ activeTab === tab || undefined }
                aria-selected={ activeTab === tab }
                onClick={ () => setActiveTab(tab) }
              >
                { t(`reader.readingTimer.tabs.${ tab }`) }
              </button>
            )) }
          </div>

          { activeTab === "timer" ? (
            <>
              <div className={ panelStyles.bigTime }>
                { formatFullReadingTime(accumulatedSeconds, units) }
              </div>

              <button type="button" className={ panelStyles.resetButton } onClick={ handleResetPress }>
                { t("reader.readingTimer.reset") }
              </button>

              { isComic ? (
                // CLAUDE-ADDED: No wpm/pace block for comics -- see comicSecondsLeft above. Just the
                // time-left readout on its own, or nothing while there isn't enough data for it yet.
                comicSecondsLeft !== null &&
                  <div className={ panelStyles.speedTimeLeft }>
                    <span>{ t("reader.readingTimer.speed.timeLeft") }</span>
                    <span className={ panelStyles.speedTimeLeftValue }>
                      { formatEstimatedTime(comicSecondsLeft, units) }
                    </span>
                  </div>
              ) : currentWpm === null ? (
                <p className={ panelStyles.emptyState }>{ t("reader.readingTimer.speed.emptyState") }</p>
              ) : (
                <div className={ panelStyles.paceBlock }>
                  <div className={ panelStyles.paceBig }>
                    { Math.round(currentWpm) }
                    <span className={ panelStyles.speedUnit }>{ t("reader.readingTimer.speed.wpmUnit") }</span>
                  </div>
                  <div className={ panelStyles.speedLabel }>{ t("reader.readingTimer.speed.currentPace") }</div>

                  { secondsLeft !== null &&
                    <div className={ panelStyles.speedTimeLeft }>
                      <span>{ t("reader.readingTimer.speed.timeLeft") }</span>
                      <span className={ panelStyles.speedTimeLeftValue }>
                        { formatEstimatedTime(secondsLeft, units) }
                      </span>
                    </div>
                  }
                </div>
              ) }

              { dailyReadingHistory.length > 0 &&
                <div>
                  <h3 className={ panelStyles.completedTitle }>{ t("reader.readingTimer.dailyHistory.title") }</h3>
                  <DailyHistoryRows buckets={ dailyReadingHistory } units={ units } />
                </div>
              }
            </>
          ) : (
            sortedCompletedReadTimes.length === 0 ? (
              <p className={ panelStyles.emptyState }>{ t("reader.readingTimer.completedEmptyState") }</p>
            ) : (
              <ul className={ panelStyles.completedList }>
                { sortedCompletedReadTimes.map(item => (
                  <li key={ item.id } className={ panelStyles.completedItem }>
                    <div className={ panelStyles.completedItemHeader }>
                      <div className={ panelStyles.completedItemInfo }>
                        <span className={ panelStyles.completedItemTime }>
                          { formatFullReadingTime(item.seconds, units) }
                        </span>
                        <span className={ panelStyles.completedItemDate }>
                          { formatTimestamp(item.completedAt) }
                        </span>
                      </div>
                      <button
                        type="button"
                        className={ panelStyles.completedItemDelete }
                        aria-label={ t("reader.readingTimer.delete") }
                        onClick={ () => handleDeletePress(item.id) }
                      >
                        <DeleteIcon aria-hidden="true" focusable="false" />
                      </button>
                    </div>

                    { item.dailyHistory && item.dailyHistory.length > 0 &&
                      <DailyHistoryRows buckets={ item.dailyHistory } units={ units } />
                    }
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
        className={ panelStyles.confirmBackdrop }
        compounds={ {
          dialog: {
            className: panelStyles.confirmDialog,
            "aria-label": pendingConfirm?.type === "deleteCompleted"
              ? t("reader.readingTimer.deleteConfirmTitle")
              : t("reader.readingTimer.confirmTitle")
          }
        } }
      >
        <div className={ panelStyles.confirmText }>
          { /* CLAUDE-ADDED: ThModal's children type is a strict [header, body] tuple (see
              ThContainerProps) -- nesting the close button here (instead of as a third top-level
              sibling) keeps that arity intact. CSS positions it against .confirmDialog regardless,
              since position:absolute resolves against the nearest positioned ancestor, not the
              immediate parent. */ }
          <button
            type="button"
            className={ panelStyles.confirmClose }
            aria-label={ t("common.actions.close") }
            onClick={ closeConfirm }
          >
            <CloseIcon aria-hidden="true" focusable="false" />
          </button>
          { pendingConfirm?.type === "deleteCompleted"
            ? t("reader.readingTimer.deleteConfirmText")
            : t("reader.readingTimer.confirmText") }
        </div>
        <div className={ panelStyles.confirmActions }>
          { pendingConfirm?.type === "deleteCompleted" ? (
            <>
              <button type="button" className={ panelStyles.confirmButton } onClick={ closeConfirm }>
                { t("common.actions.cancel") }
              </button>
              <button type="button" className={ `${ panelStyles.confirmButton } ${ panelStyles.confirmButtonPrimary }` } onClick={ handleConfirmDelete }>
                { t("reader.readingTimer.delete") }
              </button>
            </>
          ) : (
            <>
              <button type="button" className={ panelStyles.confirmButton } onClick={ handleResetWithoutSaving }>
                { t("reader.readingTimer.confirmDiscard") }
              </button>
              <button type="button" className={ `${ panelStyles.confirmButton } ${ panelStyles.confirmButtonPrimary }` } onClick={ handleSaveAndReset }>
                { t("reader.readingTimer.confirmSave") }
              </button>
            </>
          ) }
        </div>
      </ThModal>
    </>
  );
};
