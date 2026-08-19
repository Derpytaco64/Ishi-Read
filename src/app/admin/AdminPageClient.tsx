"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import Link from "next/link";

import { Button, Disclosure, DisclosurePanel, Heading } from "react-aria-components";
import classNames from "classnames";

import { ThSwitch } from "@/core/Components/Settings/ThSwitch";
import { useCurrentUser } from "@/app/useCurrentUser";
import { useBookFolder } from "@/app/useBookFolder";
import { useReadiumUrl } from "@/app/useReadiumUrl";
import { useReadiumPort } from "@/app/useReadiumPort";
import { useUserDataFolder } from "@/app/useUserDataFolder";
import { isLightColor } from "@/preferences/helpers/themeGeneration";
import type { Publication } from "@/components/Misc/PublicationGrid";
import { getManifestUrlFromBookUrl } from "@/helpers/getBookProgress";

import ChevronDown from "./assets/icons/chevron_down.svg";
import AddIcon from "./assets/icons/add.svg";

import styles from "./admin.module.css";

interface AdminPageClientProps {
  initialLoginAccentColor: string;
  initialThemeMode: "light" | "dark";
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
  disabled: boolean;
  // CLAUDE-ADDED: Whether any of this user's sessions was used in the last few minutes -- see
  // getActiveUserIds in next-lib/userData/auth.ts. Drives the status dot on their avatar below.
  isActive: boolean;
}

// CLAUDE-ADDED: Mirrors OrphanedDataReport/OrphanedUserData/OrphanedBook in
// next-lib/userData/orphanedData.ts -- the shape /api/admin/orphaned-data's GET/DELETE both return.
interface OrphanedBook {
  hash: string;
  subdirs: string[];
  title: string | null;
  manifestUrl: string | null;
}

interface OrphanedUserData {
  userId: string;
  username: string;
  name: string;
  books: OrphanedBook[];
  fileCount: number;
}

