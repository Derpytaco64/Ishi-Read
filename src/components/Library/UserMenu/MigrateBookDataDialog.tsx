"use client";

import { useEffect, useState } from "react";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThContainerBody } from "@/core/Components/Containers/ThContainerBody";
import { ThContainerHeaderWithClose } from "@/core/Components/Containers/ThContainerHeader";

import { Publication } from "@/components/Misc/PublicationGrid";
import { getBookProgressPercent, getManifestUrlFromBookUrl } from "@/helpers/getBookProgress";
import { fetchNotesFromServer } from "@/lib/userData/notesApi";
import { fetchHighlightsFromServer } from "@/lib/userData/highlightsApi";
import { fetchBookmarksFromServer } from "@/lib/userData/bookmarksApi";
import { fetchCompletedReadTimesFromServer } from "@/lib/userData/completedReadTimesApi";
import { fetchReadingTimeFromServer } from "@/lib/userData/readingTimeApi";
import { fetchListeningTimeFromServer } from "@/lib/userData/listeningTimeApi";
import { fetchCompletedListensFromServer } from "@/lib/userData/completedListensApi";
import { migrateBookDataOnServer } from "@/lib/userData/migrateBookDataApi";
import { formatFullReadingTime, ReadingTimeUnitLabels } from "@/components/Actions/ReadingTimer/helpers/formatReadingTime";

import styles from "./assets/styles/thorium-web.userMenu.module.css";

const READING_TIME_UNITS: ReadingTimeUnitLabels = { seconds: "s", minutes: "m", hours: "h" };

type Step = "source" | "dest" | "confirm";

// CLAUDE-ADDED: Only the counts this dialog's summary chips need -- deliberately not the full
// ReadingStats shape StatefulBookSheet builds (no wpm/secondsLeft, this isn't a live reading-progress
// display), fetched fresh per book selection rather than cached across the dialog's lifetime.
interface BookSummary {
  percent: number | null;
  isAudiobook: boolean;
  notes: number;
  highlights: number;
  bookmarks: number;
  completedReads: number;
  readingSeconds: number | null;
  listeningSeconds: number | null;
  completedListens: number;
}

const EMPTY_SUMMARY: BookSummary = {
  percent: null,
  isAudiobook: false,
  notes: 0,
  highlights: 0,
  bookmarks: 0,
  completedReads: 0,
  readingSeconds: null,
  listeningSeconds: null,
  completedListens: 0
};

async function loadBookSummary(book: Publication): Promise<BookSummary> {
  const manifestUrl = getManifestUrlFromBookUrl(book.url);
  if (!manifestUrl) return EMPTY_SUMMARY;

  const percent = await getBookProgressPercent(book.url);

  if (book.isAudiobook) {
    const [listeningTime, completedListens] = await Promise.all([
      fetchListeningTimeFromServer(manifestUrl),
      fetchCompletedListensFromServer(manifestUrl)
    ]);

    return {
      ...EMPTY_SUMMARY,
      percent,
      isAudiobook: true,
      listeningSeconds: listeningTime?.accumulatedSeconds ?? null,
      completedListens: completedListens.length
    };
  }

  const [notes, highlights, bookmarks, completedReads, readingSeconds] = await Promise.all([
    fetchNotesFromServer(manifestUrl),
    fetchHighlightsFromServer(manifestUrl),
    fetchBookmarksFromServer(manifestUrl),
    fetchCompletedReadTimesFromServer(manifestUrl),
    fetchReadingTimeFromServer(manifestUrl)
  ]);

  return {
    ...EMPTY_SUMMARY,
    percent,
    notes: notes.length,
    highlights: highlights.length,
    bookmarks: bookmarks.length,
    completedReads: completedReads.length,
    readingSeconds
  };
}

