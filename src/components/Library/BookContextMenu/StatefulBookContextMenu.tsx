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
        </Menu>
      </Popover>
    </MenuTrigger>
  );
};
