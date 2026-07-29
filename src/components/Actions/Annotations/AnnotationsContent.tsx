"use client";

import { useState } from "react";

import { Locator } from "@readium/shared";
import { useI18n } from "@/i18n/useI18n";
import { useIsScroll } from "@/hooks";
import { useAppSelector } from "@/lib/hooks";

import { getHighlightColorHex } from "./helpers/highlightColors";
import { getLocationLabel } from "./helpers/locationLabel";
import { formatTimestamp } from "./helpers/formatTimestamp";
import { NoteMarkdownExcerpt } from "./helpers/NoteMarkdownExcerpt";

import BookmarkIcon from "./assets/icons/bookmark.svg";
import DeleteIcon from "./assets/icons/delete.svg";
import EditIcon from "./assets/icons/edit.svg";
import CheckIcon from "./assets/icons/check.svg";
import CloseIcon from "./assets/icons/close.svg";
import SortDirectionIcon from "./assets/icons/sortDirection.svg";

import styles from "./assets/styles/thorium-web.annotations.module.css";

export type AnnotationsTab = "all" | "highlights" | "bookmarks" | "notes";

export interface AnnotationListEntry {
  id: string;
  kind: "highlight" | "bookmark" | "note";
  locator: Locator;
  color?: string;
  noteText?: string;
  createdAt: number;
  updatedAt?: number;
  chapterTitle?: string;
}

interface AnnotationsContentProps {
  entries: AnnotationListEntry[];
  activeTab: AnnotationsTab;
  onTabChange: (tab: AnnotationsTab) => void;
  onSelect: (locator: Locator) => void;
  onDelete: (entry: AnnotationListEntry) => void;
  onUpdateNote: (entry: AnnotationListEntry, text: string) => void;
  onBookmarkPage: () => void;
  sortDirection: "asc" | "desc";
  onToggleSortDirection: () => void;
}

const TABS: AnnotationsTab[] = ["all", "highlights", "bookmarks", "notes"];

