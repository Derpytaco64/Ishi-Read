"use client";

import { useEffect, useState } from "react";

import { Button, Disclosure, DisclosurePanel, Heading } from "react-aria-components";

import { useCurrentUser } from "@/app/useCurrentUser";

import { aniListSeriesKey, fetchAniListLinks, setAniListLink, AniListLink } from "@/lib/userData/anilistLinksApi";
import {
  searchAniList, fetchAniListEntry, saveAniListEntry,
  AniListMedia, AniListMediaListEntry, AniListSearchResult, AniListFuzzyDate, AniListSaveEntryPatch
} from "@/lib/userData/anilistTrackingApi";

import ChevronDown from "./assets/icons/chevron_down.svg";

import styles from "./assets/styles/thorium-web.bookSheet.module.css";

const STATUS_OPTIONS = ["CURRENT", "PLANNING", "COMPLETED", "DROPPED", "PAUSED", "REPEATING"];

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "Reading", PLANNING: "Planning", COMPLETED: "Completed",
  DROPPED: "Dropped", PAUSED: "Paused", REPEATING: "Rereading"
};

// CLAUDE-ADDED: The raw number sent over the wire is always whatever AniList's own scoreFormat
// expects -- this is purely the input label, same as TrackingSheet.kt's own scoreLabel.
function scoreLabel(scoreFormat: string | null): string {
  switch (scoreFormat) {
    case "POINT_100": return "Score (0-100)";
    case "POINT_10_DECIMAL":
    case "POINT_10": return "Score (0-10)";
    case "POINT_5": return "Score (0-5)";
    case "POINT_3": return "Score (0-3)";
    default: return "Score";
  }
}

function fuzzyDateToInputValue(date: AniListFuzzyDate | null | undefined): string {
  if (!date?.year) return "";
  return `${ date.year }-${ String(date.month ?? 1).padStart(2, "0") }-${ String(date.day ?? 1).padStart(2, "0") }`;
}

function inputValueToFuzzyDate(value: string): AniListFuzzyDate | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year) return null;
  return { year, month: month || null, day: day || null };
}

// CLAUDE-ADDED: Same "yyyy-mm-dd, ?? for an unknown month/day, Not set for no year at all" wording
// as Android's TrackingSheet.kt AniListFuzzyDate?.label(), so the two platforms never disagree on
// how a fuzzy date reads.
function formatFuzzyDate(date: AniListFuzzyDate | null | undefined): string {
  if (!date?.year) return "Not set";
  const month = date.month ? String(date.month).padStart(2, "0") : "??";
  const day = date.day ? String(date.day).padStart(2, "0") : "??";
  return `${ date.year }-${ month }-${ day }`;
}

// CLAUDE-ADDED: Drops a trailing ".0" for AniList's whole-number score formats (POINT_100/POINT_10/
// POINT_5/POINT_3) but keeps one decimal for POINT_10_DECIMAL -- same as Android's Double.formatScore().
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

const EMPTY_ENTRY: AniListMediaListEntry = { id: 0, status: "PLANNING", score: 0, progress: 0, repeat: 0, startedAt: null, completedAt: null };

export interface AniListTrackingSectionProps {
  manifestUrl: string;
  title: string;
  seriesName: string | null;
  /** Forwarded straight to the inner Disclosure -- lets the parent bottom sheet snap to full height
   *  when this section expands, same as the Annotations section right above it. */
  onExpandedChange?: (isExpanded: boolean) => void;
}

