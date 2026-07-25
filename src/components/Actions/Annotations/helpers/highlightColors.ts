// CLAUDE-ADDED: The 5 preset highlight colors -- fixed for v1 (not user-configurable), matching how
// most reader apps (Kindle, Apple Books) offer a small fixed palette rather than a color picker.
export interface HighlightColor {
  id: string;
  hex: string;
  labelKey: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: "yellow", hex: "#FFE066", labelKey: "reader.annotations.colors.yellow" },
  { id: "green", hex: "#A0E6A0", labelKey: "reader.annotations.colors.green" },
  { id: "blue", hex: "#9CC9FF", labelKey: "reader.annotations.colors.blue" },
  { id: "pink", hex: "#FFB3D1", labelKey: "reader.annotations.colors.pink" },
  { id: "purple", hex: "#D3B3FF", labelKey: "reader.annotations.colors.purple" }
];

export const DEFAULT_HIGHLIGHT_COLOR_ID = HIGHLIGHT_COLORS[0].id;

export function getHighlightColorHex(colorId: string): string {
  return HIGHLIGHT_COLORS.find(color => color.id === colorId)?.hex ?? HIGHLIGHT_COLORS[0].hex;
}

// CLAUDE-ADDED: Notes get a fixed, distinct tint (not one of the 5 highlight colors) so a note is
// visually distinguishable from a highlight even before you tap it to read the text.
export const NOTE_DECORATION_HEX = "#B0B0B0";
