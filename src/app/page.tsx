"use client";

import { Fragment, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Publication, PublicationGrid } from "@/components/Misc/PublicationGrid";
import { StatefulLibraryMenu } from "@/components/Library/LibraryMenu/StatefulLibraryMenu";
import { StatefulBookSheet } from "@/components/Library/BookSheet/StatefulBookSheet";
import { StatefulSeriesView } from "@/components/Library/SeriesView/StatefulSeriesView";
import { StatefulMyLibraryView } from "@/components/Library/MyLibrary/StatefulMyLibraryView";
import { StatefulShelfView } from "@/components/Library/CustomShelves/StatefulShelfView";
import { StatefulBookContextMenu, BookContextMenuState } from "@/components/Library/BookContextMenu/StatefulBookContextMenu";
import Image from "next/image";

import { isManifestRouteEnabled } from "./ManifestRouteEnabled";
import { getBookProgressPercent } from "@/helpers/getBookProgress";
import { useCoverSize } from "./useCoverSize";
import { useCustomShelves } from "./useCustomShelves";
import { fetchLibraryPrefsFromServer, saveLibraryPrefsToServer } from "@/lib/userData/libraryPrefsApi";
import { DEFAULT_LIBRARY_VIEW, LIBRARY_VIEW_STORAGE_KEY, LibraryView } from "./libraryView";
import { ACTIVE_SHELF_ID_STORAGE_KEY } from "./customShelves";
import {
  DEFAULT_SHELF_ORDER,
  DEFAULT_SHELF_PREFS,
  mergeShelfOrder,
  SHELF_LABELS,
  SHELF_ORDER_STORAGE_KEY,
  SHELF_PREFS_STORAGE_KEY,
  ShelfKey,
  ShelfPrefs
} from "./shelfPrefs";

import "./reset.css";
import "./home.css";

// const books = [
//   {
//     title: "Moby Dick",
//     author: "Herman Melville",
//     cover: "/images/MobyDick.jpg",
//     url: "/read/moby-dick",
//   }
// ];

// const epub3samples = [
//   {

//   }
// ];

// const onlineBooks = [

// ];

// const webPublications = [
//   {
//     title: "Readium CSS Implementers’ Documentation",
//     author: "Jiminy Panoz",
//     cover: "/images/readium-css.jpg",
//     url: "/read/readium-css",
//   }
// ];

// const audiobooks = [
//   {
//     title: "Flatland",
//     author: "Edwin Abbott Abbott",
//     cover: "https://www.archive.org/download/LibrivoxCdCoverArt12/Flatland_1109.jpg",
//     url: "/read/flatland",
//     rendition: "Audiobook"
//   }
// ]

// CLAUDE-ADDED: Was a standalone duplicate of Publication's shape -- now that Publication also
// carries the calibre-style metadata fields for the book-detail sheet, aliasing it here keeps the
// two from drifting out of sync again.
type DynamicBook = Publication;

// CLAUDE-ADDED: Shared cover renderer for every shelf below.
const renderBookCover = (publication: DynamicBook) => (
  <Image
    src={ publication.cover }
    alt=""
    loading="lazy"
    width={ 240 }
    height={ 360 }
    unoptimized
  />
);