// CLAUDE-ADDED: Manga-only AniList tracking -- website counterpart to the Android app's
// TrackingViewModel/TrackingSheet (see anilist_sync_design memory). Same link-picker-then-fields
// shape: search AniList and link a series (autopopulated with its own title) when unlinked, or show
// Tachiyomi-style status/score/progress/repeat/dates once it is. The link itself is series-wide
// (see aniListSeriesKey), so linking from any one volume's sheet is enough for every other volume.
export const AniListTrackingSection = ({ manifestUrl, title, seriesName, onExpandedChange }: AniListTrackingSectionProps) => {
  const { user } = useCurrentUser();

  const [isLoading, setIsLoading] = useState(true);
  const [link, setLink] = useState<AniListLink | null>(null);
  const [media, setMedia] = useState<AniListMedia | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AniListSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setMedia(null);
    setSearchResults([]);

    const seriesKey = aniListSeriesKey(seriesName, manifestUrl);

    fetchAniListLinks().then((links) => {
      if (cancelled) return;
      const found = links[seriesKey] ?? null;
      setLink(found);

      if (!found) {
        // Prefills the search field with this series' own title (falling back to the book's own
        // title for a standalone book with no series metadata) -- still just a starting point, the
        // user can edit it before hitting Search.
        setSearchQuery(seriesName || title);
        setIsLoading(false);
        return;
      }

      fetchAniListEntry(found.mediaId).then((entryMedia) => {
        if (cancelled) return;
        setMedia(entryMedia);
        setIsLoading(false);
      });
    });

    return () => { cancelled = true; };
  }, [manifestUrl, seriesName, title]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    const results = await searchAniList(searchQuery.trim());
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleLink = async (result: AniListSearchResult) => {
    const seriesKey = aniListSeriesKey(seriesName, manifestUrl);
    const newLink: AniListLink = { mediaId: result.id, syncEnabled: true };
    setLink(newLink);
    setSearchResults([]);
    setSearchQuery("");
    setIsLoading(true);
    setAniListLink(seriesKey, newLink);
    const entryMedia = await fetchAniListEntry(result.id);
    setMedia(entryMedia);
    setIsLoading(false);
  };

  // CLAUDE-ADDED: Doesn't touch anything already saved on the AniList side, only forgets the
  // mapping locally/server-side in library-prefs -- same as TrackingViewModel.unlink's own comment.
  const handleUnlink = () => {
    const seriesKey = aniListSeriesKey(seriesName, manifestUrl);
    setAniListLink(seriesKey, null);
    setLink(null);
    setMedia(null);
    setSearchQuery(seriesName || title);
  };

  const handleToggleSync = (enabled: boolean) => {
    if (!link) return;
    const updated = { ...link, syncEnabled: enabled };
    setLink(updated);
    setAniListLink(aniListSeriesKey(seriesName, manifestUrl), updated);
  };

  const updateLocalEntry = (patch: Partial<AniListMediaListEntry>) => {
    setMedia((prev) => {
      const base = prev ?? { id: link?.mediaId ?? 0, chapters: null, title: { romaji: null, english: null }, coverImage: null, mediaListEntry: null };
      return { ...base, mediaListEntry: { ...(base.mediaListEntry ?? EMPTY_ENTRY), ...patch } };
    });
  };

  const pushPatch = (fields: Omit<AniListSaveEntryPatch, "mediaId">) => {
    if (!link) return;
    saveAniListEntry({ mediaId: link.mediaId, ...fields }).then(({ error: saveError }) => {
      if (saveError) setError(saveError);
    });
  };

  const entry = media?.mediaListEntry;
  const isLinked = link !== null;

  return (
    <Disclosure className={ styles.disclosure } onExpandedChange={ onExpandedChange }>
      <Heading className={ styles.disclosureHeading }>
        <Button slot="trigger" className={ styles.disclosureTrigger }>
          <span className={ styles.disclosureLabel }>AniList Tracking</span>
          { isLinked && <span className={ styles.chip }>Tracking</span> }
          <ChevronDown aria-hidden="true" focusable="false" className={ styles.disclosureChevron } />
        </Button>
      </Heading>

      { /* CLAUDE-ADDED: Status/chapter/score + start/finish date summary -- a sibling of the
           trigger/panel (not inside DisclosurePanel), so it's visible whether the section is
           expanded or not, mirroring Android's BookDetailScreen summary row below its own
           "Tracking on AniList" chip (see anilist_sync_design memory, round 4). Only rendered once
           there's an actual list entry to summarize -- a linked-but-not-yet-added series (entry
           null) shows nothing here rather than a row of placeholders. */ }
      { isLinked && entry && (
        <div className={ styles.anilistSummaryRow }>
          <span>{ STATUS_LABELS[entry.status] ?? entry.status }</span>
          <span>
            { `Ch. ${ entry.progress }` }
            { media?.chapters ? `/${ media.chapters }` : "" }
          </span>
          { entry.score > 0 && <span>{ `★ ${ formatScore(entry.score) }` }</span> }
        </div>
      ) }
      { isLinked && entry && (entry.startedAt?.year || entry.completedAt?.year) && (
        <div className={ `${ styles.anilistSummaryRow } ${ styles.anilistSummaryDates }` }>
          <span>{ `Started: ${ formatFuzzyDate(entry.startedAt) }` }</span>
          <span>{ `Finished: ${ formatFuzzyDate(entry.completedAt) }` }</span>
        </div>
      ) }

      <DisclosurePanel className={ styles.disclosurePanel }>
        { isLoading ? (
          <p className={ styles.annotationsEmpty }>Loading…</p>
        ) : !user?.anilistConnected ? (
          <p className={ styles.annotationsEmpty }>Connect your AniList account from the account menu to enable tracking.</p>
        ) : !isLinked ? (
          <div>
            <p className={ styles.anilistStatusText }>Link this series to an AniList entry to start syncing progress.</p>
            <div className={ styles.anilistRow }>
              <input
                type="text"
                className={ `${ styles.anilistTextInput } ${ styles.anilistSearchRow }` }
                value={ searchQuery }
                onChange={ (e) => setSearchQuery(e.target.value) }
                onKeyDown={ (e) => { if (e.key === "Enter") handleSearch(); } }
                placeholder="Search AniList"
              />
              <button type="button" className={ styles.confirmButton } onClick={ handleSearch } disabled={ isSearching }>
                { isSearching ? "…" : "Search" }
              </button>
            </div>

            { searchResults.length > 0 && (
              <ul className={ styles.anilistResultsList }>
                { searchResults.map((result) => (
                  <li key={ result.id } className={ styles.anilistResultRow }>
                    { result.coverImage?.medium ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ result.coverImage.medium } alt="" className={ styles.anilistResultCover } />
                    ) : (
                      <span className={ styles.anilistResultCover } aria-hidden="true" />
                    ) }
                    <div className={ styles.anilistResultText }>
                      <span className={ styles.anilistResultTitle }>{ result.title.english ?? result.title.romaji ?? "Untitled" }</span>
                      <span className={ styles.anilistStatusText }>
                        { [result.format, result.chapters ? `${ result.chapters } ch` : null].filter(Boolean).join(" · ") }
                      </span>
                    </div>
                    <button type="button" className={ styles.confirmButton } onClick={ () => handleLink(result) }>Link</button>
                  </li>
                )) }
              </ul>
            ) }
          </div>
        ) : (
          <div>
            <div className={ styles.anilistToggleRow }>
              <label>
                <input
                  type="checkbox"
                  checked={ link?.syncEnabled ?? true }
                  onChange={ (e) => handleToggleSync(e.target.checked) }
                />
                { " " }Sync progress while reading
              </label>
            </div>

            <div className={ styles.anilistFieldGrid }>
              <label className={ styles.anilistField }>
                Status
                <select
                  className={ styles.anilistSelect }
                  value={ entry?.status ?? "PLANNING" }
                  onChange={ (e) => { updateLocalEntry({ status: e.target.value }); pushPatch({ status: e.target.value }); } }
                >
                  { STATUS_OPTIONS.map((status) => (
                    <option key={ status } value={ status }>{ STATUS_LABELS[status] }</option>
                  )) }
                </select>
              </label>

              <label className={ styles.anilistField }>
                { scoreLabel(user?.anilistScoreFormat ?? null) }
                <input
                  type="number"
                  className={ styles.anilistTextInput }
                  value={ entry?.score || "" }
                  onChange={ (e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value)) { updateLocalEntry({ score: value }); pushPatch({ score: value }); }
                  } }
                />
              </label>

              <label className={ styles.anilistField }>
                Chapter{ media?.chapters ? ` (of ${ media.chapters })` : "" }
                <input
                  type="number"
                  className={ styles.anilistTextInput }
                  value={ entry?.progress ?? 0 }
                  onChange={ (e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value)) { updateLocalEntry({ progress: value }); pushPatch({ progress: value }); }
                  } }
                />
              </label>

              <label className={ styles.anilistField }>
                Rereads
                <input
                  type="number"
                  className={ styles.anilistTextInput }
                  value={ entry?.repeat ?? 0 }
                  onChange={ (e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value)) { updateLocalEntry({ repeat: value }); pushPatch({ repeat: value }); }
                  } }
                />
              </label>

              <label className={ styles.anilistField }>
                Start date
                <input
                  type="date"
                  className={ styles.anilistTextInput }
                  value={ fuzzyDateToInputValue(entry?.startedAt) }
                  onChange={ (e) => {
                    const date = inputValueToFuzzyDate(e.target.value);
                    updateLocalEntry({ startedAt: date });
                    pushPatch({ startedAt: date });
                  } }
                />
              </label>

              <label className={ styles.anilistField }>
                Completed date
                <input
                  type="date"
                  className={ styles.anilistTextInput }
                  value={ fuzzyDateToInputValue(entry?.completedAt) }
                  onChange={ (e) => {
                    const date = inputValueToFuzzyDate(e.target.value);
                    updateLocalEntry({ completedAt: date });
                    pushPatch({ completedAt: date });
                  } }
                />
              </label>
            </div>

            <button type="button" className={ `${ styles.confirmButton } ${ styles.anilistUnlinkButton }` } onClick={ handleUnlink }>
              Unlink from AniList
            </button>
          </div>
        ) }

        { error && <p className={ styles.anilistStatusError }>{ error }</p> }
      </DisclosurePanel>
    </Disclosure>
  );
};
