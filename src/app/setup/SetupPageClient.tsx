"use client";

import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import Image from "next/image";

import logo from "@/assets/ishamel.png";

import styles from "./setup.module.css";

interface SetupPageClientProps {
  accentColor: string;
  accentTextColor: string;
  booksFolderDefault: string;
  readiumUrlDefault: string;
}

// CLAUDE-ADDED: Shown once, on a genuinely fresh install (see proxy.ts's isSetupCompleted gate) --
// picks the three settings the rest of the app can't function without a sane value for: where the
// books live, where per-user data (positions, highlights, accounts...) is stored, and where the
// Readium server is reachable. Ongoing changes to these same three settings happen from the admin
// panel afterward -- this page (and /api/setup) only ever does anything once, ever.
export default function SetupPageClient({ accentColor, accentTextColor, booksFolderDefault, readiumUrlDefault }: SetupPageClientProps) {
  const [booksFolder, setBooksFolder] = useState(booksFolderDefault);
  const [userDataFolder, setUserDataFolder] = useState("");
  const [readiumUrl, setReadiumUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!booksFolder.trim()) {
      setError("A books folder is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booksFolder: booksFolder.trim(),
          userDataFolder: userDataFolder.trim(),
          readiumUrl: readiumUrl.trim()
        })
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || "Setup failed");
        return;
      }

      window.location.href = "/login";
    } catch (err) {
      console.error("Setup failed:", err);
      setError("Setup failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className={ styles.page }
      style={ { "--th-color-accent": accentColor, "--th-color-accent-text": accentTextColor } as CSSProperties }
    >
      <Image src={ logo } alt="" className={ styles.logo } priority />
      <h1 className={ styles.heading }>Let&rsquo;s get set up</h1>
      <p className={ styles.hint }>A few things to configure before Ishi Read is ready to use. You can change all of these later from the admin panel.</p>

      <form className={ styles.form } onSubmit={ submit }>
        <label className={ styles.fieldRow }>
          <span>Books folder</span>
          <input
            type="text"
            className={ styles.input }
            value={ booksFolder }
            onChange={ (e) => setBooksFolder(e.target.value) }
            spellCheck={ false }
            autoFocus
          />
          <p className={ styles.fieldHint }>The folder Ishi Read scans for books.</p>
        </label>

        <label className={ styles.fieldRow }>
          <span>User data folder (optional)</span>
          <input
            type="text"
            className={ styles.input }
            value={ userDataFolder }
            onChange={ (e) => setUserDataFolder(e.target.value) }
            placeholder={ `${ booksFolder || booksFolderDefault }/UserData` }
            spellCheck={ false }
          />
          <p className={ styles.fieldHint }>Where reading progress, highlights, and accounts are stored. Leave blank to keep it inside the books folder.</p>
        </label>

        <label className={ styles.fieldRow }>
          <span>Readium server URL (only if different from default)</span>
          <input
            type="text"
            className={ styles.input }
            value={ readiumUrl }
            onChange={ (e) => setReadiumUrl(e.target.value) }
            placeholder={ readiumUrlDefault }
            spellCheck={ false }
          />
        </label>

        { error && <p className={ styles.error }>{ error }</p> }

        <button type="submit" className={ styles.primaryButton } disabled={ isSubmitting }>
          { isSubmitting ? "Setting up…" : "Finish Setup" }
        </button>
      </form>
    </main>
  );
}
