"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";

import { Button, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import classNames from "classnames";

import { ThSwitch } from "@/core/Components/Settings/ThSwitch";
import { useCurrentUser } from "@/app/useCurrentUser";
import { useBookFolder } from "@/app/useBookFolder";
import { useReadiumUrl } from "@/app/useReadiumUrl";
import { useUserDataFolder } from "@/app/useUserDataFolder";
import { isLightColor } from "@/preferences/helpers/themeGeneration";

import ChevronDown from "./assets/icons/chevron_down.svg";
import AddIcon from "./assets/icons/add.svg";

import styles from "./admin.module.css";

interface AdminPageClientProps {
  initialLoginAccentColor: string;
}

interface AdminUser {
  id: string;
  username: string;
  name: string;
  isAdmin: boolean;
  avatarExt: string | null;
  failedAttempts: number;
  lockedUntil: number | null;
  createdAt: number;
}

const MIN_PASSWORD_LENGTH = 8;

function avatarUrlFor(user: AdminUser): string | null {
  return user.avatarExt ? `/api/users/${ user.id }/avatar` : null;
}

// CLAUDE-ADDED: Jellyfin-style admin panel -- list existing users (with lock status), add a new
// one, and per-user actions (rename/change username, toggle admin, reset password, unlock, delete).
// The API routes this talks to (/api/admin/users/*) are already the real authorization boundary
// (403 for non-admins); the isAdmin check/redirect here is just so a non-admin who navigates here
// directly sees a normal page instead of a broken one full of 403s.
export default function AdminPageClient({ initialLoginAccentColor }: AdminPageClientProps) {
  const { user: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();

  // CLAUDE-ADDED: Also drives this very page's own --th-color-accent (see the <main> below) --
  // changing the picker recolors the admin panel live, the same way the library menu's own accent
  // picker does for the main app.
  const [loginAccentColor, setLoginAccentColorState] = useState(initialLoginAccentColor);
  const [accentColorError, setAccentColorError] = useState<string | null>(null);
  const accentTextColor = isLightColor(loginAccentColor) ? "#101010" : "#fff";

  const changeLoginAccentColor = async (hex: string) => {
    setLoginAccentColorState(hex);
    setAccentColorError(null);
    try {
      const res = await fetch("/api/settings/login-accent-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginAccentColor: hex })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setAccentColorError(data?.error || "Failed to save color");
    } catch (err) {
      console.error("Failed to save login accent color:", err);
      setAccentColorError("Failed to save color");
    }
  };

  // CLAUDE-ADDED: Moved here from the library menu -- these are server-wide config (they change
  // where every user's books/data come from), so they belong with the rest of admin-only settings
  // rather than mixed into the per-user library menu. Draft is a separate string from the saved
  // value so typing doesn't fire a save (and its filesystem validation) on every keystroke -- only
  // committed on blur/Enter, same moment the input's value is next allowed to be overwritten by a
  // fresh fetch/save result.
  const { bookFolder, saveBookFolder, isSaving: isSavingBookFolder, error: bookFolderError } = useBookFolder();
  const [bookFolderDraft, setBookFolderDraft] = useState(bookFolder);
  const [bookFolderSaved, setBookFolderSaved] = useState(false);

  useEffect(() => {
    setBookFolderDraft(bookFolder);
  }, [bookFolder]);

  const commitBookFolder = async () => {
    if (bookFolderDraft === bookFolder) return;
    setBookFolderSaved(false);
    if (await saveBookFolder(bookFolderDraft)) setBookFolderSaved(true);
  };

  const { readiumUrl, saveReadiumUrl, isSaving: isSavingReadiumUrl, error: readiumUrlError } = useReadiumUrl();
  const [readiumUrlDraft, setReadiumUrlDraft] = useState(readiumUrl);
  const [readiumUrlSaved, setReadiumUrlSaved] = useState(false);

  useEffect(() => {
    setReadiumUrlDraft(readiumUrl);
  }, [readiumUrl]);

  const commitReadiumUrl = async () => {
    if (readiumUrlDraft === readiumUrl) return;
    setReadiumUrlSaved(false);
    if (await saveReadiumUrl(readiumUrlDraft)) setReadiumUrlSaved(true);
  };

  // CLAUDE-ADDED: Committing here also migrates any existing data on disk into the new folder (see
  // the API route), which is why "Moving existing data…" can take noticeably longer than the other
  // two text settings above.
  const {
    userDataFolder,
    saveUserDataFolder,
    isSaving: isSavingUserDataFolder,
    error: userDataFolderError
  } = useUserDataFolder();
  const [userDataFolderDraft, setUserDataFolderDraft] = useState(userDataFolder);
  const [userDataFolderSaved, setUserDataFolderSaved] = useState(false);

  useEffect(() => {
    setUserDataFolderDraft(userDataFolder);
  }, [userDataFolder]);

  const commitUserDataFolder = async () => {
    if (userDataFolderDraft === userDataFolder) return;
    setUserDataFolderSaved(false);
    if (await saveUserDataFolder(userDataFolderDraft)) setUserDataFolderSaved(true);
  };

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setListError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setListError(data?.error || "Failed to load users");
        return;
      }
      setUsers(data.users ?? []);
    } catch (err) {
      console.error("Failed to load users:", err);
      setListError("Failed to load users");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (currentUser?.isAdmin) loadUsers();
  }, [currentUser]);

  useEffect(() => {
    if (!isLoadingCurrentUser && currentUser && !currentUser.isAdmin) {
      window.location.href = "/";
    }
  }, [isLoadingCurrentUser, currentUser]);

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // CLAUDE-ADDED: Password is optional for a regular profile (leaving it blank creates a
    // passwordless account, signed into on /login the same way by leaving the field blank there
    // too) but required for an admin account -- enforced again server-side either way.
    if (newPassword && newPassword.length < MIN_PASSWORD_LENGTH) {
      setCreateError(`Password must be at least ${ MIN_PASSWORD_LENGTH } characters`);
      return;
    }
    if (newIsAdmin && !newPassword) {
      setCreateError("Admin accounts require a password");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, name: newName, password: newPassword, isAdmin: newIsAdmin })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.error || "Failed to create user");
        return;
      }

      setNewUsername("");
      setNewName("");
      setNewPassword("");
      setNewIsAdmin(false);
      await loadUsers();
    } catch (err) {
      console.error("Failed to create user:", err);
      setCreateError("Failed to create user");
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (user: AdminUser) => {
    setEditingId(user.id);
    setEditName(user.name);
    setEditUsername(user.username);
    setActionError(null);
  };

  const saveEdit = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${ id }`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, username: editUsername })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || "Failed to update user");
        return;
      }
      setEditingId(null);
      await loadUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      setActionError("Failed to update user");
    }
  };

  const toggleAdmin = async (user: AdminUser) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${ user.id }`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !user.isAdmin })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || "Failed to update user");
        return;
      }
      await loadUsers();
    } catch (err) {
      console.error("Failed to update user:", err);
      setActionError("Failed to update user");
    }
  };

  const submitResetPassword = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setActionError(null);

    if (resetPasswordValue.length < MIN_PASSWORD_LENGTH) {
      setActionError(`Password must be at least ${ MIN_PASSWORD_LENGTH } characters`);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${ id }/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPasswordValue })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || "Failed to reset password");
        return;
      }
      setResetPasswordId(null);
      setResetPasswordValue("");
    } catch (err) {
      console.error("Failed to reset password:", err);
      setActionError("Failed to reset password");
    }
  };

  const unlockUser = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${ id }/unlock`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || "Failed to unlock user");
        return;
      }
      await loadUsers();
    } catch (err) {
      console.error("Failed to unlock user:", err);
      setActionError("Failed to unlock user");
    }
  };

  const deleteUserById = async (user: AdminUser) => {
    if (!window.confirm(`Delete "${ user.name }"? This can't be undone.`)) return;

    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${ user.id }`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || "Failed to delete user");
        return;
      }
      await loadUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setActionError("Failed to delete user");
    }
  };

  const pageStyle = { "--th-color-accent": loginAccentColor, "--th-color-accent-text": accentTextColor } as CSSProperties;

  if (isLoadingCurrentUser || (!currentUser)) {
    return <main className={ styles.page } style={ pageStyle }><div className={ styles.card }><p className={ styles.textSettingStatus }>Loading…</p></div></main>;
  }

  if (!currentUser.isAdmin) {
    return <main className={ styles.page } style={ pageStyle }><div className={ styles.card }><p className={ styles.textSettingStatus }>Redirecting…</p></div></main>;
  }

  return (
    <main className={ styles.page } style={ pageStyle }>
      <div className={ styles.card }>
        <div className={ styles.headerRow }>
          <h1 className={ styles.heading }>User Management</h1>
          <Link href="/" className={ styles.backLink }>Back to Library</Link>
        </div>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Appearance</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <label className={ styles.colorPickerRow }>
              <span>Login &amp; admin panel accent color</span>
              <input
                type="color"
                className={ styles.colorPicker }
                value={ loginAccentColor }
                onChange={ (e) => changeLoginAccentColor(e.target.value) }
                aria-label="Login and admin panel accent color"
              />
            </label>
            { accentColorError && <p className={ styles.textSettingStatusError }>{ accentColorError }</p> }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Book Folder</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <label className={ styles.textSettingRow }>
              <span>Folder to scan for books</span>
              <input
                type="text"
                className={ styles.textSettingInput }
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
            { isSavingBookFolder && <p className={ styles.textSettingStatus }>Saving…</p> }
            { !isSavingBookFolder && bookFolderError && (
              <p className={ styles.textSettingStatusError }>{ bookFolderError }</p>
            ) }
            { !isSavingBookFolder && !bookFolderError && bookFolderSaved && (
              <p className={ styles.textSettingStatus }>Saved</p>
            ) }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Readium URL</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <label className={ styles.textSettingRow }>
              <span>Readium Web Publication Server URL</span>
              <input
                type="text"
                className={ styles.textSettingInput }
                value={ readiumUrlDraft }
                onChange={ (e) => {
                  setReadiumUrlDraft(e.target.value);
                  setReadiumUrlSaved(false);
                } }
                onBlur={ commitReadiumUrl }
                onKeyDown={ (e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                } }
                aria-label="Readium Web Publication Server URL"
                spellCheck={ false }
              />
            </label>
            { isSavingReadiumUrl && <p className={ styles.textSettingStatus }>Saving…</p> }
            { !isSavingReadiumUrl && readiumUrlError && (
              <p className={ styles.textSettingStatusError }>{ readiumUrlError }</p>
            ) }
            { !isSavingReadiumUrl && !readiumUrlError && readiumUrlSaved && (
              <p className={ styles.textSettingStatus }>Saved</p>
            ) }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>User Data Folder</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <label className={ styles.textSettingRow }>
              <span>Folder for reading progress, annotations, and other saved data</span>
              <input
                type="text"
                className={ styles.textSettingInput }
                value={ userDataFolderDraft }
                onChange={ (e) => {
                  setUserDataFolderDraft(e.target.value);
                  setUserDataFolderSaved(false);
                } }
                onBlur={ commitUserDataFolder }
                onKeyDown={ (e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                } }
                aria-label="User data folder path"
                spellCheck={ false }
              />
            </label>
            { isSavingUserDataFolder && <p className={ styles.textSettingStatus }>Moving existing data…</p> }
            { !isSavingUserDataFolder && userDataFolderError && (
              <p className={ styles.textSettingStatusError }>{ userDataFolderError }</p>
            ) }
            { !isSavingUserDataFolder && !userDataFolderError && userDataFolderSaved && (
              <p className={ styles.textSettingStatus }>Saved</p>
            ) }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure } defaultExpanded>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <AddIcon aria-hidden="true" focusable="false" className={ styles.disclosureIcon } />
              <span className={ styles.disclosureLabel }>Add User</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <form className={ styles.createForm } onSubmit={ createUser }>
              <label className={ styles.textSettingRow }>
                <span>Username</span>
                <input
                  type="text"
                  className={ styles.textSettingInput }
                  value={ newUsername }
                  onChange={ (e) => setNewUsername(e.target.value) }
                  required
                />
              </label>
              <label className={ styles.textSettingRow }>
                <span>Display name</span>
                <input
                  type="text"
                  className={ styles.textSettingInput }
                  value={ newName }
                  onChange={ (e) => setNewName(e.target.value) }
                  placeholder={ newUsername || "Optional -- defaults to username" }
                />
              </label>
              <label className={ styles.textSettingRow }>
                <span>Password { !newIsAdmin && "(optional -- leave blank for a passwordless profile)" }</span>
                <input
                  type="password"
                  className={ styles.textSettingInput }
                  value={ newPassword }
                  onChange={ (e) => setNewPassword(e.target.value) }
                  required={ newIsAdmin }
                />
              </label>
              <ThSwitch
                isSelected={ newIsAdmin }
                onChange={ setNewIsAdmin }
                label="Admin"
                className={ styles.switch }
                compounds={{ indicator: { className: styles.switchIndicator } }}
              />

              { createError && <p className={ styles.textSettingStatusError }>{ createError }</p> }

              <button
                type="submit"
                className={ classNames(styles.confirmButton, styles.confirmButtonPrimary) }
                disabled={ isCreating }
              >
                { isCreating ? "Creating…" : "Create User" }
              </button>
            </form>
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure } defaultExpanded>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Users</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            { actionError && <p className={ styles.textSettingStatusError }>{ actionError }</p> }
            { listError && <p className={ styles.textSettingStatusError }>{ listError }</p> }

            { isLoadingUsers ? (
              <p className={ styles.textSettingStatus }>Loading…</p>
            ) : (
              <ul className={ styles.userList }>
                { users.map((user) => {
                  const isLocked = !!user.lockedUntil && user.lockedUntil > Date.now();
                  const avatarUrl = avatarUrlFor(user);

                  return (
                    <li key={ user.id } className={ styles.userRow }>
                      <span className={ styles.avatar }>
                        { avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ avatarUrl } alt="" className={ styles.avatarImg } />
                        ) : (
                          <span aria-hidden="true">{ user.name.charAt(0).toUpperCase() }</span>
                        ) }
                      </span>

                      <div className={ styles.userInfo }>
                        { editingId === user.id ? (
                          <div className={ styles.editForm }>
                            <input
                              type="text"
                              className={ styles.textSettingInput }
                              value={ editUsername }
                              onChange={ (e) => setEditUsername(e.target.value) }
                              aria-label="Username"
                            />
                            <input
                              type="text"
                              className={ styles.textSettingInput }
                              value={ editName }
                              onChange={ (e) => setEditName(e.target.value) }
                              aria-label="Display name"
                            />
                            <div className={ styles.rowActions }>
                              <button type="button" className={ styles.confirmButton } onClick={ () => setEditingId(null) }>Cancel</button>
                              <button
                                type="button"
                                className={ classNames(styles.confirmButton, styles.confirmButtonPrimary) }
                                onClick={ () => saveEdit(user.id) }
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className={ styles.userName }>
                              { user.name }
                              { user.isAdmin && <span className={ styles.badge }>Admin</span> }
                              { isLocked && <span className={ styles.badgeDanger }>Locked</span> }
                            </span>
                            <span className={ styles.userUsername }>@{ user.username }</span>
                          </>
                        ) }
                      </div>

                      { editingId !== user.id && (
                        <div className={ styles.rowActions }>
                          <button type="button" className={ styles.confirmButton } onClick={ () => startEditing(user) }>Edit</button>
                          <button
                            type="button"
                            className={ styles.confirmButton }
                            onClick={ () => toggleAdmin(user) }
                            disabled={ user.id === currentUser.id && user.isAdmin }
                          >
                            { user.isAdmin ? "Remove Admin" : "Make Admin" }
                          </button>
                          <button
                            type="button"
                            className={ styles.confirmButton }
                            onClick={ () => { setResetPasswordId(user.id); setResetPasswordValue(""); } }
                          >
                            Reset Password
                          </button>
                          { isLocked && (
                            <button type="button" className={ styles.confirmButton } onClick={ () => unlockUser(user.id) }>
                              Unlock
                            </button>
                          ) }
                          <button
                            type="button"
                            className={ classNames(styles.confirmButton, styles.confirmButtonDanger) }
                            onClick={ () => deleteUserById(user) }
                            disabled={ user.id === currentUser.id }
                          >
                            Delete
                          </button>
                        </div>
                      ) }

                      { resetPasswordId === user.id && (
                        <form className={ styles.resetForm } onSubmit={ (e) => submitResetPassword(e, user.id) }>
                          <input
                            type="password"
                            className={ styles.textSettingInput }
                            placeholder="New password"
                            value={ resetPasswordValue }
                            onChange={ (e) => setResetPasswordValue(e.target.value) }
                            autoFocus
                          />
                          <div className={ styles.rowActions }>
                            <button type="button" className={ styles.confirmButton } onClick={ () => setResetPasswordId(null) }>Cancel</button>
                            <button type="submit" className={ classNames(styles.confirmButton, styles.confirmButtonPrimary) }>Set Password</button>
                          </div>
                        </form>
                      ) }
                    </li>
                  );
                }) }
              </ul>
            ) }
          </DisclosurePanel>
        </Disclosure>
      </div>
    </main>
  );
}