function SummaryChips({ summary }: { summary: BookSummary }) {
  const chips: string[] = [
    summary.percent !== null ? `Progress: ${ summary.percent }%` : "Progress: Not started"
  ];

  if (summary.isAudiobook) {
    if (summary.listeningSeconds) {
      chips.push(`Time Listened: ${ formatFullReadingTime(summary.listeningSeconds, READING_TIME_UNITS) }`);
    }
    chips.push(`Completed Listens: ${ summary.completedListens }`);
  } else {
    chips.push(`Notes: ${ summary.notes }`);
    chips.push(`Highlights: ${ summary.highlights }`);
    chips.push(`Bookmarks: ${ summary.bookmarks }`);
    if (summary.readingSeconds) {
      chips.push(`Time Read: ${ formatFullReadingTime(summary.readingSeconds, READING_TIME_UNITS) }`);
    }
    chips.push(`Completed Reads: ${ summary.completedReads }`);
  }

  return (
    <div className={ styles.summaryChips }>
      { chips.map((chip) => (
        <span key={ chip } className={ styles.summaryChip }>{ chip }</span>
      )) }
    </div>
  );
}

function BookPicker({
  books,
  excludeUrl,
  onPick
}: {
  books: Publication[];
  excludeUrl?: string;
  onPick: (book: Publication) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = books.filter((book) => {
    if (excludeUrl && book.url === excludeUrl) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q);
  });

  return (
    <div className={ styles.bookPicker }>
      <input
        type="text"
        className={ styles.textInput }
        placeholder="Search your library…"
        value={ query }
        onChange={ (e) => setQuery(e.target.value) }
      />
      <div className={ styles.bookList }>
        { filtered.length === 0 && <p className={ styles.status }>No books found</p> }
        { filtered.map((book) => (
          // eslint-disable-next-line @next/next/no-img-element
          <button key={ book.url } type="button" className={ styles.bookRow } onClick={ () => onPick(book) }>
            <img src={ book.cover } alt="" className={ styles.bookRowCover } />
            <span className={ styles.bookRowText }>
              <span className={ styles.bookRowTitle }>{ book.title }</span>
              <span className={ styles.bookRowAuthor }>{ book.author }</span>
            </span>
          </button>
        )) }
      </div>
    </div>
  );
}

function SelectedBookCard({
  book,
  summary,
  isLoadingSummary,
  onChangeBook
}: {
  book: Publication;
  summary: BookSummary | null;
  isLoadingSummary: boolean;
  onChangeBook: () => void;
}) {
  return (
    <div className={ styles.selectedBookCard }>
      <div className={ styles.selectedBookHeader }>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ book.cover } alt="" className={ styles.bookRowCover } />
        <span className={ styles.bookRowText }>
          <span className={ styles.bookRowTitle }>{ book.title }</span>
          <span className={ styles.bookRowAuthor }>{ book.author }</span>
        </span>
        <button type="button" className={ styles.linkButton } onClick={ onChangeBook }>Change</button>
      </div>
      { isLoadingSummary && <p className={ styles.status }>Loading stats…</p> }
      { !isLoadingSummary && summary && <SummaryChips summary={ summary } /> }
    </div>
  );
}

