"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import {
  Button,
  Disclosure,
  DisclosurePanel,
  GridList,
  GridListItem,
  Heading,
  useDragAndDrop
} from "react-aria-components";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";
import { ThSwitch } from "@/core/Components/Settings/ThSwitch";
import { ThSlider } from "@/core/Components/Settings/ThSlider";

import { THEME_STORAGE_KEY } from "@/app/themeStorage";
import { SHELF_LABELS, ShelfKey, ShelfPrefs } from "@/app/shelfPrefs";
import { useAccentColor } from "@/app/useAccentColor";
import { MIN_COVER_SIZE, MAX_COVER_SIZE } from "@/app/coverSizeStorage";
import { useBookFolder } from "@/app/useBookFolder";
import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";

import logo from "@/assets/ishamel.png";
import floofLogo from "@/assets/foof_ishmael.png";
import ChevronDown from "./assets/icons/chevron_down.svg";
import Gear from "./assets/icons/gear.svg";
import DragIndicator from "./assets/icons/drag_indicator.svg";

import styles from "./assets/styles/thorium-web.libraryMenu.module.css";

export interface StatefulLibraryMenuProps {
  shelfPrefs: ShelfPrefs;
  onToggleShelf: (key: ShelfKey) => void;
  shelfOrder: ShelfKey[];
  onReorderShelves: (order: ShelfKey[]) => void;
  coverSize: number;
  onChangeCoverSize: (size: number) => void;
  onBookFolderSaved?: () => void;
}

