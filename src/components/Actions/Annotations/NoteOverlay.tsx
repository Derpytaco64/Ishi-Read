"use client";

import { useEffect, useRef, useState } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ThModal } from "@/core/Components/Containers/ThModal";

import { useWebkitPatch } from "@/components/Sheets/hooks/useWebkitPatch";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { addOrUpdateNote, deleteNote, closeNoteOverlay, setNoteOverlayMode } from "@/lib/annotationsReducer";
import { StoredNote } from "@/lib/userData/annotationTypes";
import { Locator } from "@readium/shared";

import { useI18n } from "@/i18n/useI18n";
import { formatTimestamp } from "./helpers/formatTimestamp";

import CloseIcon from "./assets/icons/close.svg";
import EditIcon from "./assets/icons/edit.svg";
import CheckIcon from "./assets/icons/check.svg";
import DeleteIcon from "./assets/icons/delete.svg";

import styles from "./assets/styles/thorium-web.annotations.module.css";

// CLAUDE-ADDED: Opened by tapping an existing note decoration in the reading content (see
// StatefulReader.tsx's noteObserver) -- reads the note first (view mode) rather than dropping straight
// into an editable textarea like the old tap-to-edit flow did, since a note has content worth reading
// before deciding to edit it. "Begin editing" switches to edit mode in place; Escape/backdrop/X close
// the whole overlay, while edit mode's own X only cancels the edit and returns to view mode.
export const NoteOverlay = () => {
  const { t } = useI18n();
  const dispatch = useAppDispatch();

  const manifestUrl = useAppSelector(state => state.annotations.manifestUrl);
  const notes = useAppSelector(state => state.annotations.notes);
  const noteOverlay = useAppSelector(state => state.annotations.noteOverlay);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");

  const note = noteOverlay ? notes.find(item => item.id === noteOverlay.noteId) : undefined;
  const isOpen = !!noteOverlay && !!note;
  const isEditing = noteOverlay?.mode === "edit";

  // CLAUDE-ADDED: This ThModal bypassed StatefulModalBase (the only other place in the app that
  // calls this hook), so opening/closing a note never got the WebKit scroll-reflow fix every other
  // sheet/modal already relies on -- see useWebkitPatch's own comment for why React Aria's
  // Popover/Modal breaks scroll on WebKit in scroll mode without it.
  useWebkitPatch(isOpen);

  const close = () => dispatch(closeNoteOverlay());

  // CLAUDE-ADDED: Re-syncs the draft whenever edit mode is (re)entered, so switching notes or
  // cancelling-then-re-editing never carries over a stale buffer from a previous edit.
  useEffect(() => {
    if (isEditing) setDraft(note?.text ?? "");
  }, [isEditing, note?.text]);

  // CLAUDE-ADDED: Guards against the note being deleted elsewhere (e.g. the annotations list) while
  // this overlay is open on it -- without this it would keep rendering a dialog for a note that no
  // longer exists.
  useEffect(() => {
    if (noteOverlay && !note) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteOverlay, note]);

  if (!isOpen || !note) return null;

  const locator = Locator.deserialize(note.locator);
  const quote = locator?.text?.highlight;

  const beginEditing = () => dispatch(setNoteOverlayMode("edit"));

  const cancelEditing = () => dispatch(setNoteOverlayMode("view"));

  const saveEdit = () => {
    if (!manifestUrl || !draft.trim()) return;
    const updated: StoredNote = { ...note, text: draft, updatedAt: Date.now() };
    dispatch(addOrUpdateNote(manifestUrl, updated));
    dispatch(setNoteOverlayMode("view"));
  };

  const removeNote = () => {
    if (!manifestUrl) return;
    dispatch(deleteNote(manifestUrl, note.id));
    close();
  };

  return (
    <ThModal
      ref={ overlayRef }
      focusOptions={{ withinRef: overlayRef, trackedState: isOpen, action: { type: "focus" } }}
      compounds={{
        dialog: {
          className: styles.noteOverlayDialog,
          "aria-label": t("reader.annotations.note.title")
        }
      }}
      isOpen={ isOpen }
      onOpenChange={ open => { if (!open) close(); } }
      isDismissable={ true }
      className={ styles.noteOverlayBackdrop }
    >
      <div className={ styles.noteOverlayHeader }>
        <span className={ styles.noteOverlayTitleGroup }>
          <span className={ styles.noteOverlayTitle }>{ t("reader.annotations.note.title") }</span>
          <span className={ styles.noteOverlayTimestamp }>{ formatTimestamp(note.updatedAt ?? note.createdAt) }</span>
        </span>
        <button type="button" className={ styles.iconButton } aria-label={ t("common.actions.close") } onClick={ close }>
          <CloseIcon aria-hidden="true" focusable="false" />
        </button>
      </div>

      <div className={ styles.noteOverlayBody }>
        { quote &&
          <p className={ styles.noteOverlayQuote }>“{ quote }”</p>
        }

        { isEditing ? (
          <div className={ `${ styles.noteEditor } ${ styles.noteOverlayEditor }` }>
            <textarea
              className={ `${ styles.noteTextarea } ${ styles.noteOverlayTextarea }` }
              value={ draft }
              onChange={ event => setDraft(event.target.value) }
              placeholder={ t("reader.annotations.notePlaceholder") }
              autoFocus
            />
            <div className={ styles.noteEditorActions }>
              <button type="button" className={ styles.iconButton } aria-label={ t("reader.annotations.save") } onClick={ saveEdit }>
                <CheckIcon aria-hidden="true" focusable="false" />
              </button>
              <button type="button" className={ styles.iconButton } aria-label={ t("common.actions.cancel") } onClick={ cancelEditing }>
                <CloseIcon aria-hidden="true" focusable="false" />
              </button>
            </div>
          </div>
        ) : (
          <>
          <div className={ styles.noteOverlayText }>
            <ReactMarkdown remarkPlugins={ [remarkGfm] }>{ note.text }</ReactMarkdown>
          </div>
          <div className={ styles.noteEditorActions }>
            <button type="button" className={ styles.iconButton } aria-label={ t("reader.annotations.actions.editNote.compact") } onClick={ beginEditing }>
              <EditIcon aria-hidden="true" focusable="false" />
            </button>
            <button type="button" className={ styles.iconButton } aria-label={ t("reader.annotations.delete") } onClick={ removeNote }>
              <DeleteIcon aria-hidden="true" focusable="false" />
            </button>
          </div>
          </>
        ) }
      </div>
    </ThModal>
  );
};
