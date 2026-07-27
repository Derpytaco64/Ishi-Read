"use client";

import { useEffect, useState } from "react";

import {
  Button,
  Input,
  Label,
  Radio,
  RadioGroup,
  TextField
} from "react-aria-components";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";

import { CustomShelf, ShelfIcon } from "@/app/customShelves";
import { DEFAULT_SHELF_ICON, SHELF_ICON_CHOICES } from "./shelfIcons";

import styles from "./assets/styles/thorium-web.createShelfModal.module.css";

export interface StatefulShelfFormModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // CLAUDE-ADDED: When provided, the modal edits this shelf (prefilled name/icon, "Save changes")
  // instead of creating a new one ("Create shelf") -- one modal, two modes, since the form itself
  // (name field + icon grid) is identical either way.
  shelf?: CustomShelf | null;
  onSubmit: (name: string, icon: ShelfIcon) => void;
}

export const StatefulShelfFormModal = ({
  isOpen,
  onOpenChange,
  shelf,
  onSubmit
}: StatefulShelfFormModalProps) => {
  const isEditing = !!shelf;

  const [name, setName] = useState(shelf?.name ?? "");
  const [icon, setIcon] = useState<ShelfIcon>(shelf?.icon ?? DEFAULT_SHELF_ICON);

  // CLAUDE-ADDED: Re-seeds the fields whenever the modal opens -- covers switching which shelf is
  // being edited, and resets any unsaved edits left over from a previous open in either mode.
  useEffect(() => {
    if (!isOpen) return;
    setName(shelf?.name ?? "");
    setIcon(shelf?.icon ?? DEFAULT_SHELF_ICON);
  }, [isOpen, shelf]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    onSubmit(trimmed, icon);
    onOpenChange(false);
  };

  return (
    <ThModal
      isOpen={ isOpen }
      onOpenChange={ onOpenChange }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: {
          className: styles.dialog
        }
      }}
    >
      <ThContainerHeaderWithClose
        label={ isEditing ? "Edit shelf" : "Create a new shelf" }
        className={ styles.header }
        compounds={{
          heading: { className: styles.heading },
          button: {
            className: styles.closeButton,
            "aria-label": "Close",
            onPress: () => onOpenChange(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        <TextField
          className={ styles.field }
          value={ name }
          onChange={ setName }
          onKeyDown={ (e) => {
            if (e.key === "Enter") submit();
          } }
        >
          <Label className={ styles.label }>Shelf name</Label>
          <Input className={ styles.input } placeholder="e.g. Favorites" autoFocus />
        </TextField>

        <RadioGroup
          className={ styles.iconField }
          value={ icon }
          onChange={ (value) => setIcon(value as ShelfIcon) }
        >
          <Label className={ styles.label }>Icon</Label>
          <div className={ styles.iconGrid }>
            { SHELF_ICON_CHOICES.map((choice) => (
              <Radio
                key={ choice.icon }
                value={ choice.icon }
                className={ styles.iconOption }
                aria-label={ choice.label }
              >
                <span className={ styles.iconOptionEmoji } aria-hidden="true">{ choice.icon }</span>
              </Radio>
            )) }
          </div>
        </RadioGroup>

        <Button
          className={ styles.createButton }
          isDisabled={ !name.trim() }
          onPress={ submit }
        >
          { isEditing ? "Save changes" : "Create shelf" }
        </Button>
      </ThContainerBody>
    </ThModal>
  );
};