// CLAUDE-ADDED: Two-step book picker (source, then destination -- exact-URL match blocked between
// them) followed by an explicit overwrite confirmation, for carrying a book's progress/annotations
// forward onto a different library entry after a metadata edit changes its content hash (see
// resolveBookIdentity) and orphans the old entry's data. Scoped to the current user only -- every
// userdata route this calls already keys strictly off the logged-in session, so no admin gate is
// needed here (mirrors StatefulUserMenu's own Edit User / Stats dialogs, not the Admin Settings link).
export function MigrateBookDataDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<Step>("source");
  const [books, setBooks] = useState<Publication[] | null>(null);

  const [sourceBook, setSourceBook] = useState<Publication | null>(null);
  const [sourceSummary, setSourceSummary] = useState<BookSummary | null>(null);
  const [isLoadingSourceSummary, setIsLoadingSourceSummary] = useState(false);

  const [destBook, setDestBook] = useState<Publication | null>(null);
  const [destSummary, setDestSummary] = useState<BookSummary | null>(null);
  const [isLoadingDestSummary, setIsLoadingDestSummary] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setStep("source");
    setSourceBook(null);
    setSourceSummary(null);
    setDestBook(null);
    setDestSummary(null);
    setSubmitError(null);
    setIsDone(false);

    fetch("/api/books")
      .then((res) => res.json())
      .then((data) => setBooks(data.books || []))
      .catch((err) => {
        console.error("Failed to load library for book migration:", err);
        setBooks([]);
      });
  }, [isOpen]);

  const pickSource = (book: Publication) => {
    setSourceBook(book);
    setSourceSummary(null);
    setIsLoadingSourceSummary(true);
    loadBookSummary(book).then((summary) => {
      setSourceSummary(summary);
      setIsLoadingSourceSummary(false);
    });
  };

  const pickDest = (book: Publication) => {
    setDestBook(book);
    setDestSummary(null);
    setIsLoadingDestSummary(true);
    loadBookSummary(book).then((summary) => {
      setDestSummary(summary);
      setIsLoadingDestSummary(false);
    });
  };

  const confirmMigration = async () => {
    if (!sourceBook || !destBook) return;

    const sourceManifestUrl = getManifestUrlFromBookUrl(sourceBook.url);
    const destManifestUrl = getManifestUrlFromBookUrl(destBook.url);
    if (!sourceManifestUrl || !destManifestUrl) {
      setSubmitError("Could not resolve one of these books -- try again");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const error = await migrateBookDataOnServer(sourceManifestUrl, destManifestUrl);

    setIsSubmitting(false);
    if (error) setSubmitError(error);
    else setIsDone(true);
  };

  return (
    <ThModal
      isOpen={ isOpen }
      onOpenChange={ onOpenChange }
      isDismissable
      className={ styles.underlay }
      compounds={{
        dialog: { className: styles.dialog }
      }}
    >
      <ThContainerHeaderWithClose
        label="Migrate Book Data"
        className={ styles.header }
        compounds={{
          heading: {},
          button: {
            className: styles.closeButton,
            "aria-label": "Close",
            onPress: () => onOpenChange(false)
          }
        }}
      />

      <ThContainerBody className={ styles.body }>
        { books === null && <p className={ styles.status }>Loading your library…</p> }

        { books !== null && step === "source" && !sourceBook && (
          <>
            <p className={ styles.status }>Choose the book to migrate progress and annotations from.</p>
            <BookPicker books={ books } onPick={ pickSource } />
          </>
        ) }

        { books !== null && step === "source" && sourceBook && (
          <>
            <SelectedBookCard
              book={ sourceBook }
              summary={ sourceSummary }
              isLoadingSummary={ isLoadingSourceSummary }
              onChangeBook={ () => { setSourceBook(null); setSourceSummary(null); } }
            />
            <button
              type="button"
              className={ styles.primaryButton }
              disabled={ isLoadingSourceSummary }
              onClick={ () => setStep("dest") }
            >
              Continue
            </button>
          </>
        ) }

        { books !== null && step === "dest" && !destBook && (
          <>
            <p className={ styles.status }>Choose the book to migrate that data to.</p>
            <BookPicker books={ books } excludeUrl={ sourceBook?.url } onPick={ pickDest } />
          </>
        ) }

        { books !== null && step === "dest" && destBook && (
          <>
            <SelectedBookCard
              book={ destBook }
              summary={ destSummary }
              isLoadingSummary={ isLoadingDestSummary }
              onChangeBook={ () => { setDestBook(null); setDestSummary(null); } }
            />
            <button
              type="button"
              className={ styles.primaryButton }
              disabled={ isLoadingDestSummary }
              onClick={ () => setStep("confirm") }
            >
              Continue
            </button>
          </>
        ) }

        { step === "confirm" && sourceBook && destBook && !isDone && (
          <>
            <p className={ styles.statusError }>
              This will overwrite <strong>{ destBook.title }</strong>&apos;s progress, reading time,
              completed reads, and annotations with the data from <strong>{ sourceBook.title }</strong>.
              This can&apos;t be undone.
            </p>
            { submitError && <p className={ styles.statusError }>{ submitError }</p> }
            <div className={ styles.stepActions }>
              <button type="button" className={ styles.secondaryButton } disabled={ isSubmitting } onClick={ () => setStep("dest") }>
                Back
              </button>
              <button type="button" className={ styles.primaryButton } disabled={ isSubmitting } onClick={ confirmMigration }>
                { isSubmitting ? "Migrating…" : "Overwrite and Migrate" }
              </button>
            </div>
          </>
        ) }

        { isDone && (
          <>
            <p className={ styles.status }>Done -- { destBook?.title } now has { sourceBook?.title }&apos;s data.</p>
            <button type="button" className={ styles.primaryButton } onClick={ () => onOpenChange(false) }>
              Close
            </button>
          </>
        ) }
      </ThContainerBody>
    </ThModal>
  );
}
