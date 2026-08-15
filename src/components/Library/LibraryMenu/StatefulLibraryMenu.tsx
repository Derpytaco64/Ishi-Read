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
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  useDragAndDrop
} from "react-aria-components";

import classNames from "classnames";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";
import { ThSwitch } from "@/core/Components/Settings/ThSwitch";
import { ThSlider } from "@/core/Components/Settings/ThSlider";

import { THEME_STORAGE_KEY } from "@/app/themeStorage";
import { SHELF_LABELS, ShelfKey, ShelfPrefs } from "@/app/shelfPrefs";
import { LibraryView } from "@/app/libraryView";
import { CustomShelf, ShelfModalState } from "@/app/customShelves";
import { useAccentColor } from "@/app/useAccentColor";
import { MIN_COVER_SIZE, MAX_COVER_SIZE } from "@/app/coverSizeStorage";
import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";

import logo from "@/assets/ishamel.png";
import floofLogo from "@/assets/foof_ishmael.png";
import ChevronDown from "./assets/icons/chevron_down.svg";
import Gear from "./assets/icons/gear.svg";
import DragIndicator from "./assets/icons/drag_indicator.svg";
import HomeIcon from "./assets/icons/home.svg";
import BookIcon from "./assets/icons/book.svg";
import HeadphonesIcon from "./assets/icons/headphones.svg";
import LibraryBooksIcon from "./assets/icons/library_books.svg";
import FolderIcon from "./assets/icons/folder.svg";
import AddIcon from "./assets/icons/add.svg";
import CloseIcon from "./assets/icons/close.svg";

import styles from "./assets/styles/thorium-web.libraryMenu.module.css";

export interface StatefulLibraryMenuProps {
  activeView: LibraryView;
  onNavigate: (view: LibraryView) => void;
  shelves: CustomShelf[];
  onDeleteShelf: (shelfId: string) => void;
  onReorderCustomShelves: (shelves: CustomShelf[]) => void;
  // CLAUDE-ADDED: The create/edit modal itself is owned by page.tsx now (not this component) since
  // the book context menu's "Create new shelf" needs to trigger the same modal instance -- this
  // component only ever requests state changes (open to create, open to edit a specific shelf), it
  // never reads the current state itself.
  onShelfModalStateChange: (state: ShelfModalState) => void;
  activeShelfId: string | null;
  onSelectShelf: (shelfId: string) => void;
  shelfPrefs: ShelfPrefs;
  onToggleShelf: (key: ShelfKey) => void;
  shelfOrder: ShelfKey[];
  onReorderShelves: (order: ShelfKey[]) => void;
  coverSize: number;
  onChangeCoverSize: (size: number) => void;
}

