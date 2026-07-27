import { ShelfIcon } from "@/app/customShelves";

// CLAUDE-ADDED: Curated rather than a free-text/emoji-picker input -- keeps StatefulShelfFormModal's
// icon field a simple grid and guarantees every stored icon renders consistently across platforms
// instead of relying on whatever emoji keyboard the OS offers.
export const SHELF_ICON_CHOICES: { icon: ShelfIcon; label: string }[] = [
  { icon: "📚", label: "Books" },
  { icon: "⭐", label: "Star" },
  { icon: "❤️", label: "Heart" },
  { icon: "🔖", label: "Bookmark" },
  { icon: "🚩", label: "Flag" },
  { icon: "📁", label: "Folder" },
  { icon: "🏷️", label: "Tag" },
  { icon: "✨", label: "Sparkle" },
  { icon: "🎯", label: "Target" },
  { icon: "📌", label: "Pin" },
  { icon: "🎨", label: "Art" },
  { icon: "🔥", label: "Fire" }
];

export const DEFAULT_SHELF_ICON: ShelfIcon = "📚";
