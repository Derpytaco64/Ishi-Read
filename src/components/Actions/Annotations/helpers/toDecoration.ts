import { Locator } from "@readium/shared";
import { Decoration } from "@readium/navigator";

import { StoredHighlight, StoredNote } from "@/lib/userData/annotationTypes";
import { getHighlightColorHex, NOTE_DECORATION_HEX } from "./highlightColors";

// CLAUDE-ADDED: Highlights render as a filled box in their chosen color; notes render as an underline
// in a fixed neutral tint so they read as distinct from highlights even without opening them.
// `isActive: true` is undocumented in @readium/navigator's published types (it's absent from the
// Style/BuiltinDecorationStyle type declarations) but is read by the navigator's own bundled decoration
// activation logic to decide which decorations respond to tap/click -- without it, onDecorationActivated
// never fires for these, even though the group itself is marked activatable via registerDecorationObserver.
export function highlightToDecoration(highlight: StoredHighlight): Decoration | null {
  const locator = Locator.deserialize(highlight.locator);
  if (!locator) return null;

  return {
    id: highlight.id,
    locator,
    style: {
      tint: getHighlightColorHex(highlight.color),
      layout: "boxes",
      width: "wrap",
      isActive: true
    } as Decoration["style"]
  };
}

export function noteToDecoration(note: StoredNote): Decoration | null {
  const locator = Locator.deserialize(note.locator);
  if (!locator) return null;

  return {
    id: note.id,
    locator,
    style: {
      tint: NOTE_DECORATION_HEX,
      layout: "boxes",
      width: "wrap",
      isActive: true
    } as Decoration["style"]
  };
}