export const AnnotationsContent = ({ entries, activeTab, onTabChange, onSelect, onDelete, onUpdateNote, onBookmarkPage, sortDirection, onToggleSortDirection }: AnnotationsContentProps) => {
  const { t } = useI18n();
  const isScroll = useIsScroll();
  const totalPages = useAppSelector(state => state.publication.exactPageCount?.totalPages);
  const resourcePages = useAppSelector(state => state.publication.exactPageCount?.resourcePages);

  // CLAUDE-ADDED: Keyed the same way as each <li> (`${kind}-${id}`) -- editing is inline, in place of
  // that row's own excerpt/actions, so only one row's identity needs tracking at a time.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const filteredEntries = activeTab === "all"
    ? entries
    : entries.filter(entry => `${ entry.kind }s` === activeTab);

  const beginEditing = (entry: AnnotationListEntry, key: string) => {
    setEditingKey(key);
    setEditDraft(entry.noteText ?? "");
  };

  const cancelEditing = () => setEditingKey(null);

  const saveEditing = (entry: AnnotationListEntry) => {
    if (!editDraft.trim()) return;
    onUpdateNote(entry, editDraft);
    setEditingKey(null);
  };

  return (
    <div className={ styles.panelWrapper }>
      <div className={ styles.panelTabs } role="tablist">
        { TABS.map(tab => (
          <button
            key={ tab }
            type="button"
            role="tab"
            className={ styles.panelTab }
            data-selected={ activeTab === tab || undefined }
            aria-selected={ activeTab === tab }
            onClick={ () => onTabChange(tab) }
          >
            { t(`reader.annotations.tabs.${ tab }`) }
          </button>
        )) }
      </div>

      <div className={ styles.toolbar }>
        <button type="button" className={ styles.bookmarkPageButton } onClick={ onBookmarkPage }>
          <BookmarkIcon aria-hidden="true" focusable="false" />
          { t("reader.annotations.bookmarkPage") }
        </button>

        <button
          type="button"
          className={ styles.sortDirectionButton }
          data-direction={ sortDirection }
          onClick={ onToggleSortDirection }
          aria-label={ t(`reader.annotations.sortOrder.${ sortDirection === "asc" ? "beginningToEnd" : "endToBeginning" }`) }
          title={ t(`reader.annotations.sortOrder.${ sortDirection === "asc" ? "beginningToEnd" : "endToBeginning" }`) }
        >
          <SortDirectionIcon aria-hidden="true" focusable="false" />
        </button>
      </div>

      { filteredEntries.length === 0 ? (
        <p className={ styles.empty }>{ t("reader.annotations.emptyState") }</p>
      ) : (
        <ul className={ styles.list }>
          { filteredEntries.map(entry => {
            const key = `${ entry.kind }-${ entry.id }`;
            const isEditing = editingKey === key;

            return (
              <li
                key={ key }
                className={ styles.listItem }
                tabIndex={ 0 }
                role="button"
                onClick={ () => { if (!isEditing) onSelect(entry.locator); } }
                onKeyDown={ event => { if (!isEditing && (event.key === "Enter" || event.key === " ")) onSelect(entry.locator); } }
              >
                { entry.kind === "highlight" &&
                  <span className={ styles.listItemColor } style={ { backgroundColor: getHighlightColorHex(entry.color ?? "") } } />
                }

                { isEditing ? (
                  <div className={ styles.listItemEdit } onClick={ event => event.stopPropagation() }>
                    <textarea
                      className={ styles.noteTextarea }
                      value={ editDraft }
                      onChange={ event => setEditDraft(event.target.value) }
                      placeholder={ t("reader.annotations.notePlaceholder") }
                      autoFocus
                    />
                    <div className={ styles.noteEditorActions }>
                      <button type="button" className={ styles.iconButton } aria-label={ t("reader.annotations.save") } onClick={ () => saveEditing(entry) }>
                        <CheckIcon aria-hidden="true" focusable="false" />
                      </button>
                      <button type="button" className={ styles.iconButton } aria-label={ t("common.actions.cancel") } onClick={ cancelEditing }>
                        <CloseIcon aria-hidden="true" focusable="false" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                  <span className={ styles.listItemBody }>
                    <span className={ styles.listItemExcerpt }>
                      { entry.kind === "note" && entry.noteText
                        ? <NoteMarkdownExcerpt text={ entry.noteText } />
                        : (entry.locator.text?.highlight || entry.chapterTitle || entry.locator.href) }
                    </span>
                    { entry.kind === "note" && entry.locator.text?.highlight &&
                      <span className={ styles.listItemQuote }>“{ entry.locator.text.highlight }”</span>
                    }
                    <span className={ styles.listItemMeta }>
                      { [
                        // CLAUDE-ADDED: Omitted here when it's already the excerpt above (a
                        // text-less bookmark/highlight with no quote falls back to chapterTitle as
                        // its own excerpt line) so the chapter name isn't shown twice in the same row.
                        (entry.kind === "note" || entry.locator.text?.highlight) ? entry.chapterTitle : undefined,
                        getLocationLabel(t, entry.locator, isScroll, totalPages, resourcePages),
                        entry.kind === "note"
                          ? t("reader.annotations.lastEdited", { date: formatTimestamp(entry.updatedAt ?? entry.createdAt) })
                          : formatTimestamp(entry.createdAt)
                      ].filter(Boolean).join(" · ") }
                    </span>
                  </span>

                  { entry.kind === "note" &&
                    <button
                      type="button"
                      className={ styles.listItemEditButton }
                      aria-label={ t("reader.annotations.actions.editNote.compact") }
                      onClick={ event => { event.stopPropagation(); beginEditing(entry, key); } }
                    >
                      <EditIcon aria-hidden="true" focusable="false" />
                    </button>
                  }

                  <button
                    type="button"
                    className={ styles.listItemDelete }
                    aria-label={ t("reader.annotations.delete") }
                    onClick={ event => { event.stopPropagation(); onDelete(entry); } }
                  >
                    <DeleteIcon aria-hidden="true" focusable="false" />
                  </button>
                  </>
                ) }
              </li>
            );
          }) }
        </ul>
      ) }
    </div>
  );
};