export default function Home() {
  const [isManifestEnabled, setIsManifestEnabled] = useState<boolean>(true);

  const [myLibraryBooks, setMyLibraryBooks] = useState<DynamicBook[]>([]);
  const [progressByUrl, setProgressByUrl] = useState<Record<string, number>>({});

  // CLAUDE-ADDED: Book-detail bottom sheet, opened by clicking a cover in any shelf below.
  const [selectedBook, setSelectedBook] = useState<Publication | null>(null);
  const [isBookSheetOpen, setIsBookSheetOpen] = useState(false);

  // CLAUDE-ADDED: Which top-level library view is showing -- Home (the shelves below) or Series
  // (StatefulSeriesView). Persisted the same way as the other library-page prefs so it survives a
  // reload, hydrated from localStorage first (mount effect below) then reconciled against the
  // server copy in the shared hydrate effect further down.
  const [activeView, setActiveView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LIBRARY_VIEW_STORAGE_KEY);
      if (stored === "home" || stored === "library" || stored === "series" || stored === "shelf") {
        setActiveView(stored);
      }
    } catch (error) {
      console.error("Error reading library view:", error);
    }
  }, []);

  const navigateTo = (view: LibraryView) => {
    setActiveView(view);
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, view);
    saveLibraryPrefsToServer({ activeView: view });
  };

  // CLAUDE-ADDED: Which custom shelf is showing when activeView === "shelf" -- persisted the same
  // way as activeView itself, hydrated alongside it below.
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_SHELF_ID_STORAGE_KEY);
      if (stored) setActiveShelfId(stored);
    } catch (error) {
      console.error("Error reading active shelf id:", error);
    }
  }, []);

  const navigateToShelf = (shelfId: string) => {
    setActiveView("shelf");
    setActiveShelfId(shelfId);
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, "shelf");
    localStorage.setItem(ACTIVE_SHELF_ID_STORAGE_KEY, shelfId);
    saveLibraryPrefsToServer({ activeView: "shelf", activeShelfId: shelfId });
  };

  // CLAUDE-ADDED: One-shot navigation intent for the book context menu's "Go to Series" -- not
  // persisted (unlike activeView/activeShelfId) since it's just "land on this series once", not a
  // preference. StatefulSeriesView only reads it as its initial selectedSeries state, which works
  // because it's conditionally rendered on activeView -- switching into "series" always mounts it
  // fresh, so a plain initial value (no effect needed) is enough to land on the right series.
  const [seriesToOpen, setSeriesToOpen] = useState<string | null>(null);

  const navigateToSeries = (seriesName: string) => {
    setSeriesToOpen(seriesName);
    navigateTo("series");
  };

  // CLAUDE-ADDED: Custom (user-created) shelves -- owned here so both the menu (lists/creates/
  // edits/deletes them) and the book context menu (adds/removes a book) share the same live list,
  // same reasoning as coverSize/shelfPrefs above.
  const {
    shelves,
    createShelf,
    addBookToShelf,
    removeBookFromShelf,
    updateShelf,
    deleteShelf,
    reorderShelves: reorderCustomShelves
  } = useCustomShelves();

  // CLAUDE-ADDED: If the shelf currently being viewed is the one deleted, bounce back to Home
  // instead of leaving the shelf view showing its "this shelf no longer exists" fallback.
  const deleteShelfAndNavigateHome = (shelfId: string) => {
    deleteShelf(shelfId);
    if (activeView === "shelf" && activeShelfId === shelfId) {
      navigateTo("home");
    }
  };

  // CLAUDE-ADDED: Right-click-on-a-book-cover context menu ("Add to shelf"). Null when closed; set
  // to the clicked book + cursor position by any PublicationGrid's onContextMenu below.
  const [contextMenuState, setContextMenuState] = useState<BookContextMenuState | null>(null);

  const openContextMenu = (e: MouseEvent, publication: Publication) => {
    setContextMenuState({ publication, x: e.clientX, y: e.clientY });
  };

  // CLAUDE-ADDED: Defaults to all shelves visible on the server render; the mount effect below
  // reads back the persisted choice, mirroring the theme state's hydration pattern above.
  const [shelfPrefs, setShelfPrefs] = useState<ShelfPrefs>(DEFAULT_SHELF_PREFS);

  // CLAUDE-ADDED: Owned here (not called independently inside StatefulLibraryMenu too, unlike
  // useAccentColor) and passed down as a prop -- accentColor's live update works across components
  // without prop-drilling because setAccentColor's side effect is a global CSS custom property the
  // browser repaints from directly, but coverSize only ever reaches PublicationGrid through this
  // component's own React state (its columnWidth prop), so two independent hook instances here and
  // in StatefulLibraryMenu would silently desync -- the menu's own change wouldn't re-render this
  // component's grid until a full reload. Same reasoning shelfPrefs below is already prop-drilled
  // instead of independently re-derived in each place that needs it.
  const { coverSize, setCoverSize } = useCoverSize();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SHELF_PREFS_STORAGE_KEY);
      if (stored) {
        setShelfPrefs({ ...DEFAULT_SHELF_PREFS, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error("Error reading shelf preferences:", error);
    }
  }, []);

  const toggleShelf = (key: ShelfKey) => {
    setShelfPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(SHELF_PREFS_STORAGE_KEY, JSON.stringify(next));
      saveLibraryPrefsToServer({ shelfPrefs: next });
      return next;
    });
  };

  // CLAUDE-ADDED: Same hydration pattern as shelfPrefs above -- defaults to the built-in order on
  // the server render, then the mount effect reads back whatever the user last dragged it to.
  const [shelfOrder, setShelfOrder] = useState<ShelfKey[]>(DEFAULT_SHELF_ORDER);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SHELF_ORDER_STORAGE_KEY);
      if (stored) {
        setShelfOrder(mergeShelfOrder(JSON.parse(stored)));
      }
    } catch (error) {
      console.error("Error reading shelf order:", error);
    }
  }, []);

  const reorderShelves = (nextOrder: ShelfKey[]) => {
    setShelfOrder(nextOrder);
    localStorage.setItem(SHELF_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    saveLibraryPrefsToServer({ shelfOrder: nextOrder });
  };

  // CLAUDE-ADDED: Same hydrateFromServer pattern the reader settings use -- one fetch after mount,
  // reconciling both shelf preferences at once since they're both owned here. The server copy wins
  // over whatever the localStorage-seeded effects above already set, same as Redux's own merge.
  useEffect(() => {
    fetchLibraryPrefsFromServer().then((server) => {
      if (server?.activeView === "home" || server?.activeView === "library" || server?.activeView === "series" || server?.activeView === "shelf") {
        setActiveView(server.activeView);
        localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, server.activeView);
      }

      if (typeof server?.activeShelfId === "string") {
        setActiveShelfId(server.activeShelfId);
        localStorage.setItem(ACTIVE_SHELF_ID_STORAGE_KEY, server.activeShelfId);
      }

      if (server?.shelfPrefs && typeof server.shelfPrefs === "object") {
        const next = { ...DEFAULT_SHELF_PREFS, ...(server.shelfPrefs as ShelfPrefs) };
        setShelfPrefs(next);
        localStorage.setItem(SHELF_PREFS_STORAGE_KEY, JSON.stringify(next));
      } else {
        // CLAUDE-ADDED: The server has never been told this value -- e.g. it was set back when this
        // was localStorage-only, before library-prefs synced to the server at all. Seed it now so a
        // later cleared-storage load has something real to restore instead of falling back to
        // DEFAULT_SHELF_PREFS.
        const stored = localStorage.getItem(SHELF_PREFS_STORAGE_KEY);
        if (stored) {
          try {
            saveLibraryPrefsToServer({ shelfPrefs: { ...DEFAULT_SHELF_PREFS, ...JSON.parse(stored) } });
          } catch (error) {
            console.error("Error parsing cached shelf preferences:", error);
          }
        }
      }

      if (server?.shelfOrder) {
        const next = mergeShelfOrder(server.shelfOrder);
        setShelfOrder(next);
        localStorage.setItem(SHELF_ORDER_STORAGE_KEY, JSON.stringify(next));
      } else {
        const stored = localStorage.getItem(SHELF_ORDER_STORAGE_KEY);
        if (stored) {
          try {
            saveLibraryPrefsToServer({ shelfOrder: mergeShelfOrder(JSON.parse(stored)) });
          } catch (error) {
            console.error("Error parsing cached shelf order:", error);
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    const checkManifestRoute = async () => {
      try {
        const enabled = await isManifestRouteEnabled();
        setIsManifestEnabled(enabled);
      } catch (error) {
        console.error("Error checking manifest route:", error);
        setIsManifestEnabled(false);
      }
    };

    checkManifestRoute();
  }, []);

  const fetchMyLibrary = async () => {
    try {
      const res = await fetch("/api/books");
      const data = await res.json();
      setMyLibraryBooks(data.books || []);
    } catch (error) {
      console.error("Error fetching library books:", error);
    }
  };

  useEffect(() => {
    fetchMyLibrary();
  }, []);

  // CLAUDE-ADDED: Reading progress, fetched once here and handed down to every shelf's
  // PublicationGrid via its progressByUrl prop -- previously each grid re-fetched the same books'
  // positions independently (up to once per shelf a book appears in), and page.tsx fetched it
  // again on top of that just to filter "Continue Reading". This is now the single fetch.
  useEffect(() => {
    if (myLibraryBooks.length === 0) return;

    let cancelled = false;

    Promise.all(
      myLibraryBooks.map(async (book) => {
        const percent = await getBookProgressPercent(book.url);
        return [book.url, percent] as const;
      })
    ).then((results) => {
      if (cancelled) return;

      const progress: Record<string, number> = {};
      for (const [url, percent] of results) {
        // CLAUDE-ADDED: Only keep it if there's actual progress — a book that's never been opened
        // (or was opened but never advanced past the very start) shouldn't get a ring at all.
        // Matches the filtering PublicationGrid used to do internally.
        if (percent !== null && percent > 0) progress[url] = percent;
      }
      setProgressByUrl(progress);
    });

    return () => {
      cancelled = true;
    };
  }, [myLibraryBooks]);

  // CLAUDE-ADDED: Automatic shelves derived from the same fetched list -- recently read, last
  // series read, and recently added are convenience shortcuts, the alphabetical list is the full
  // library (books can appear in more than one shelf; nothing is excluded to keep it "the full
  // library").
  const recentlyRead = [...myLibraryBooks]
    .filter((book): book is DynamicBook & { lastReadAt: number } => typeof book.lastReadAt === "number")
    .filter((book) => progressByUrl[book.url] !== 100)
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .slice(0, 5);

  // CLAUDE-ADDED: Groups books by series name, then picks whichever series has the most recent
  // lastReadAt among its own books (not just the single most-recently-read book overall) -- so
  // reading a standalone book after volume 1 of a series doesn't bump the series shelf away in
  // favor of nothing. Shows every book in that series, in series order, whether started or not.
  const seriesGroups = new Map<string, DynamicBook[]>();
  for (const book of myLibraryBooks) {
    if (!book.series?.name) continue;
    const group = seriesGroups.get(book.series.name);
    if (group) {
      group.push(book);
    } else {
      seriesGroups.set(book.series.name, [book]);
    }
  }

  let lastSeriesName: string | null = null;
  let lastSeriesReadAt = -Infinity;
  for (const [name, books] of seriesGroups) {
    const mostRecent = Math.max(...books.map((book) => book.lastReadAt ?? -Infinity));
    if (mostRecent > lastSeriesReadAt) {
      lastSeriesReadAt = mostRecent;
      lastSeriesName = name;
    }
  }

  const lastSeriesRead = (lastSeriesName ? seriesGroups.get(lastSeriesName) ?? [] : [])
    .slice()
    .sort((a, b) => (a.series?.position ?? 0) - (b.series?.position ?? 0));

  const recentlyAdded = [...myLibraryBooks]
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .slice(0, 5);

  const alphabetical = [...myLibraryBooks]
    .sort((a, b) => a.title.localeCompare(b.title));

  const shelvesByKey: Record<ShelfKey, DynamicBook[]> = {
    continueReading: recentlyRead,
    lastSeriesRead,
    recentlyAdded,
    myLibrary: alphabetical
  };

  return (
    <main id="home">
      { /* Logo doubles as the trigger for the left-docked library menu (settings, etc.). */ }
      <StatefulLibraryMenu
        activeView={ activeView }
        onNavigate={ navigateTo }
        shelves={ shelves }
        onCreateShelf={ createShelf }
        onUpdateShelf={ updateShelf }
        onDeleteShelf={ deleteShelfAndNavigateHome }
        onReorderCustomShelves={ reorderCustomShelves }
        activeShelfId={ activeShelfId }
        onSelectShelf={ navigateToShelf }
        shelfPrefs={ shelfPrefs }
        onToggleShelf={ toggleShelf }
        shelfOrder={ shelfOrder }
        onReorderShelves={ reorderShelves }
        coverSize={ coverSize }
        onChangeCoverSize={ setCoverSize }
        onBookFolderSaved={ fetchMyLibrary }
      />

      { activeView === "library" && (
        <StatefulMyLibraryView
          books={ myLibraryBooks }
          coverSize={ coverSize }
          progressByUrl={ progressByUrl }
          onSelectBook={ (publication) => {
            setSelectedBook(publication);
            setIsBookSheetOpen(true);
          } }
          onContextMenu={ openContextMenu }
        />
      ) }

      { activeView === "series" && (
        <StatefulSeriesView
          books={ myLibraryBooks }
          coverSize={ coverSize }
          progressByUrl={ progressByUrl }
          onSelectBook={ (publication) => {
            setSelectedBook(publication);
            setIsBookSheetOpen(true);
          } }
          onContextMenu={ openContextMenu }
          initialSelectedSeries={ seriesToOpen }
        />
      ) }

      { activeView === "shelf" && (
        <StatefulShelfView
          shelf={ shelves.find((shelf) => shelf.id === activeShelfId) }
          books={ myLibraryBooks }
          coverSize={ coverSize }
          progressByUrl={ progressByUrl }
          onSelectBook={ (publication) => {
            setSelectedBook(publication);
            setIsBookSheetOpen(true);
          } }
          onContextMenu={ openContextMenu }
        />
      ) }

      { activeView === "home" && (
      <>
      <header className="header">
        <h1>Library Home Page</h1>

        <p className="subtitle">Vibe coding html to a proper web reader for media servers...</p>
      </header>

      {/* <h2>Our selection</h2>

      <PublicationGrid
        publications={ [...books, ...webPublications] }
        renderCover={ (publication) => (
          <Image
            src={ publication.cover }
            alt=""
            loading="lazy"
            width={ 240 }
            height={ 360 }
          />
        ) }
      /> */}

      { shelfOrder.map((key) => {
        const publications = shelvesByKey[key];
        if (!shelfPrefs[key] || publications.length === 0) return null;

        return (
          <Fragment key={ key }>
            <h2>{ SHELF_LABELS[key] }</h2>

            <PublicationGrid
              publications={ publications }
              renderCover={ renderBookCover }
              progressByUrl={ progressByUrl }
              columnWidth={ coverSize }
              onSelect={ (publication) => {
                setSelectedBook(publication);
                setIsBookSheetOpen(true);
              } }
              onContextMenu={ openContextMenu }
            />
          </Fragment>
        );
      }) }
      {/* <h2>EPUB3 Samples</h2>

      <PublicationGrid
        publications={ epub3samples }
        renderCover={ (publication) => (
          <Image
            src={ publication.cover }
            alt=""
            loading="lazy"
            width={ 240 }
            height={ 360 }
          />
        ) }
      /> */}

      {/* { isManifestEnabled && (
        <>
        <div className="dev-books">
          <p>In dev you can also use the <code>/manifest/</code> route to load any publication. For instance:</p>
          
          <PublicationGrid
            publications={ onlineBooks }
            renderCover={ (publication) => (
              <Image
                src={ publication.cover }
                alt=""
                loading="lazy"
                width={ 120 }
                height={ 180 }
              />
            ) }
          />
        </div>
        </>
      ) } */}
      </>
      ) }

      <StatefulBookSheet
        publication={ selectedBook }
        isOpen={ isBookSheetOpen }
        onOpenChange={ setIsBookSheetOpen }
      />

      { /* CLAUDE-ADDED: key forces a fresh mount per right-click so the popover repositions against
           the new cursor coordinates instead of trying to animate/reflow an already-open instance. */ }
      <StatefulBookContextMenu
        key={ contextMenuState ? `${ contextMenuState.publication.url }-${ contextMenuState.x }-${ contextMenuState.y }` : "closed" }
        state={ contextMenuState }
        shelves={ shelves }
        onAddToShelf={ (shelfId, bookUrl) => {
          addBookToShelf(shelfId, bookUrl);
          setContextMenuState(null);
        } }
        onRemoveFromShelf={ (shelfId, bookUrl) => {
          removeBookFromShelf(shelfId, bookUrl);
          setContextMenuState(null);
        } }
        onGoToSeries={ (publication) => {
          if (publication.series?.name) {
            navigateToSeries(publication.series.name);
          }
          setContextMenuState(null);
        } }
        onOpenChange={ (open) => {
          if (!open) setContextMenuState(null);
        } }
      />
    </main>
  );
}
