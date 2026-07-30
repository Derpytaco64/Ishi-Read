"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Image from "next/image";

import logo from "@/assets/ishamel.png";

import styles from "./login.module.css";

interface PublicUserSummary {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

interface LoginPageClientProps {
  accentColor: string;
  accentTextColor: string;
  themeMode: "light" | "dark";
}

type Stage = "pick" | "password" | "setup";

const MIN_PASSWORD_LENGTH = 8;

function AvatarCircle({ user, className }: { user: PublicUserSummary; className: string }) {
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ user.avatarUrl } alt="" className={ className } />
  ) : (
    <span className={ className } aria-hidden="true">{ user.name.charAt(0).toUpperCase() }</span>
  );
}

// CLAUDE-ADDED: Jellyfin-style flow -- pick a profile picture first, then a password field appears
// for that specific account (rather than a single combined username+password form up front). The
// "next" redirect target reads from location.search directly instead of next/navigation's
// useSearchParams, which would otherwise force this page behind a <Suspense> boundary for no benefit
// here (nothing above this component needs to render before it's known).
// accentColor/accentTextColor/themeMode come from the server-component wrapper (page.tsx), which
// reads the admin-configured global settings straight off disk -- no client fetch, no flash of the
// wrong color or the wrong light/dark mode.
export default function LoginPageClient({ accentColor, accentTextColor, themeMode }: LoginPageClientProps) {
  const [nextPath, setNextPath] = useState("/");
  const [users, setUsers] = useState<PublicUserSummary[]>([]);
  const [selected, setSelected] = useState<PublicUserSummary | null>(null);
  const [stage, setStage] = useState<Stage>("pick");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setNextPath(new URLSearchParams(window.location.search).get("next") || "/");
  }, []);

  useEffect(() => {
    fetch("/api/auth/users")
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
      .catch((err) => console.error("Failed to load users:", err));
  }, []);

  const selectUser = (user: PublicUserSummary) => {
    setSelected(user);
    setStage("password");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setLockedUntil(null);
  };

  const backToPicker = () => {
    setSelected(null);
    setStage("pick");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setLockedUntil(null);
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setLockedUntil(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: selected.username, password })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.needsPasswordSetup) {
        setStage("setup");
        setPassword("");
        return;
      }

      if (!res.ok) {
        setError(data?.error || "Login failed");
        setLockedUntil(data?.lockedUntil ?? null);
        return;
      }

      window.location.href = nextPath;
    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSetup = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || isSubmitting) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${ MIN_PASSWORD_LENGTH } characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, password })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Failed to set password");
        return;
      }

      window.location.href = nextPath;
    } catch (err) {
      console.error("Failed to set password:", err);
      setError("Failed to set password");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className={ styles.page }
      data-theme={ themeMode }
      style={ { "--th-color-accent": accentColor, "--th-color-accent-text": accentTextColor } as CSSProperties }
    >
      <Image src={ logo } alt="" className={ styles.logo } priority />

      { stage === "pick" && (
        <>
          <h1 className={ styles.heading }>Who&rsquo;s reading?</h1>

          { users.length === 0 ? (
            <p className={ styles.hint }>No accounts yet.</p>
          ) : (
            <div className={ styles.grid }>
              { users.map((user) => (
                <button
                  key={ user.id }
                  type="button"
                  className={ styles.tile }
                  onClick={ () => selectUser(user) }
                >
                  <AvatarCircle user={ user } className={ styles.avatar } />
                  <span className={ styles.tileName }>{ user.name }</span>
                </button>
              )) }
            </div>
          ) }
        </>
      ) }

      { stage === "password" && selected && (
        <form className={ styles.form } onSubmit={ submitLogin }>
          <AvatarCircle user={ selected } className={ styles.avatarLarge } />
          <h1 className={ styles.heading }>{ selected.name }</h1>

          <input
            type="password"
            className={ styles.input }
            placeholder="Password (leave blank if none set)"
            value={ password }
            onChange={ (e) => setPassword(e.target.value) }
            autoFocus
            aria-label="Password"
          />

          { error && (
            <p className={ styles.error }>
              { error }
              { lockedUntil ? ` Try again after ${ new Date(lockedUntil).toLocaleTimeString() }.` : "" }
            </p>
          ) }

          <div className={ styles.actions }>
            <button type="button" className={ styles.secondaryButton } onClick={ backToPicker }>
              Back
            </button>
            { /* CLAUDE-ADDED: No `!password` guard here (unlike a typical login form) -- an account
                 with no password yet signs in with the field left blank, see attemptLogin in auth.ts. */ }
            <button type="submit" className={ styles.primaryButton } disabled={ isSubmitting }>
              { isSubmitting ? "Signing in…" : "Sign In" }
            </button>
          </div>
        </form>
      ) }

      { stage === "setup" && selected && (
        <form className={ styles.form } onSubmit={ submitSetup }>
          <AvatarCircle user={ selected } className={ styles.avatarLarge } />
          <h1 className={ styles.heading }>Set a password for { selected.name }</h1>
          <p className={ styles.hint }>This account doesn&rsquo;t have one yet.</p>

          <input
            type="password"
            className={ styles.input }
            placeholder="New password"
            value={ password }
            onChange={ (e) => setPassword(e.target.value) }
            autoFocus
            aria-label="New password"
          />
          <input
            type="password"
            className={ styles.input }
            placeholder="Confirm password"
            value={ confirmPassword }
            onChange={ (e) => setConfirmPassword(e.target.value) }
            aria-label="Confirm password"
          />

          { error && <p className={ styles.error }>{ error }</p> }

          <div className={ styles.actions }>
            <button type="button" className={ styles.secondaryButton } onClick={ backToPicker }>
              Back
            </button>
            <button type="submit" className={ styles.primaryButton } disabled={ isSubmitting }>
              { isSubmitting ? "Saving…" : "Set Password & Sign In" }
            </button>
          </div>
        </form>
      ) }
    </main>
  );
}