interface OrphanedDataReport {
  users: OrphanedUserData[];
  totalFiles: number;
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
export default function AdminPageClient({ initialLoginAccentColor, initialThemeMode }: AdminPageClientProps) {
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

  // CLAUDE-ADDED: Same live-updates-this-page pattern as loginAccentColor above -- also drives this
  // page's own data-theme attribute (see the <main> below), so toggling it recolors the admin panel
  // immediately, the same way the library menu's own dark-mode switch does for the main app.
  const [themeMode, setThemeModeState] = useState(initialThemeMode);
  const [themeModeError, setThemeModeError] = useState<string | null>(null);

  const changeThemeMode = async (isDark: boolean) => {
    const mode = isDark ? "dark" : "light";
    setThemeModeState(mode);
    setThemeModeError(null);
    try {
      const res = await fetch("/api/settings/login-theme-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginThemeMode: mode })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) setThemeModeError(data?.error || "Failed to save theme");
    } catch (err) {
      console.error("Failed to save login theme mode:", err);
      setThemeModeError("Failed to save theme");
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

  // CLAUDE-ADDED: Same draft/commit/blur dance as bookFolder/readiumUrl above -- the value round-trips
  // as a string (matching the text input) even though it's a number on disk (see useReadiumPort.ts).
  const { readiumPort, saveReadiumPort, isSaving: isSavingReadiumPort, error: readiumPortError } = useReadiumPort();
  const [readiumPortDraft, setReadiumPortDraft] = useState(readiumPort);
  const [readiumPortSaved, setReadiumPortSaved] = useState(false);

  useEffect(() => {
    setReadiumPortDraft(readiumPort);
  }, [readiumPort]);

  const commitReadiumPort = async () => {
    if (readiumPortDraft === readiumPort) return;
    setReadiumPortSaved(false);
    if (await saveReadiumPort(readiumPortDraft)) setReadiumPortSaved(true);
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

  const [orphanedReport, setOrphanedReport] = useState<OrphanedDataReport | null>(null);
  const [isScanningOrphaned, setIsScanningOrphaned] = useState(false);
  const [isDeletingOrphaned, setIsDeletingOrphaned] = useState(false);
  const [orphanedError, setOrphanedError] = useState<string | null>(null);
  const [deletedOrphanedReport, setDeletedOrphanedReport] = useState<OrphanedDataReport | null>(null);

  const scanOrphanedData = async () => {
    setIsScanningOrphaned(true);
    setOrphanedError(null);
    setDeletedOrphanedReport(null);
    try {
      const res = await fetch("/api/admin/orphaned-data");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setOrphanedError(data?.error || "Failed to scan for orphaned data");
        return;
      }
      setOrphanedReport(data);
    } catch (err) {
      console.error("Failed to scan for orphaned data:", err);
      setOrphanedError("Failed to scan for orphaned data");
    } finally {
      setIsScanningOrphaned(false);
    }
  };

  // CLAUDE-ADDED: "Migrate to a live book" -- the recover-instead-of-delete counterpart to the
  // orphaned-data cleanup above. libraryBooksForMigrate is loaded lazily (only once a migrate picker
  // is actually opened) and shared across every orphan row for the rest of this page's lifetime,
  // same book list every row would otherwise fetch independently. migrateTarget identifies which
  // row's picker is open; only one can be open at a time.
  const [libraryBooksForMigrate, setLibraryBooksForMigrate] = useState<Publication[] | null>(null);
  const [migrateTarget, setMigrateTarget] = useState<{ userId: string; hash: string; title: string | null } | null>(null);
  const [migrateQuery, setMigrateQuery] = useState("");
  const [isMigratingOrphan, setIsMigratingOrphan] = useState(false);
  const [migrateOrphanError, setMigrateOrphanError] = useState<string | null>(null);

  const openMigrateOrphan = (userId: string, hash: string, title: string | null) => {
    setMigrateTarget({ userId, hash, title });
    setMigrateQuery("");
    setMigrateOrphanError(null);
    if (libraryBooksForMigrate === null) {
      fetch("/api/books")
        .then((res) => res.json())
        .then((data) => setLibraryBooksForMigrate(data.books || []))
        .catch((err) => {
          console.error("Failed to load library for orphaned-data migration:", err);
          setLibraryBooksForMigrate([]);
        });
    }
  };

  const closeMigrateOrphan = () => {
    setMigrateTarget(null);
    setMigrateOrphanError(null);
  };

  const confirmMigrateOrphan = async (destBook: Publication) => {
    if (!migrateTarget) return;

    const destManifestUrl = getManifestUrlFromBookUrl(destBook.url);
    if (!destManifestUrl) {
      setMigrateOrphanError("Could not resolve that book -- try again");
      return;
    }
    if (!window.confirm(
      `Migrate "${ migrateTarget.title ?? "this orphaned data" }" onto "${ destBook.title }"? ` +
      `This overwrites "${ destBook.title }"'s existing progress, reading time, and annotations. This can't be undone.`
    )) {
      return;
    }

    setIsMigratingOrphan(true);
    setMigrateOrphanError(null);
    try {
      const res = await fetch("/api/admin/orphaned-data/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: migrateTarget.userId, sourceHash: migrateTarget.hash, destManifestUrl })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMigrateOrphanError(data?.error || "Failed to migrate orphaned data");
        return;
      }
      setMigrateTarget(null);
      await scanOrphanedData();
    } catch (err) {
      console.error("Failed to migrate orphaned data:", err);
      setMigrateOrphanError("Failed to migrate orphaned data");
    } finally {
      setIsMigratingOrphan(false);
    }
  };

  const confirmDeleteOrphanedData = async () => {
    if (!orphanedReport || orphanedReport.totalFiles === 0) return;
    if (!window.confirm(`Delete ${ orphanedReport.totalFiles } orphaned data file(s) across ${ orphanedReport.users.length } user(s)? This can't be undone.`)) {
      return;
    }

    setIsDeletingOrphaned(true);
    setOrphanedError(null);
    try {
      const res = await fetch("/api/admin/orphaned-data", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setOrphanedError(data?.error || "Failed to delete orphaned data");
        return;
      }
      setDeletedOrphanedReport(data);
      setOrphanedReport(null);
    } catch (err) {
      console.error("Failed to delete orphaned data:", err);
      setOrphanedError("Failed to delete orphaned data");
    } finally {
      setIsDeletingOrphaned(false);
    }
  };

  const [isClearingSpeedSamples, setIsClearingSpeedSamples] = useState(false);
  const [speedSamplesError, setSpeedSamplesError] = useState<string | null>(null);
  const [clearedSpeedSamplesCount, setClearedSpeedSamplesCount] = useState<number | null>(null);

  const confirmClearSpeedSamples = async () => {
    if (!window.confirm("Clear the rolling WPM sample buffer for every user? This can't be undone.")) {
      return;
    }

    setIsClearingSpeedSamples(true);
    setSpeedSamplesError(null);
    setClearedSpeedSamplesCount(null);
    try {
      const res = await fetch("/api/admin/reading-speed-samples", { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSpeedSamplesError(data?.error || "Failed to clear WPM samples");
        return;
      }
      setClearedSpeedSamplesCount(data.clearedCount ?? 0);
    } catch (err) {
      console.error("Failed to clear WPM samples:", err);
      setSpeedSamplesError("Failed to clear WPM samples");
    } finally {
      setIsClearingSpeedSamples(false);
    }
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

  // CLAUDE-ADDED: one shared hidden file input reused across every row (avatarTargetId tracks which
  // user it's currently for), same one-input-many-triggers approach as StatefulUserMenu's own
  // avatar upload, just parameterized by user id instead of always being "me".
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarTargetId, setAvatarTargetId] = useState<string | null>(null);
  const [uploadingAvatarId, setUploadingAvatarId] = useState<string | null>(null);
  // CLAUDE-ADDED: avatarUrlFor derives the src from avatarExt alone, which often doesn't change on
  // re-upload (same file type) -- so right after a successful upload the derived URL can be byte-
  // identical to what's already cached in the browser. This holds the admin route's own already
  // cache-busted `?v=` URL per user id so a freshly uploaded picture shows immediately, without
  // waiting on (or needing) a version query param baked into avatarUrlFor itself.
  const [avatarUrlOverrides, setAvatarUrlOverrides] = useState<Record<string, string>>({});

  // CLAUDE-ADDED: silent skips the isLoadingUsers toggle -- used by the periodic status-dot refresh
  // below so it swaps the list's data in place instead of flashing "Loading…" over it every 30s.
  const loadUsers = async (silent = false) => {
    if (!silent) setIsLoadingUsers(true);
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
      if (!silent) setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.isAdmin) return;

    loadUsers();

    // CLAUDE-ADDED: The status dot reflects a moving "active in the last few minutes" window (see
    // getActiveUserIds), so it needs to keep refreshing on its own rather than only updating after
    // this admin's own actions -- otherwise a dot would only ever go stale, never flip back to red
    // once someone's session actually goes quiet.
    const intervalId = window.setInterval(() => loadUsers(true), 30_000);
    return () => window.clearInterval(intervalId);
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

  const toggleDisabled = async (user: AdminUser) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${ user.id }`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !user.disabled })
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

  // CLAUDE-ADDED: mirrors StatefulUserMenu's handleAvatarChange but posts to the admin-scoped
  // route (/api/admin/users/[id]/avatar) so it can set *another* user's picture.
  const startAvatarUpload = (user: AdminUser) => {
    setAvatarTargetId(user.id);
    avatarFileInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const targetId = avatarTargetId;
    if (!file || !targetId) return;

    setActionError(null);
    setUploadingAvatarId(targetId);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const res = await fetch(`/api/admin/users/${ targetId }/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setActionError(data?.error || "Failed to upload picture");
        return;
      }

      if (typeof data?.avatarUrl === "string") {
        setAvatarUrlOverrides((prev) => ({ ...prev, [targetId]: data.avatarUrl }));
      }
      await loadUsers();
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      setActionError("Failed to upload picture");
    } finally {
      setUploadingAvatarId(null);
      setAvatarTargetId(null);
    }
  };

  const pageStyle = { "--th-color-accent": loginAccentColor, "--th-color-accent-text": accentTextColor } as CSSProperties;

  if (isLoadingCurrentUser || (!currentUser)) {
    return <main className={ styles.page } data-theme={ themeMode } style={ pageStyle }><div className={ styles.card }><p className={ styles.textSettingStatus }>Loading…</p></div></main>;
  }

  if (!currentUser.isAdmin) {
    return <main className={ styles.page } data-theme={ themeMode } style={ pageStyle }><div className={ styles.card }><p className={ styles.textSettingStatus }>Redirecting…</p></div></main>;
  }

  return (
    <main className={ styles.page } data-theme={ themeMode } style={ pageStyle }>
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

            <ThSwitch
              isSelected={ themeMode === "dark" }
              onChange={ changeThemeMode }
              label={ themeMode === "dark" ? "Dark mode" : "Light mode" }
              className={ styles.switch }
              compounds={{ indicator: { className: styles.switchIndicator } }}
            />
            { themeModeError && <p className={ styles.textSettingStatusError }>{ themeModeError }</p> }
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
              <span className={ styles.disclosureLabel }>Server Port</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <label className={ styles.textSettingRow }>
              <span>Readium server listening port</span>
              <input
                type="text"
                inputMode="numeric"
                className={ styles.textSettingInput }
                value={ readiumPortDraft }
                onChange={ (e) => {
                  setReadiumPortDraft(e.target.value);
                  setReadiumPortSaved(false);
                } }
                onBlur={ commitReadiumPort }
                onKeyDown={ (e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                } }
                aria-label="Readium server listening port"
                spellCheck={ false }
              />
            </label>
            <p className={ styles.textSettingStatus }>
              Changes which port the Readium server itself listens on (restarts it automatically).
              Update the Readium URL above to match, unless it already points through a reverse proxy.
            </p>
            { isSavingReadiumPort && <p className={ styles.textSettingStatus }>Saving…</p> }
            { !isSavingReadiumPort && readiumPortError && (
              <p className={ styles.textSettingStatusError }>{ readiumPortError }</p>
            ) }
            { !isSavingReadiumPort && !readiumPortError && readiumPortSaved && (
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

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Orphaned Data Cleanup</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <p className={ styles.textSettingStatus }>
              Finds reading progress, annotations, and other saved data left behind by books that are
              no longer in the library (deleted or moved files), across every user. Review the preview
              before deleting -- this can&apos;t be undone.
            </p>

            <button
              type="button"
              className={ styles.confirmButton }
              onClick={ scanOrphanedData }
              disabled={ isScanningOrphaned }
            >
              { isScanningOrphaned ? "Scanning…" : "Scan for Orphaned Data" }
            </button>

            { orphanedError && <p className={ styles.textSettingStatusError }>{ orphanedError }</p> }

            { orphanedReport && (
              orphanedReport.totalFiles === 0 ? (
                <p className={ styles.textSettingStatus }>No orphaned data found.</p>
              ) : (
                <>
                  <p className={ styles.textSettingStatus }>
                    Found { orphanedReport.totalFiles } orphaned file(s) across { orphanedReport.users.length } user(s):
                  </p>
                  <ul className={ styles.userList }>
                    { orphanedReport.users.map((user) => (
                      <li key={ user.userId } className={ styles.userRow }>
                        <div className={ styles.userInfo }>
                          <span className={ styles.userName }>{ user.name } <span className={ styles.userUsername }>@{ user.username }</span></span>
                          { user.books.map((book) => (
                            <div key={ book.hash }>
                              <span className={ styles.textSettingStatus }>
                                { book.title ? (
                                  <>&quot;{ book.title }&quot; <code>({ book.hash.slice(0, 12) }…)</code></>
                                ) : (
                                  <code>{ book.hash.slice(0, 12) }…</code>
                                ) } — { book.subdirs.join(", ") }
                                <button
                                  type="button"
                                  className={ styles.linkButton }
                                  onClick={ () => openMigrateOrphan(user.userId, book.hash, book.title) }
                                >
                                  Migrate to a live book
                                </button>
                              </span>
                              { migrateTarget?.userId === user.userId && migrateTarget?.hash === book.hash && (
                                <div className={ styles.orphanMigratePanel }>
                                  <input
                                    type="text"
                                    className={ styles.textSettingInput }
                                    placeholder="Search your library…"
                                    value={ migrateQuery }
                                    onChange={ (e) => setMigrateQuery(e.target.value) }
                                    disabled={ isMigratingOrphan }
                                  />
                                  { migrateOrphanError && <p className={ styles.textSettingStatusError }>{ migrateOrphanError }</p> }
                                  { libraryBooksForMigrate === null && <p className={ styles.textSettingStatus }>Loading library…</p> }
                                  { libraryBooksForMigrate !== null && (
                                    <ul className={ styles.orphanMigrateList }>
                                      { libraryBooksForMigrate
                                        .filter((b) => {
                                          const q = migrateQuery.trim().toLowerCase();
                                          return !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
                                        })
                                        .map((b) => (
                                          <li key={ b.url }>
                                            <button
                                              type="button"
                                              className={ styles.orphanMigrateRow }
                                              disabled={ isMigratingOrphan }
                                              onClick={ () => confirmMigrateOrphan(b) }
                                            >
                                              <span>{ b.title }</span>
                                              <span className={ styles.textSettingStatus }>{ b.author }</span>
                                            </button>
                                          </li>
                                        )) }
                                      { libraryBooksForMigrate.length === 0 && (
                                        <p className={ styles.textSettingStatus }>No books found</p>
                                      ) }
                                    </ul>
                                  ) }
                                  <button
                                    type="button"
                                    className={ styles.confirmButton }
                                    onClick={ closeMigrateOrphan }
                                    disabled={ isMigratingOrphan }
                                  >
                                    { isMigratingOrphan ? "Migrating…" : "Cancel" }
                                  </button>
                                </div>
                              ) }
                            </div>
                          )) }
                        </div>
                      </li>
                    )) }
                  </ul>
                  <button
                    type="button"
                    className={ classNames(styles.confirmButton, styles.confirmButtonDanger) }
                    onClick={ confirmDeleteOrphanedData }
                    disabled={ isDeletingOrphaned }
                  >
                    { isDeletingOrphaned ? "Deleting…" : `Delete ${ orphanedReport.totalFiles } Orphaned File(s)` }
                  </button>
                </>
              )
            ) }

            { deletedOrphanedReport && (
              <p className={ styles.textSettingStatus }>
                Deleted { deletedOrphanedReport.totalFiles } orphaned file(s) across { deletedOrphanedReport.users.length } user(s).
              </p>
            ) }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure }>
          <Heading className={ styles.disclosureHeading }>
            <Button slot="trigger" className={ styles.disclosureTrigger }>
              <span className={ styles.disclosureLabel }>Reading Speed Samples</span>
              <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
            </Button>
          </Heading>

          <DisclosurePanel className={ styles.disclosurePanel }>
            <p className={ styles.textSettingStatus }>
              Clears the rolling words-per-minute sample buffer for every user, resetting their live
              pace estimate back to &quot;not enough data&quot;. Useful if a bad batch of samples (a bug,
              a device clock issue) has thrown off the estimate.
            </p>

            <button
              type="button"
              className={ classNames(styles.confirmButton, styles.confirmButtonDanger) }
              onClick={ confirmClearSpeedSamples }
              disabled={ isClearingSpeedSamples }
            >
              { isClearingSpeedSamples ? "Clearing…" : "Clear WPM Samples for All Users" }
            </button>

            { speedSamplesError && <p className={ styles.textSettingStatusError }>{ speedSamplesError }</p> }

            { clearedSpeedSamplesCount !== null && (
              <p className={ styles.textSettingStatus }>
                Cleared WPM samples for { clearedSpeedSamplesCount } user(s).
              </p>
            ) }
          </DisclosurePanel>
        </Disclosure>

        <Disclosure className={ styles.disclosure }>
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

            <input
              ref={ avatarFileInputRef }
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={ styles.visuallyHidden }
              aria-hidden="true"
              tabIndex={ -1 }
              onChange={ handleAvatarFileChange }
            />

            { isLoadingUsers ? (
              <p className={ styles.textSettingStatus }>Loading…</p>
            ) : (
              <ul className={ styles.userList }>
                { users.map((user) => {
                  const isLocked = !!user.lockedUntil && user.lockedUntil > Date.now();
                  const avatarUrl = avatarUrlOverrides[user.id] ?? avatarUrlFor(user);

                  return (
                    <li key={ user.id } className={ styles.userRow }>
                      <span className={ styles.avatar }>
                        <span className={ styles.avatarInner }>
                          { avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ avatarUrl } alt="" className={ styles.avatarImg } />
                          ) : (
                            <span aria-hidden="true">{ user.name.charAt(0).toUpperCase() }</span>
                          ) }
                        </span>
                        <span
                          className={ classNames(styles.statusDot, user.isActive ? styles.statusDotActive : styles.statusDotInactive) }
                          role="img"
                          aria-label={ user.isActive ? "Active now" : "Not connected" }
                          title={ user.isActive ? "Active now" : "Not connected" }
                        />
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
                              { user.disabled && <span className={ styles.badgeDanger }>Disabled</span> }
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
                            onClick={ () => startAvatarUpload(user) }
                            disabled={ uploadingAvatarId === user.id }
                          >
                            { uploadingAvatarId === user.id ? "Uploading…" : "Avatar" }
                          </button>
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
                            className={ styles.confirmButton }
                            onClick={ () => toggleDisabled(user) }
                            disabled={ user.id === currentUser.id && !user.disabled }
                          >
                            { user.disabled ? "Enable" : "Disable" }
                          </button>
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
