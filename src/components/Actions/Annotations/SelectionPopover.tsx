"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import {
  setPendingSelection,
  addHighlight,
  deleteHighlight,
  addBookmark,
  addOrUpdateNote
} from "@/lib/annotationsReducer";
import { StoredHighlight, StoredNote } from "@/lib/userData/annotationTypes";
import { HIGHLIGHT_COLORS } from "./helpers/highlightColors";
import { useI18n } from "@/i18n/useI18n";

import BookmarkIcon from "./assets/icons/bookmark.svg";
import NoteIcon from "./assets/icons/note.svg";
import DeleteIcon from "./assets/icons/delete.svg";
import CheckIcon from "./assets/icons/check.svg";
import CloseIcon from "./assets/icons/close.svg";
import DictionaryIcon from "./assets/icons/dictionary.svg";

import popoverStyles from "./assets/styles/thorium-web.annotations.module.css";

type DictionaryStatus = "loading" | "success" | "error";

// CLAUDE-ADDED: One floating popover handles a fresh text selection (pick a highlight color / bookmark
// / note) and a tap on an already-rendered *highlight* (change color or delete) -- annotationsReducer's
// pendingSelection.existing tells this which mode to render. Tapping an existing *note* instead opens
// NoteOverlay.tsx, not this popover -- see StatefulReader.tsx's noteObserver. Positioned at page-absolute
// coordinates computed by the caller (StatefulReader.tsx) since this component has no access to the
// reading iframe's layout itself.
export const SelectionPopover = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const pendingSelection = useAppSelector(state => state.annotations.pendingSelection);
  const manifestUrl = useAppSelector(state => state.annotations.manifestUrl);

  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryStatus, setDictionaryStatus] = useState<DictionaryStatus>("loading");
  const [dictionaryText, setDictionaryText] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dictionaryAbortRef = useRef<AbortController | null>(null);

  const existing = pendingSelection?.existing;

  useEffect(() => {
    setNoteMode(false);
    setNoteText("");
    setDictionaryOpen(false);
    dictionaryAbortRef.current?.abort();
  }, [pendingSelection?.locator]);

  // CLAUDE-ADDED: Aborts any in-flight lookup on unmount so a slow response can't call setState after
  // the popover (and the selection it was looking up) is gone.
  useEffect(() => () => dictionaryAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!pendingSelection) return;

    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") dispatch(setPendingSelection(null));
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        dispatch(setPendingSelection(null));
      }
    };

    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [pendingSelection, dispatch]);

  // CLAUDE-ADDED: Positions from the popover's *actual* rendered size (measured post-render, before
  // paint) rather than a fixed-height guess -- the note editor is much taller than the color-swatch
  // row, and a fixed threshold sized for the swatches let the note editor overflow past the top of the
  // viewport when it expanded. Runs again on noteMode change since that's what changes the height.
  useLayoutEffect(() => {
    if (!pendingSelection || !popoverRef.current) return;

    const rect = popoverRef.current.getBoundingClientRect();
    const margin = 12;

    const fitsAbove = pendingSelection.y - margin >= rect.height;
    const top = fitsAbove
      ? pendingSelection.y - rect.height - margin
      : pendingSelection.y + pendingSelection.height + margin;
    const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

    const left = pendingSelection.x + pendingSelection.width / 2 - rect.width / 2;
    const clampedLeft = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

    setPosition({ top: clampedTop, left: clampedLeft });
  }, [pendingSelection, noteMode, dictionaryOpen, dictionaryStatus]);

  if (!pendingSelection || !manifestUrl) return null;

  const close = () => {
    dictionaryAbortRef.current?.abort();
    dispatch(setPendingSelection(null));
  };

  const pickColor = (colorId: string) => {
    const highlight: StoredHighlight = {
      id: existing?.type === "highlight" ? existing.id : crypto.randomUUID(),
      locator: pendingSelection.locator,
      color: colorId,
      createdAt: Date.now()
    };
    dispatch(addHighlight(manifestUrl, highlight));
    close();
  };

  const removeHighlight = () => {
    if (existing?.type !== "highlight") return;
    dispatch(deleteHighlight(manifestUrl, existing.id));
    close();
  };

  const saveBookmark = () => {
    dispatch(addBookmark(manifestUrl, {
      id: crypto.randomUUID(),
      locator: pendingSelection.locator,
      createdAt: Date.now()
    }));
    close();
  };

  const saveNote = () => {
    if (!noteText.trim()) return;

    const now = Date.now();
    const note: StoredNote = { id: crypto.randomUUID(), locator: pendingSelection.locator, text: noteText, createdAt: now, updatedAt: now };

    dispatch(addOrUpdateNote(manifestUrl, note));
    close();
  };

  const lookUpDictionary = async () => {
    setDictionaryOpen(true);
    setDictionaryStatus("loading");

    const controller = new AbortController();
    dictionaryAbortRef.current = controller;

    try {
      const response = await fetch("/api/dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pendingSelection.text }),
        signal: controller.signal
      });

      const data = await response.json();
      if (!response.ok || !data.definition) {
        setDictionaryText(t(data.error === "not_found" ? "reader.annotations.dictionary.notFound" : "reader.annotations.dictionary.error"));
        setDictionaryStatus("error");
        return;
      }

      setDictionaryText(data.definition);
      setDictionaryStatus("success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setDictionaryText(t("reader.annotations.dictionary.error"));
      setDictionaryStatus("error");
    }
  };

  // CLAUDE-ADDED: Falls back to an unclamped guess only for the single frame before the layout effect
  // above has measured the real size -- since that effect runs before paint, this fallback is never
  // actually visible to the user, it just needs to exist so the ref has something to measure.
  const style = position ?? { top: pendingSelection.y, left: pendingSelection.x };

  return (
    <div ref={ popoverRef } className={ popoverStyles.selectionPopover } style={ style }>
      { noteMode ? (
        <div className={ popoverStyles.noteEditor }>
          <textarea
            className={ popoverStyles.noteTextarea }
            value={ noteText }
            onChange={ event => setNoteText(event.target.value) }
            placeholder={ t("reader.annotations.notePlaceholder") }
            autoFocus
          />
          <div className={ popoverStyles.noteEditorActions }>
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("reader.annotations.save") } onClick={ saveNote }>
              <CheckIcon aria-hidden="true" focusable="false" />
            </button>
          </div>
        </div>
      ) : dictionaryOpen ? (
        <div className={ popoverStyles.dictionaryPanel }>
          <div className={ popoverStyles.dictionaryPanelHeader }>
            <span className={ popoverStyles.dictionaryPanelTitle }>{ t("reader.annotations.dictionary.title") }</span>
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("common.actions.close") } onClick={ close }>
              <CloseIcon aria-hidden="true" focusable="false" />
            </button>
          </div>
          <p className={ popoverStyles.dictionaryPanelBody }>
            { dictionaryStatus === "loading" ? t("reader.annotations.dictionary.loading") : dictionaryText }
          </p>
          { dictionaryStatus === "success" &&
            <span className={ popoverStyles.dictionaryPanelAttribution }>{ t("reader.annotations.dictionary.attribution") }</span>
          }
        </div>
      ) : (
        <div className={ popoverStyles.selectionActions }>
          { HIGHLIGHT_COLORS.map(color => (
            <button
              key={ color.id }
              type="button"
              className={ popoverStyles.colorSwatch }
              style={ { backgroundColor: color.hex } }
              aria-label={ t(color.labelKey) }
              onClick={ () => pickColor(color.id) }
            />
          )) }

          { existing?.type === "highlight" &&
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("reader.annotations.delete") } onClick={ removeHighlight }>
              <DeleteIcon aria-hidden="true" focusable="false" />
            </button>
          }

          { !existing &&
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("reader.annotations.bookmarkSelection") } onClick={ saveBookmark }>
              <BookmarkIcon aria-hidden="true" focusable="false" />
            </button>
          }

          { !existing &&
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("reader.annotations.addNote") } onClick={ () => setNoteMode(true) }>
              <NoteIcon aria-hidden="true" focusable="false" />
            </button>
          }

          { !existing &&
            <button type="button" className={ popoverStyles.iconButton } aria-label={ t("reader.annotations.dictionary.lookUp") } onClick={ lookUpDictionary }>
              <DictionaryIcon aria-hidden="true" focusable="false" />
            </button>
          }
        </div>
      ) }
    </div>
  );
};
