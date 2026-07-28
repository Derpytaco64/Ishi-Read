"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";

import { useCurrentUser } from "@/app/useCurrentUser";

import styles from "./assets/styles/thorium-web.userMenu.module.css";

const MIN_PASSWORD_LENGTH = 8;

function AvatarCircle({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className: string }) {
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ avatarUrl } alt="" className={ className } />
  ) : (
    <span className={ className } aria-hidden="true">{ name.charAt(0).toUpperCase() }</span>
  );
}

// CLAUDE-ADDED: Circular avatar button pinned to the top-right of the library pages (mirrors the
// library menu's own logo trigger pinned top-left) -- opens a dropdown with "Edit User" (this
// component's own modal), "Admin Settings" (only shown to admins, links to the /admin panel), and
// "Log Out".
export const StatefulUserMenu = () => {
  const { user, refresh } = useCurrentUser();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (user) setNameDraft(user.name);
  }, [user]);

  if (!user) return null;

  const openEdit = () => {
    setNameDraft(user.name);
    setNameSaved(false);
    setNameError(null);
    setAvatarError(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSaved(false);
    setIsEditOpen(true);
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError(null);
    setIsUploadingAvatar(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setAvatarError(data?.error || "Failed to upload picture");
        return;
      }

      await refresh();
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      setAvatarError("Failed to upload picture");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const commitName = async () => {
    if (!nameDraft.trim() || nameDraft === user.name) return;

    setIsSavingName(true);
    setNameError(null);
    setNameSaved(false);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setNameError(data?.error || "Failed to save name");
        return;
      }

      setNameSaved(true);
      await refresh();
    } catch (err) {
      console.error("Failed to save name:", err);
      setNameError("Failed to save name");
    } finally {
      setIsSavingName(false);
    }
  };

  const submitPasswordChange = async (e: FormEvent) => {
    e.preventDefault();

    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${ MIN_PASSWORD_LENGTH } characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }

    setIsSavingPassword(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPasswordError(data?.error || "Failed to change password");
        return;
      }

      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Failed to change password:", err);
      setPasswordError("Failed to change password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const logOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <>
    <MenuTrigger>
      <Button className={ styles.trigger } aria-label={ `Account: ${ user.name }` }>
        <AvatarCircle name={ user.name } avatarUrl={ user.avatarUrl } className={ styles.avatar } />
      </Button>

      <Popover placement="bottom end" className={ styles.popover }>
        <Menu className={ styles.menu }>
          <MenuItem className={ styles.menuItem } onAction={ openEdit }>
            Edit User
          </MenuItem>
          { user.isAdmin && (
            <MenuItem className={ styles.menuItem } href="/admin">
              Admin Settings
            </MenuItem>
          ) }
          <MenuItem className={ styles.menuItem } onAction={ logOut }>
            Log Out
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>

    <ThModal
      isOpen={ isEditOpen }
      onOpenChange={ setIsEditOpen }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: { className: styles.dialog }
      }}
    >
      <ThContainerHeaderWithClose
        label="Edit User"
        className={ styles.header }
        compounds={{
          heading: {},
          button: {
            "aria-label": "Close",
            onPress: () => setIsEditOpen(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        <div className={ styles.avatarSection }>
          <AvatarCircle name={ user.name } avatarUrl={ user.avatarUrl } className={ styles.avatarLarge } />
          <input
            ref={ fileInputRef }
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className={ styles.visuallyHidden }
            onChange={ handleAvatarChange }
          />
          <button
            type="button"
            className={ styles.secondaryButton }
            onClick={ () => fileInputRef.current?.click() }
            disabled={ isUploadingAvatar }
          >
            { isUploadingAvatar ? "Uploading…" : "Change Picture" }
          </button>
          { avatarError && <p className={ styles.statusError }>{ avatarError }</p> }
        </div>

        <label className={ styles.fieldRow }>
          <span>Display name</span>
          <input
            type="text"
            className={ styles.textInput }
            value={ nameDraft }
            onChange={ (e) => {
              setNameDraft(e.target.value);
              setNameSaved(false);
            } }
            onBlur={ commitName }
            onKeyDown={ (e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            } }
          />
        </label>
        { isSavingName && <p className={ styles.status }>Saving…</p> }
        { !isSavingName && nameError && <p className={ styles.statusError }>{ nameError }</p> }
        { !isSavingName && !nameError && nameSaved && <p className={ styles.status }>Saved</p> }

        <form className={ styles.passwordForm } onSubmit={ submitPasswordChange }>
          <h3 className={ styles.sectionHeading }>Change Password</h3>

          <label className={ styles.fieldRow }>
            <span>Current password</span>
            <input
              type="password"
              className={ styles.textInput }
              value={ currentPassword }
              onChange={ (e) => setCurrentPassword(e.target.value) }
              autoComplete="current-password"
            />
          </label>

          <label className={ styles.fieldRow }>
            <span>New password</span>
            <input
              type="password"
              className={ styles.textInput }
              value={ newPassword }
              onChange={ (e) => setNewPassword(e.target.value) }
              autoComplete="new-password"
            />
          </label>

          <label className={ styles.fieldRow }>
            <span>Confirm new password</span>
            <input
              type="password"
              className={ styles.textInput }
              value={ confirmPassword }
              onChange={ (e) => setConfirmPassword(e.target.value) }
              autoComplete="new-password"
            />
          </label>

          { passwordError && <p className={ styles.statusError }>{ passwordError }</p> }
          { passwordSaved && <p className={ styles.status }>Password updated</p> }

          <button type="submit" className={ styles.primaryButton } disabled={ isSavingPassword }>
            { isSavingPassword ? "Updating…" : "Update Password" }
          </button>
        </form>
      </ThContainerBody>
    </ThModal>
    </>
  );
};
