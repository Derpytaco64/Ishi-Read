import { Publication } from "@/components/Misc/PublicationGrid";

// CLAUDE-ADDED: Shared between StatefulShelfView (per-shelf "added" date) and
// StatefulMyLibraryView (library-wide "added" date) -- same 6 sort modes either way, only what
// "addedAt" means differs per caller.
export type SortMode = "titleAsc" | "titleDesc" | "authorAsc" | "authorDesc" | "addedNewest" | "addedOldest";

export const DEFAULT_SORT_MODE: SortMode = "addedNewest";

export const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "addedNewest", label: "Date Added (Newest)" },
  { id: "addedOldest", label: "Date Added (Oldest)" },
  { id: "titleAsc", label: "Title (A–Z)" },
  { id: "titleDesc", label: "Title (Z–A)" },
  { id: "authorAsc", label: "Author (A–Z)" },
  { id: "authorDesc", label: "Author (Z–A)" }
];

export interface SortableEntry {
  publication: Publication;
  addedAt: number;
}

export function sortEntries<T extends SortableEntry>(entries: T[], sortMode: SortMode): T[] {
  const sorted = [...entries];

  switch (sortMode) {
    case "titleAsc":
      sorted.sort((a, b) => a.publication.title.localeCompare(b.publication.title));
      break;
    case "titleDesc":
      sorted.sort((a, b) => b.publication.title.localeCompare(a.publication.title));
      break;
    case "authorAsc":
      sorted.sort((a, b) => a.publication.author.localeCompare(b.publication.author));
      break;
    case "authorDesc":
      sorted.sort((a, b) => b.publication.author.localeCompare(a.publication.author));
      break;
    case "addedNewest":
      sorted.sort((a, b) => b.addedAt - a.addedAt);
      break;
    case "addedOldest":
      sorted.sort((a, b) => a.addedAt - b.addedAt);
      break;
  }

  return sorted;
}
