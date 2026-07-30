"use client";

import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  SubmenuTrigger
} from "react-aria-components";

import { Publication } from "@/components/Misc/PublicationGrid";
import { CustomShelf } from "@/app/customShelves";

import CheckIcon from "./assets/icons/check.svg";

import styles from "./assets/styles/thorium-web.bookContextMenu.module.css";

export interface BookContextMenuState {
  publication: Publication;
  x: number;
  y: number;
}

export interface StatefulBookContextMenuProps {
  state: BookContextMenuState | null;
  shelves: CustomShelf[];
  onAddToShelf: (shelfId: string, bookUrl: string) => void;
  onRemoveFromShelf: (shelfId: string, bookUrl: string) => void;
  onGoToSeries: (publication: Publication) => void;
  onCreateShelf: (bookUrl: string) => void;
  onExportNotes: (publication: Publication) => void;
  // CLAUDE-ADDED: Whether the right-clicked book is currently showing in the Continue Reading shelf
  // -- computed in page.tsx (it has progressByUrl and the dismissed-books map, neither of which this
  // component otherwise receives) rather than re-derived here, so there's exactly one place that
  // logic lives.
  canRemoveFromContinueReading: boolean;
  onRemoveFromContinueReading: (publication: Publication) => void;
  onOpenChange: (open: boolean) => void;
}

// CLAUDE-ADDED: There's no native "open at cursor position" trigger in react-aria-components --
// the standard recipe is a MenuTrigger whose Button is an invisible, zero-size anchor positioned
// at the click coordinates (fixed positioning), with the actual Popover reading its anchor rect
// from that Button via context rather than from any visible element.
export const StatefulBookContextMenu = ({
  state,
  shelves,
  onAddToShelf,
  onRemoveFromShelf,
  onGoToSeries,
  onCreateShelf,
  onExportNotes,
  canRemoveFromContinueReading,
  onRemoveFromContinueReading,
  onOpenChange
}: StatefulBookContextMenuProps) => {
  if (!state) return null;

  return (
    <MenuTrigger isOpen onOpenChange={ onOpenChange }>
      <Button
        className={ styles.anchor }
        style={{ left: state.x, top: state.y }}
      />

      <Popover placement="bottom start" className={ styles.popover }>
        <Menu className={ styles.menu }>
          { state.publication.series?.name && (
            <MenuItem
              className={ styles.menuItem }
              onAction={ () => onGoToSeries(state.publication) }
            >
              Go to Series
            </MenuItem>
          ) }

          <MenuItem
            className={ styles.menuItem }
            onAction={ () => onExportNotes(state.publication) }
          >
            Export Notes
          </MenuItem>

          <SubmenuTrigger>
            <MenuItem className={ styles.menuItem }>+/- Shelf</MenuItem>

            <Popover placement="end top" className={ styles.popover }>
              <Menu className={ styles.menu }>
                { shelves.map((shelf) => {
                  const isOnShelf = shelf.books.some((book) => book.url === state.publication.url);

                  return (
                    <MenuItem
                      key={ shelf.id }
                      id={ shelf.id }
                      className={ styles.menuItem }
                      onAction={ () => {
                        if (isOnShelf) {
                          onRemoveFromShelf(shelf.id, state.publication.url);
                        } else {
                          onAddToShelf(shelf.id, state.publication.url);
                        }
                      } }
                    >
                      <span className={ styles.menuItemEmoji } aria-hidden="true">{ shelf.icon }</span>
                      <span className={ styles.menuItemLabel }>{ shelf.name }</span>
                      { isOnShelf && (
                        <CheckIcon aria-hidden="true" focusable="false" className={ styles.menuItemCheck } />
                      ) }
                    </MenuItem>
                  );
                }) }

                <MenuItem
                  id="__create_shelf__"
                  className={ styles.menuItem }
                  onAction={ () => onCreateShelf(state.publication.url) }
                >
                  <span className={ styles.menuItemLabel }>+ Create new shelf</span>
                </MenuItem>
              </Menu>
            </Popover>
          </SubmenuTrigger>

          { canRemoveFromContinueReading && (
            <MenuItem
              className={ styles.menuItem }
              onAction={ () => onRemoveFromContinueReading(state.publication) }
            >
              Remove from Continue Reading
            </MenuItem>
          ) }
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
