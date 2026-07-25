"use client";

import { useCallback, useMemo, useState } from "react";

import { Locator } from "@readium/shared";
import { ThActionsKeys, ThDockingKeys, ThSheetTypes } from "@/preferences/models";
import { focusReadingContainer } from "@/core/Helpers/focusUtilities";
import { StatefulActionContainerProps } from "../models/actions";

import { StatefulSheetWrapper } from "../../Sheets/StatefulSheetWrapper";

import { useNavigator } from "@/core/Navigator";
import { useDocking } from "../../Docking/hooks/useDocking";
import { useI18n } from "@/i18n/useI18n";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setActionOpen } from "@/lib/actionsReducer";
import { setImmersive, setUserNavigated } from "@/lib/readerReducer";
import { deleteHighlight, deleteBookmark, deleteNote, addOrUpdateNote, addBookmark, setFlashLocator, setReturnLocator } from "@/lib/annotationsReducer";

import { AnnotationsContent, AnnotationListEntry, AnnotationsTab } from "./AnnotationsContent";

import panelStyles from "./assets/styles/thorium-web.annotations.module.css";

export const StatefulAnnotationsContainer = ({ triggerRef }: StatefulActionContainerProps) => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const manifestUrl = useAppSelector(state => state.annotations.manifestUrl);
  const highlights = useAppSelector(state => state.annotations.highlights);
  const bookmarks = useAppSelector(state => state.annotations.bookmarks);
  const notes = useAppSelector(state => state.annotations.notes);

  const { go, currentLocator } = useNavigator().unified;

  const profile = useAppSelector(state => state.reader.profile);
  const actionState = useAppSelector(state => profile ? state.actions.keys[profile][ThActionsKeys.annotations] : undefined);
  const docking = useDocking(ThActionsKeys.annotations);
  const sheetType = docking.sheetType;

  const [activeTab, setActiveTab] = useState<AnnotationsTab>("all");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const toggleSortDirection = useCallback(() => {
    setSortDirection(direction => direction === "asc" ? "desc" : "asc");
  }, []);

  const setOpen = useCallback((value: boolean) => {
    if (profile) {
      dispatch(setActionOpen({ key: ThActionsKeys.annotations, isOpen: value, profile }));
    }
  }, [dispatch, profile]);

  const entries = useMemo<AnnotationListEntry[]>(() => {
    const highlightEntries: AnnotationListEntry[] = highlights.flatMap(item => {
      const locator = Locator.deserialize(item.locator);
      if (!locator) return [];
      return [{ id: item.id, kind: "highlight" as const, locator, color: item.color, createdAt: item.createdAt }];
    });

    const bookmarkEntries: AnnotationListEntry[] = bookmarks.flatMap(item => {
      const locator = Locator.deserialize(item.locator);
      if (!locator) return [];
      return [{ id: item.id, kind: "bookmark" as const, locator, createdAt: item.createdAt }];
    });

    const noteEntries: AnnotationListEntry[] = notes.flatMap(item => {
      const locator = Locator.deserialize(item.locator);
      if (!locator) return [];
      return [{ id: item.id, kind: "note" as const, locator, noteText: item.text, createdAt: item.createdAt, updatedAt: item.updatedAt }];
    });

    // CLAUDE-ADDED: Book order (start to end) rather than creation order -- position is an index into the
    // whole publication's positionsList, so it sorts consistently across resources; progression breaks
    // ties between entries that land on the same position (same page/resource).
    const bookOrder = (entry: AnnotationListEntry) => [
      entry.locator.locations.position ?? entry.locator.locations.totalProgression ?? 0,
      entry.locator.locations.progression ?? 0
    ];

    const direction = sortDirection === "asc" ? 1 : -1;
    return [...highlightEntries, ...bookmarkEntries, ...noteEntries].sort((a, b) => {
      const [aPos, aProg] = bookOrder(a);
      const [bPos, bProg] = bookOrder(b);
      return (aPos - bPos || aProg - bProg) * direction;
    });
  }, [highlights, bookmarks, notes, sortDirection]);

  const closeIfTransient = useCallback(() => {
    if (!(actionState?.isOpen && (sheetType === ThSheetTypes.dockedStart || sheetType === ThSheetTypes.dockedEnd))) {
      setOpen(false);
    }
  }, [actionState, sheetType, setOpen]);

  const handleSelect = useCallback((locator: Locator) => {
    // CLAUDE-ADDED: Captured before navigating so the footer can offer a way back to where we were.
    const origin = currentLocator();

    go(locator, true, () => {
      dispatch(setImmersive(true));
      dispatch(setUserNavigated(true));
      if (origin) dispatch(setReturnLocator(origin.serialize()));
      dispatch(setFlashLocator(locator.serialize()));
      closeIfTransient();
      focusReadingContainer();
    });
  }, [go, currentLocator, dispatch, closeIfTransient]);

  const handleDelete = useCallback((entry: AnnotationListEntry) => {
    if (!manifestUrl) return;
    if (entry.kind === "highlight") dispatch(deleteHighlight(manifestUrl, entry.id));
    else if (entry.kind === "bookmark") dispatch(deleteBookmark(manifestUrl, entry.id));
    else dispatch(deleteNote(manifestUrl, entry.id));
  }, [manifestUrl, dispatch]);

  const handleUpdateNote = useCallback((entry: AnnotationListEntry, text: string) => {
    if (!manifestUrl) return;
    const existing = notes.find(note => note.id === entry.id);
    if (!existing) return;
    dispatch(addOrUpdateNote(manifestUrl, { ...existing, text, updatedAt: Date.now() }));
  }, [manifestUrl, notes, dispatch]);

  const handleBookmarkPage = useCallback(() => {
    if (!manifestUrl) return;
    const locator = currentLocator();
    if (!locator) return;

    dispatch(addBookmark(manifestUrl, {
      id: crypto.randomUUID(),
      locator: locator.serialize(),
      createdAt: Date.now()
    }));
  }, [manifestUrl, currentLocator, dispatch]);

  // CLAUDE-ADDED: panelStyles.wrapper forces a fixed ~500px width so the popover/modal/bottom-sheet
  // variants (which otherwise default to a narrower 340px popover) are wide enough for the tabs/list --
  // but a docked panel is already sized responsively by react-resizable-panels via .docked's
  // width:100%/max-width:100%, and forcing a fixed px width on top of that overflowed the panel (and, via
  // the flex layout, the whole page) whenever the docked column was narrower than 500px.
  const isDocked = sheetType === ThSheetTypes.dockedStart || sheetType === ThSheetTypes.dockedEnd;

  return (
    <StatefulSheetWrapper
      sheetType={ sheetType }
      sheetProps={ {
        id: ThActionsKeys.annotations,
        triggerRef: triggerRef,
        heading: t("reader.annotations.title"),
        className: isDocked ? undefined : panelStyles.wrapper,
        placement: "bottom",
        isOpen: actionState?.isOpen || false,
        onOpenChange: setOpen,
        onClosePress: () => setOpen(false),
        docker: docking.getDocker()
      } }
    >
      <AnnotationsContent
        entries={ entries }
        activeTab={ activeTab }
        onTabChange={ setActiveTab }
        onSelect={ handleSelect }
        onDelete={ handleDelete }
        onUpdateNote={ handleUpdateNote }
        onBookmarkPage={ handleBookmarkPage }
        sortDirection={ sortDirection }
        onToggleSortDirection={ toggleSortDirection }
      />
    </StatefulSheetWrapper>
  );
};
