"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";

import { useCurrentUser } from "@/app/useCurrentUser";

import { fetchStatsFromServer } from "@/lib/userData/statsApi";
import { UserStats } from "@/lib/userData/statsTypes";
import { formatFullReadingTime, ReadingTimeUnitLabels } from "@/components/Actions/ReadingTimer/helpers/formatReadingTime";

import { MigrateBookDataDialog } from "./MigrateBookDataDialog";

import styles from "./assets/styles/thorium-web.userMenu.module.css";

const MIN_PASSWORD_LENGTH = 8;
const READING_TIME_UNITS: ReadingTimeUnitLabels = { seconds: "s", minutes: "m", hours: "h" };

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

  // CLAUDE-ADDED: null while unopened/loading -- rendered as the section's own loading/empty state,
  // same "null means not there yet" convention as StatefulBookSheet's per-book readingStats.
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  const [isMigrateOpen, setIsMigrateOpen] = useState(false);

  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  // CLAUDE-ADDED: AniList PIN-flow connect/disconnect, mirrors the Android app's own
  // AniListAccountSheet/AniListAccountViewModel -- see api/auth/anilist/{authorize-url,exchange,
  // disconnect}. authorizeUrl is fetched fresh each time the sheet opens since it depends on the
  // instance's admin-configured client_id (never hardcoded here, see /api/settings/anilist).
  const [isAniListOpen, setIsAniListOpen] = useState(false);
  const [anilistAuthorizeUrl, setAnilistAuthorizeUrl] = useState<string | null>(null);
  const [isLoadingAuthorizeUrl, setIsLoadingAuthorizeUrl] = useState(false);
  const [anilistNotConfigured, setAnilistNotConfigured] = useState(false);
  const [anilistPinCode, setAnilistPinCode] = useState("");
  const [isConnectingAniList, setIsConnectingAniList] = useState(false);
  const [anilistConnectError, setAnilistConnectError] = useState<string | null>(null);
  const [isDisconnectingAniList, setIsDisconnectingAniList] = useState(false);

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

  const openStats = () => {
    setIsStatsOpen(true);
    setStats(null);
    fetchStatsFromServer().then(setStats);
  };

  const openAniList = () => {
    setAnilistPinCode("");
    setAnilistConnectError(null);
    setIsAniListOpen(true);
    setIsLoadingAuthorizeUrl(true);
    fetch("/api/auth/anilist/authorize-url")
      .then((res) => res.json())
      .then((data) => {
        setAnilistAuthorizeUrl(data?.url ?? null);
        setAnilistNotConfigured(!data?.url);
      })
      .catch((err) => {
        console.error("Failed to load AniList authorize URL:", err);
        setAnilistConnectError("Couldn't reach the server");
      })
      .finally(() => setIsLoadingAuthorizeUrl(false));
  };

  const connectAniList = async () => {
    const code = anilistPinCode.trim();
    if (!code) return;

    setIsConnectingAniList(true);
    setAnilistConnectError(null);

    try {
      const res = await fetch("/api/auth/anilist/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setAnilistConnectError(data?.error || "Couldn't connect to AniList");
        return;
      }

      setAnilistPinCode("");
      await refresh();
    } catch (err) {
      console.error("Failed to connect AniList:", err);
      setAnilistConnectError("Couldn't connect to AniList");
    } finally {
      setIsConnectingAniList(false);
    }
  };

  const disconnectAniList = async () => {
    setIsDisconnectingAniList(true);
    setAnilistConnectError(null);

    try {
      const res = await fetch("/api/auth/anilist/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setAnilistConnectError(data?.error || "Couldn't disconnect AniList");
        return;
      }
      await refresh();
    } catch (err) {
      console.error("Failed to disconnect AniList:", err);
      setAnilistConnectError("Couldn't disconnect AniList");
    } finally {
      setIsDisconnectingAniList(false);
    }
  };

  // CLAUDE-ADDED: Clears the server-side manifest/cover cache (src/app/api/books/route.ts's
  // manifestCache) and reloads so the library grid re-resolves every book's title/author/cover
  // from scratch instead of whatever's currently in memory.
  const refreshManifestCache = async () => {
    if (isRefreshingCache) return;
    setIsRefreshingCache(true);
    try {
      await fetch("/api/books", { method: "DELETE" });
    } catch (err) {
      console.error("Failed to refresh manifest cache:", err);
    } finally {
      window.location.reload();
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
          <MenuItem className={ styles.menuItem } onAction={ openStats }>
            Stats
          </MenuItem>
          <MenuItem className={ styles.menuItem } onAction={ openAniList }>
            AniList
          </MenuItem>
          <MenuItem className={ styles.menuItem } onAction={ () => setIsMigrateOpen(true) }>
            Migrate Book Data
          </MenuItem>
          <MenuItem className={ styles.menuItem } onAction={ refreshManifestCache }>
            { isRefreshingCache ? "Refreshing…" : "Refresh Manifest Cache" }
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
            className: styles.closeButton,
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

    <ThModal
      isOpen={ isStatsOpen }
      onOpenChange={ setIsStatsOpen }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: { className: `${ styles.dialog } ${ styles.statsDialog }` }
      }}
    >
      <ThContainerHeaderWithClose
        label="Stats"
        className={ styles.header }
        compounds={{
          heading: {},
          button: {
            className: styles.closeButton,
            "aria-label": "Close",
            onPress: () => setIsStatsOpen(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        { !stats ? (
          <p className={ styles.statsLoading }>Loading…</p>
        ) : (
          <>
            <div className={ styles.statSection }>
              <h3 className={ styles.statSectionHeading }>Library</h3>
              <div className={ styles.statGrid }>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.booksInLibrary.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Books in Library</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.booksStarted.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Books Started</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.booksFinished.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Books Finished</span>
                </div>
              </div>
            </div>

            <div className={ styles.statSection }>
              <h3 className={ styles.statSectionHeading }>Reading</h3>
              <div className={ styles.statGrid }>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ formatFullReadingTime(stats.totalReadingSeconds, READING_TIME_UNITS) }</span>
                  <span className={ styles.statLabel }>Time Reading</span>
                </div>
                <div className={ styles.statTile }>
                  { stats.averageWpm !== null ? (
                    <span className={ styles.statValue }>
                      { stats.averageWpm }
                      <span className={ styles.statValueUnit }>wpm</span>
                    </span>
                  ) : (
                    <span className={ styles.statValue }>—</span>
                  ) }
                  <span className={ styles.statLabel }>Average Pace</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.totalWordsRead.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Words Read</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.currentStreakDays.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Day Streak</span>
                </div>
              </div>
            </div>

            <div className={ styles.statSection }>
              <h3 className={ styles.statSectionHeading }>Audiobooks</h3>
              <div className={ styles.statGrid }>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.audiobooksInLibrary.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Audiobooks in Library</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.audiobooksStarted.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Audiobooks Started</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.audiobooksFinished.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Audiobooks Finished</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ formatFullReadingTime(Math.round(stats.totalListeningSeconds), READING_TIME_UNITS) }</span>
                  <span className={ styles.statLabel }>Time Listened</span>
                </div>
              </div>
            </div>

            <div className={ styles.statSection }>
              <h3 className={ styles.statSectionHeading }>Annotations</h3>
              <div className={ styles.statGrid }>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.highlightsCount.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Highlights</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.bookmarksCount.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Bookmarks</span>
                </div>
                <div className={ styles.statTile }>
                  <span className={ styles.statValue }>{ stats.notesCount.toLocaleString() }</span>
                  <span className={ styles.statLabel }>Notes</span>
                </div>
              </div>
            </div>
          </>
        ) }
      </ThContainerBody>
    </ThModal>

    <ThModal
      isOpen={ isAniListOpen }
      onOpenChange={ setIsAniListOpen }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: { className: styles.dialog }
      }}
    >
      <ThContainerHeaderWithClose
        label="AniList"
        className={ styles.header }
        compounds={{
          heading: {},
          button: {
            className: styles.closeButton,
            "aria-label": "Close",
            onPress: () => setIsAniListOpen(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        { user.anilistConnected ? (
          <>
            <p className={ styles.status }>
              Your AniList account is connected. Link a manga from its book page to start syncing progress, status, and score.
            </p>
            <button
              type="button"
              className={ styles.secondaryButton }
              onClick={ disconnectAniList }
              disabled={ isDisconnectingAniList }
            >
              { isDisconnectingAniList ? "Disconnecting…" : "Disconnect" }
            </button>
          </>
        ) : isLoadingAuthorizeUrl ? (
          <p className={ styles.status }>Loading…</p>
        ) : anilistNotConfigured ? (
          <p className={ styles.status }>
            This server hasn&apos;t been set up for AniList sync yet -- ask your admin to add an AniList client ID/secret in Admin Settings.
          </p>
        ) : (
          <>
            <p className={ styles.status }>Connect your AniList account to sync manga progress, status, and score as you read.</p>
            <button
              type="button"
              className={ styles.secondaryButton }
              onClick={ () => anilistAuthorizeUrl && window.open(anilistAuthorizeUrl, "_blank", "noopener,noreferrer") }
            >
              Open AniList to Connect
            </button>
            <p className={ styles.status }>After approving, AniList shows you a code on its own page -- paste it below.</p>
            <label className={ styles.fieldRow }>
              <span>Code from AniList</span>
              <input
                type="text"
                className={ styles.textInput }
                value={ anilistPinCode }
                onChange={ (e) => setAnilistPinCode(e.target.value) }
              />
            </label>
            <button
              type="button"
              className={ styles.primaryButton }
              onClick={ connectAniList }
              disabled={ isConnectingAniList || !anilistPinCode.trim() }
            >
              { isConnectingAniList ? "Connecting…" : "Connect" }
            </button>
          </>
        ) }
        { anilistConnectError && <p className={ styles.statusError }>{ anilistConnectError }</p> }
      </ThContainerBody>
    </ThModal>

    <MigrateBookDataDialog isOpen={ isMigrateOpen } onOpenChange={ setIsMigrateOpen } />
    </>
  );
};