export const StatefulLibraryMenu = ({
  activeView,
  onNavigate,
  shelves,
  onDeleteShelf,
  onReorderCustomShelves,
  onShelfModalStateChange,
  activeShelfId,
  onSelectShelf,
  shelfPrefs,
  onToggleShelf,
  shelfOrder,
  onReorderShelves,
  coverSize,
  onChangeCoverSize
}: StatefulLibraryMenuProps) => {
  // CLAUDE-ADDED: Right-click-on-a-shelf-tab context menu (Edit/Delete), positioned at the cursor
  // the same way StatefulBookContextMenu does -- an invisible anchor Button placed at the click
  // coordinates, since react-aria-components has no built-in "open at cursor" trigger.
  const [shelfContextMenu, setShelfContextMenu] = useState<{ shelfId: string; x: number; y: number } | null>(null);

  // CLAUDE-ADDED: Same confirm-before-delete pattern as StatefulAnnotationsContainer's
  // highlight/bookmark/note deletion -- a centered ThModal (not a native window.confirm) asking
  // "are you sure" before onDeleteShelf actually runs.
  const [pendingDeleteShelfId, setPendingDeleteShelfId] = useState<string | null>(null);
  const pendingDeleteShelfName = shelves.find((shelf) => shelf.id === pendingDeleteShelfId)?.name;

  const [isOpen, setIsOpen] = useState(false);

  // Defaults to light on the server render; the mount effect below reads back what the
  // blocking init script (layout.tsx) already applied to <html>, so this never overwrites
  // it and can't cause a flash.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(current);

    // CLAUDE-ADDED: Same hydrateFromServer pattern the reader settings use. Unlike the localStorage
    // seed above (already applied by layout.tsx's blocking init script before this ever runs), a
    // value that arrives from the server here can genuinely differ, so it has to actually repaint.
    fetchLibraryPrefsFromServer().then((server) => {
      const fromServer = server?.theme;
      if (fromServer !== "dark" && fromServer !== "light") {
        // CLAUDE-ADDED: The server has never been told this value -- e.g. it was set back when this
        // was localStorage-only, before library-prefs synced to the server at all. Seed it now so a
        // later cleared-storage load has something real to restore instead of falling back to the
        // system preference.
        saveLibraryPrefsToServer({ theme: current });
        return;
      }

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

  // CLAUDE-ADDED: Lets the cover-size number be typed directly instead of only dragged on the
  // slider -- draft is a separate value from the committed coverSize so typing doesn't clamp/commit
  // on every keystroke (including a temporarily out-of-range value while typing, e.g. "1" on the
  // way to "160") and fight the user mid-entry; only committed on blur/Enter.
  const [coverSizeDraft, setCoverSizeDraft] = useState(String(coverSize));

  useEffect(() => {
    setCoverSizeDraft(String(coverSize));
  }, [coverSize]);

  const commitCoverSizeDraft = () => {
    const parsed = Number(coverSizeDraft);
    if (Number.isNaN(parsed)) {
      setCoverSizeDraft(String(coverSize));
      return;
    }

    const clamped = Math.min(MAX_COVER_SIZE, Math.max(MIN_COVER_SIZE, Math.round(parsed)));
    onChangeCoverSize(clamped);
    setCoverSizeDraft(String(clamped));
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

  // CLAUDE-ADDED: Same drag-to-reorder pattern as the Settings > Shelves list above, but reorders
  // the CustomShelf objects themselves (their own array order *is* the display order) instead of a
  // separate ShelfKey order array, since these are user-created shelves rather than a fixed set.
  const { dragAndDropHooks: customShelvesDragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ "text/plain": String(key) })),
    onReorder(e) {
      const draggedId = [...e.keys][0] as string;
      const targetId = e.target.key as string;
      if (draggedId === targetId) return;

      const dragged = shelves.find((shelf) => shelf.id === draggedId);
      if (!dragged) return;

      const withoutDragged = shelves.filter((shelf) => shelf.id !== draggedId);
      const targetIndex = withoutDragged.findIndex((shelf) => shelf.id === targetId);
      const insertIndex = e.target.dropPosition === "before" ? targetIndex : targetIndex + 1;

      onReorderCustomShelves([
        ...withoutDragged.slice(0, insertIndex),
        dragged,
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
        <a
          href="https://github.com/Derpytaco64/Ishi-Read"
          target="_blank"
          rel="noopener noreferrer"
          className={ styles.versionBadge }
        >
          v{ process.env.NEXT_PUBLIC_APP_VERSION }
        </a>

        <div className={ styles.brand }>
          <Image src={ floofLogo } alt="" className={ styles.logoLarge } />
        </div>

        <nav className={ styles.navList } aria-label="Library views">
          <Button
            className={ classNames(styles.navButton, activeView === "home" && styles.navButtonActive) }
            aria-current={ activeView === "home" ? "page" : undefined }
            onPress={ () => {
              onNavigate("home");
              setIsOpen(false);
            } }
          >
            <HomeIcon aria-hidden="true" focusable="false" className={ styles.navIcon } />
            <span className={ styles.navLabel }>Home</span>
          </Button>

          <Button
            className={ classNames(styles.navButton, activeView === "library" && styles.navButtonActive) }
            aria-current={ activeView === "library" ? "page" : undefined }
            onPress={ () => {
              onNavigate("library");
              setIsOpen(false);
            } }
          >
            <BookIcon aria-hidden="true" focusable="false" className={ styles.navIcon } />
            <span className={ styles.navLabel }>Books</span>
          </Button>

          <Button
            className={ classNames(styles.navButton, activeView === "audiobooks" && styles.navButtonActive) }
            aria-current={ activeView === "audiobooks" ? "page" : undefined }
            onPress={ () => {
              onNavigate("audiobooks");
              setIsOpen(false);
            } }
          >
            <HeadphonesIcon aria-hidden="true" focusable="false" className={ styles.navIcon } />
            <span className={ styles.navLabel }>Audiobooks</span>
          </Button>

          <Button
            className={ classNames(styles.navButton, activeView === "series" && styles.navButtonActive) }
            aria-current={ activeView === "series" ? "page" : undefined }
            onPress={ () => {
              onNavigate("series");
              setIsOpen(false);
            } }
          >
            <LibraryBooksIcon aria-hidden="true" focusable="false" className={ styles.navIcon } />
            <span className={ styles.navLabel }>Series</span>
          </Button>
        </nav>

        <Disclosure className={ classNames(styles.disclosure, styles.shelvesDisclosure) } defaultExpanded>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <FolderIcon aria-hidden="true" focusable="false" className={ styles.disclosureIcon } />
              <span className={ styles.disclosureLabel }>Custom Shelves</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            { shelves.length > 0 && (
              <GridList
                aria-label="Custom shelf order"
                items={ shelves.map((shelf) => ({ key: shelf.id, shelf })) }
                dragAndDropHooks={ customShelvesDragAndDropHooks }
                className={ styles.shelfList }
              >
                { (item) => (
                  <GridListItem
                    id={ item.key }
                    textValue={ item.shelf.name }
                    className={ styles.shelfRow }
                  >
                    <Button
                      slot="drag"
                      className={ styles.shelfDragHandle }
                      aria-label={ `Reorder ${ item.shelf.name }` }
                    >
                      <DragIndicator aria-hidden="true" focusable="false" />
                    </Button>
                    <Button
                      className={ classNames(
                        styles.navButton,
                        styles.nestedNavButton,
                        styles.shelfTabButton,
                        activeView === "shelf" && activeShelfId === item.shelf.id && styles.navButtonActive
                      ) }
                      aria-current={ activeView === "shelf" && activeShelfId === item.shelf.id ? "page" : undefined }
                      onPress={ () => {
                        onSelectShelf(item.shelf.id);
                        setIsOpen(false);
                      } }
                      onContextMenu={ (e) => {
                        e.preventDefault();
                        setShelfContextMenu({ shelfId: item.shelf.id, x: e.clientX, y: e.clientY });
                      } }
                    >
                      <span className={ styles.navEmoji } aria-hidden="true">{ item.shelf.icon }</span>
                      <span className={ styles.navLabel }>{ item.shelf.name }</span>
                    </Button>
                  </GridListItem>
                ) }
              </GridList>
            ) }

            <Button
              className={ classNames(styles.navButton, styles.nestedNavButton, styles.createShelfButton) }
              onPress={ () => {
                setIsOpen(false);
                onShelfModalStateChange({ mode: "create" });
              } }
            >
              <AddIcon aria-hidden="true" focusable="false" className={ styles.navIcon } />
              <span className={ styles.navLabel }>Create a new shelf</span>
            </Button>
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ classNames(styles.disclosure, styles.settingsDisclosure) }>
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
                <div className={ styles.coverSizeInputRow }>
                  <input
                    type="number"
                    className={ styles.coverSizeInput }
                    value={ coverSizeDraft }
                    min={ MIN_COVER_SIZE }
                    max={ MAX_COVER_SIZE }
                    onChange={ (e) => setCoverSizeDraft(e.target.value) }
                    onBlur={ commitCoverSizeDraft }
                    onKeyDown={ (e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    } }
                    aria-label="Cover size in pixels"
                  />
                </div>

                <ThSlider
                  aria-label="Cover size"
                  className={ styles.coverSizeSlider }
                  range={ [MIN_COVER_SIZE, MAX_COVER_SIZE] }
                  value={ coverSize }
                  onChange={ (value) => onChangeCoverSize(Array.isArray(value) ? value[0] : value) }
                  compounds={{
                    output: { className: styles.visuallyHidden },
                    track: { className: styles.coverSizeTrack },
                    thumb: { className: styles.coverSizeThumb }
                  }}
                />
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

    { /* CLAUDE-ADDED: Same "invisible anchor positioned at click coordinates" recipe as
         StatefulBookContextMenu -- key forces a fresh mount per right-click so the popover
         repositions instead of trying to reflow an already-open instance. */ }
    { shelfContextMenu && (
      <MenuTrigger
        key={ `${ shelfContextMenu.shelfId }-${ shelfContextMenu.x }-${ shelfContextMenu.y }` }
        isOpen
        onOpenChange={ (open) => {
          if (!open) setShelfContextMenu(null);
        } }
      >
        <Button
          className={ styles.shelfContextAnchor }
          style={{ left: shelfContextMenu.x, top: shelfContextMenu.y }}
        />

        <Popover placement="bottom start" className={ styles.shelfContextPopover }>
          <Menu className={ styles.shelfContextMenuList }>
            <MenuItem
              className={ styles.shelfContextMenuItem }
              onAction={ () => {
                onShelfModalStateChange({ mode: "edit", shelfId: shelfContextMenu.shelfId });
                setShelfContextMenu(null);
                setIsOpen(false);
              } }
            >
              Edit
            </MenuItem>
            <MenuItem
              className={ classNames(styles.shelfContextMenuItem, styles.shelfContextMenuItemDanger) }
              onAction={ () => {
                setPendingDeleteShelfId(shelfContextMenu.shelfId);
                setShelfContextMenu(null);
              } }
            >
              Delete
            </MenuItem>
          </Menu>
        </Popover>
      </MenuTrigger>
    ) }

    { /* CLAUDE-ADDED: Same confirm-before-delete dialog shape/CSS as StatefulAnnotationsContainer's
         highlight/bookmark/note deletion -- a centered ThModal, not a native window.confirm. */ }
    <ThModal
      isOpen={ pendingDeleteShelfId !== null }
      onOpenChange={ (open) => {
        if (!open) setPendingDeleteShelfId(null);
      } }
      isDismissable
      className={ styles.confirmBackdrop }
      compounds={{
        dialog: {
          className: styles.confirmDialog,
          "aria-label": pendingDeleteShelfName ? `Delete "${ pendingDeleteShelfName }"?` : "Delete this shelf?"
        }
      }}
    >
      <div className={ styles.confirmText }>
        <button
          type="button"
          className={ styles.confirmClose }
          aria-label="Close"
          onClick={ () => setPendingDeleteShelfId(null) }
        >
          <CloseIcon aria-hidden="true" focusable="false" />
        </button>
        This can't be undone. The books on it stay in your library.
      </div>
      <div className={ styles.confirmActions }>
        <button
          type="button"
          className={ styles.confirmButton }
          onClick={ () => setPendingDeleteShelfId(null) }
        >
          Cancel
        </button>
        <button
          type="button"
          className={ classNames(styles.confirmButton, styles.confirmButtonPrimary) }
          onClick={ () => {
            if (pendingDeleteShelfId) onDeleteShelf(pendingDeleteShelfId);
            setPendingDeleteShelfId(null);
          } }
        >
          Delete
        </button>
      </div>
    </ThModal>
    </>
  );
};
