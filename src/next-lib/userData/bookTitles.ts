import path from "path";

import { getUserDataDir } from "./publicationsConfig";
import { readJsonFile, writeJsonFileAtomic } from "./jsonStore";

export interface BookTitleEntry {
  title: string;
  manifestUrl: string;
  updatedAt: number;
}

type BookTitleRegistry = Record<string, BookTitleEntry>;

function getBookTitlesFilePath(): string {
  return path.join(getUserDataDir(), "bookTitles.json");
}

function loadRegistry(): BookTitleRegistry {
  return readJsonFile<BookTitleRegistry>(getBookTitlesFilePath()) ?? {};
}

// CLAUDE-ADDED: Looked up by the admin orphaned-data report to label an otherwise-opaque bookHash
// with the title/manifest it belonged to -- the hash alone survives a book's deletion (it's just the
// filename every positions/highlights/etc file is keyed by), but the title never did until now.
export function getBookTitles(hashes: Iterable<string>): Map<string, BookTitleEntry> {
  const registry = loadRegistry();
  const result = new Map<string, BookTitleEntry>();

  for (const hash of hashes) {
    const entry = registry[hash];
    if (entry) result.set(hash, entry);
  }

  return result;
}

// CLAUDE-ADDED: Called once per /api/books request with every book currently in the library (see
// route.ts), so a book's title/manifest survive here even after the book itself is later deleted or
// moved. Batched into a single read-modify-write per request -- rather than one per book -- so
// resolving many books concurrently can't race writes against each other, and skips the write
// entirely when nothing actually changed (the common case on repeat page loads).
export function recordBookTitles(entries: { hash: string; title: string; manifestUrl: string }[]): void {
  const registry = loadRegistry();
  let changed = false;

  for (const { hash, title, manifestUrl } of entries) {
    const existing = registry[hash];
    if (existing && existing.title === title && existing.manifestUrl === manifestUrl) continue;
    registry[hash] = { title, manifestUrl, updatedAt: Date.now() };
    changed = true;
  }

  if (changed) writeJsonFileAtomic(getBookTitlesFilePath(), registry);
}

// CLAUDE-ADDED: Called by deleteOrphanedData once every orphaned file for these hashes is gone, so
// the registry doesn't grow forever with title entries for books nothing references anymore.
export function removeBookTitles(hashes: Iterable<string>): void {
  const registry = loadRegistry();
  let changed = false;

  for (const hash of hashes) {
    if (hash in registry) {
      delete registry[hash];
      changed = true;
    }
  }

  if (changed) writeJsonFileAtomic(getBookTitlesFilePath(), registry);
}