export const StatefulLibraryMenu = ({
  shelfPrefs,
  onToggleShelf,
  shelfOrder,
  onReorderShelves,
  coverSize,
  onChangeCoverSize,
  onBookFolderSaved
}: StatefulLibraryMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Defaults to light on the server render; the mount effect below reads back what the
  // blocking init script (layout.tsx) already applied to <html>, so this never overwrites
  // it and can't cause a flash.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

    // CLAUDE-ADDED: Same hydrateFromServer pattern the reader settings use. Unlike the localStorage
    // seed above (already applied by layout.tsx's blocking init script before this ever runs), a
    // value that arrives from the server here can genuinely differ, so it has to actually repaint.
    fetchLibraryPrefsFromServer().then((server) => {
      const fromServer = server?.theme;
      if (fromServer !== "dark" && fromServer !== "light") return;

      setTheme(fromServer);
      localStorage.setItem(THEME_STORAGE_KEY, fromServer);
      if (fromServer === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    });
  }, []);

  const { accentColor, setAccentColor } = useAccentColor();

  // CLAUDE-ADDED: Draft is a separate string from the saved bookFolder so typing doesn't fire a
  // save (and its filesystem validation) on every keystroke -- only committed on blur/Enter, same
  // moment the input's value is next allowed to be overwritten by a fresh fetch/save result.
  const { bookFolder, saveBookFolder, isSaving, error: bookFolderError } = useBookFolder();
  const [bookFolderDraft, setBookFolderDraft] = useState(bookFolder);
  const [bookFolderSaved, setBookFolderSaved] = useState(false);

  useEffect(() => {
    setBookFolderDraft(bookFolder);
  }, [bookFolder]);

  const commitBookFolder = async () => {
    if (bookFolderDraft === bookFolder) return;

    setBookFolderSaved(false);
    const ok = await saveBookFolder(bookFolderDraft);
    if (ok) {
      setBookFolderSaved(true);
      onBookFolderSaved?.();
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      saveLibraryPrefsToServer({ theme: next });
      if (next === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      return next;
    });
  };

  // CLAUDE-ADDED: Reorders shelfOrder directly (rather than via useListData's own copy) since
  // page.tsx already owns shelfOrder as the single source of truth and persists it -- this just
  // computes the new array and hands it up.
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(e) {
      const draggedKey = [...e.keys][0] as ShelfKey;
      const targetKey = e.target.key as ShelfKey;
      if (draggedKey === targetKey) return;

      const withoutDragged = shelfOrder.filter((key) => key !== draggedKey);
      const targetIndex = withoutDragged.indexOf(targetKey);
      const insertIndex = e.target.dropPosition === "before" ? targetIndex : targetIndex + 1;

      onReorderShelves([
        ...withoutDragged.slice(0, insertIndex),
        draggedKey,
        ...withoutDragged.slice(insertIndex)
      ]);
    }
  });

  return (
    <>
    <Button
      className={ styles.trigger }
      onPress={ () => setIsOpen(true) }
      aria-label="Open menu"
    >
      <Image src={ logo } alt="" className={ styles.logo } priority />
    </Button>

    <ThModal
      isOpen={ isOpen }
      onOpenChange={ setIsOpen }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: {
          className: styles.dialog
        }
      }}
    >
      <ThContainerHeaderWithClose
        label="Menu"
        className={ styles.header }
        compounds={{
          heading: { className: styles.visuallyHidden },
          button: {
            className: styles.closeButton,
            "aria-label": "Close menu",
            onPress: () => setIsOpen(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        <div className={ styles.brand }>
          <Image src={ floofLogo } alt="" className={ styles.logoLarge } />
        </div>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <Gear aria-hidden="true" focusable="false" className={ styles.disclosureIcon } />
              <span className={ styles.disclosureLabel }>Settings</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <Disclosure className={ styles.nestedDisclosure }>
              <Heading className={ styles.disclosureHeading }>
                <Button slot="trigger" className={ styles.disclosureTrigger }>
                  <span className={ styles.disclosureLabel }>Shelves</span>
                  <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
                </Button>
              </Heading>

              <DisclosurePanel className={ styles.disclosurePanel }>
                <GridList
                  aria-label="Shelf order and visibility"
                  items={ shelfOrder.map((key) => ({ key, label: SHELF_LABELS[key] })) }
                  dragAndDropHooks={ dragAndDropHooks }
                  className={ styles.shelfList }
                >
                  { (item) => (
                    <GridListItem
                      id={ item.key }
                      textValue={ item.label }
                      className={ styles.shelfRow }
                    >
                      <Button
                        slot="drag"
                        className={ styles.shelfDragHandle }
                        aria-label={ `Reorder ${ item.label }` }
                      >
                        <DragIndicator aria-hidden="true" focusable="false" />
                      </Button>
                      <ThSwitch
                        isSelected={ shelfPrefs[item.key] }
                        onChange={ () => onToggleShelf(item.key) }
                        label={ item.label }
                        className={ styles.switch }
                        compounds={{
                          indicator: { className: styles.switchIndicator }
                        }}
                      />
                    </GridListItem>
                  ) }
                </GridList>
              </DisclosurePanel>
            </Disclosure>

            <Disclosure className={ styles.nestedDisclosure }>
              <Heading className={ styles.disclosureHeading }>
                <Button slot="trigger" className={ styles.disclosureTrigger }>
                  <span className={ styles.disclosureLabel }>Accent Color</span>
                  <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
                </Button>
              </Heading>

              <DisclosurePanel className={ styles.disclosurePanel }>
                { /* CLAUDE-ADDED: Native <input type="color"> rather than a custom picker -- every
                     modern browser ships its own OS-level color picker UI behind this, which covers
                     swatches/hex-entry/eyedropper for free instead of us building any of it. */ }
                <label className={ styles.colorPickerRow }>
                  <span>Play button &amp; progress dial color</span>
                  <input
                    type="color"
                    className={ styles.colorPicker }
                    value={ accentColor }
                    onChange={ (e) => setAccentColor(e.target.value) }
                    aria-label="Accent color"
                  />
                </label>
              </DisclosurePanel>
            </Disclosure>

            <Disclosure className={ styles.nestedDisclosure }>
              <Heading className={ styles.disclosureHeading }>
                <Button slot="trigger" className={ styles.disclosureTrigger }>
                  <span className={ styles.disclosureLabel }>Cover Size</span>
                  <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
                </Button>
              </Heading>

              <DisclosurePanel className={ styles.disclosurePanel }>
                <ThSlider
                  aria-label="Cover size"
                  className={ styles.coverSizeSlider }
                  range={ [MIN_COVER_SIZE, MAX_COVER_SIZE] }
                  value={ coverSize }
                  onChange={ (value) => onChangeCoverSize(Array.isArray(value) ? value[0] : value) }
                  compounds={{
                    output: { className: styles.coverSizeOutput },
                    track: { className: styles.coverSizeTrack },
                    thumb: { className: styles.coverSizeThumb }
                  }}
                />
              </DisclosurePanel>
            </Disclosure>

            <Disclosure className={ styles.nestedDisclosure }>
              <Heading className={ styles.disclosureHeading }>
                <Button slot="trigger" className={ styles.disclosureTrigger }>
                  <span className={ styles.disclosureLabel }>Book Folder</span>
                  <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
                </Button>
              </Heading>

              <DisclosurePanel className={ styles.disclosurePanel }>
                <label className={ styles.bookFolderRow }>
                  <span>Folder to scan for books</span>
                  <input
                    type="text"
                    className={ styles.bookFolderInput }
                    value={ bookFolderDraft }
                    onChange={ (e) => {
                      setBookFolderDraft(e.target.value);
                      setBookFolderSaved(false);
                    } }
                    onBlur={ commitBookFolder }
                    onKeyDown={ (e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    } }
                    aria-label="Book folder path"
                    spellCheck={ false }
                  />
                </label>
                { isSaving && <p className={ styles.bookFolderStatus }>Saving…</p> }
                { !isSaving && bookFolderError && (
                  <p className={ styles.bookFolderStatusError }>{ bookFolderError }</p>
                ) }
                { !isSaving && !bookFolderError && bookFolderSaved && (
                  <p className={ styles.bookFolderStatus }>Saved</p>
                ) }
              </DisclosurePanel>
            </Disclosure>
          </DisclosurePanel>
        </Disclosure>

        <div className={ styles.footer }>
          <ThSwitch
            isSelected={ theme === "dark" }
            onChange={ toggleTheme }
            label={ theme === "dark" ? "Dark mode" : "Light mode" }
            className={ styles.switch }
            compounds={{
              indicator: { className: styles.switchIndicator }
            }}
          />
        </div>
      </ThContainerBody>
    </ThModal>
    </>
  );
};
