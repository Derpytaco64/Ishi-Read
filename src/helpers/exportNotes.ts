import { Locator } from "@readium/shared";

import { StoredNote } from "@/lib/userData/annotationTypes";
import { formatTimestamp } from "@/components/Actions/Annotations/helpers/formatTimestamp";

// CLAUDE-ADDED: Powers the library's book-cover context menu "Export Notes" action -- builds a single
// markdown document from a book's notes, oldest first (their actual writing order), each with its
// timestamp and the passage it was attached to (if any). note.text is itself markdown (see
// NoteOverlay.tsx) so it's embedded as-is rather than escaped.
export function buildNotesMarkdown(title: string, author: string, notes: StoredNote[]): string {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);

  const header = `# ${ title }\n${ author ? `*by ${ author }*\n` : "" }`;

  if (sorted.length === 0) {
    return `${ header }\n_No notes yet._\n`;
  }

  const sections = sorted.map((note, index) => {
    const locator = Locator.deserialize(note.locator);
    const quote = locator?.text?.highlight;

    const parts = [
      `## Note ${ index + 1 } — ${ formatTimestamp(note.createdAt) }`,
      ...(note.chapterTitle ? [`*${ note.chapterTitle }*`] : []),
      ...(quote ? [`> ${ quote }`] : []),
      note.text
    ];

    return parts.join("\n\n");
  });

  return `${ header }\n${ sections.join("\n\n---\n\n") }\n`;
}

// CLAUDE-ADDED: Keeps the export filename filesystem-safe across OSes without mangling the title
// past recognition.
export function notesExportFilename(title: string): string {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${ safeTitle || "Untitled" } - Notes.md`;
}

// CLAUDE-ADDED: Standard Blob + temporary-anchor recipe for a client-side "save as" download.
// Doesn't prompt for a location -- the browser just drops it in the configured downloads folder
// (unless the user has their own browser-level "always ask where to save" setting on) -- kept as the
// fallback saveTextFile below uses when the File System Access API isn't available.
export function downloadTextFile(filename: string, content: string, mimeType = "text/markdown;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

// CLAUDE-ADDED: The File System Access API isn't in TypeScript's bundled DOM lib (no
// @types/wicg-file-system-access dependency here) -- just enough of its shape to call
// showSaveFilePicker safely, augmented onto Window rather than reached through `as any`.
interface FileSystemWritableFileStream {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

// CLAUDE-ADDED: Export Notes should ask where to save every time, not silently land in the
// downloads folder -- showSaveFilePicker() is the only web-platform way to force that "Save As"
// dialog regardless of the browser's own download settings. Falls back to the old anchor-download
// (no prompt) on browsers that don't support it yet (Firefox, Safari) -- there's no way to force a
// prompt there short of not having a download at all.
export async function saveTextFile(filename: string, content: string, mimeType = "text/markdown;charset=utf-8"): Promise<void> {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const extension = filename.slice(filename.lastIndexOf(".")) || ".md";
      const baseMimeType = mimeType.split(";")[0]!;

      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Markdown", accept: { [baseMimeType]: [extension] } }]
      });

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (err) {
      // CLAUDE-ADDED: AbortError means the user closed the picker without choosing anywhere --
      // that's "changed their mind", not a failure, so it shouldn't fall through to a silent
      // download they never asked for.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to save file via picker, falling back to a direct download:", err);
    }
  }

  downloadTextFile(filename, content, mimeType);
}
