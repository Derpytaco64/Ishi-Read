"use client";

import { useEffect } from "react";

interface UseMarginSyncProps {
  // CLAUDE-ADDED: Loosely typed to match whatever useEpubNavigator's getCframes returns (see useShortImageSpread.ts for the same pattern) without importing its private/unstable frame-manager types.
  getCframes: () => (({ window: Window }) | undefined)[] | undefined;
  marginHorizontal: number;
}

// CLAUDE-ADDED: Applied as an inline !important style directly on each frame's <body>, rather than
// through readium's own pageGutter/scrollPadding* preferences or an injected stylesheet. Two
// independent reasons converged on this:
//  1. readium-css's own base stylesheet (ReadiumCSS-after-*.js) is deliberately injected last so
//     it can enforce a `padding:0 var(--RS__pageGutter) !important` shorthand on body -- any
//     competing injected <style> rule, even with matching selector + !important, loses that
//     cascade race because it loads earlier. An inline !important style has the highest possible
//     specificity and always wins regardless of source order.
//  2. Submitting the user's margin as the live `pageGutter` preference turned out to double as an
//     input to readium's own internal auto column-count decision: shrinking pageGutter left more
//     perceived width, which silently flipped "Auto" columns from 1 to 2. It also didn't even
//     visually shrink the text column in a *fixed* column count -- readium grows the column box to
//     compensate for pageGutter instead of shrinking the rendered text, so the preference-based
//     approach was a no-op for its own stated purpose in paginated mode. Applying padding directly
//     and leaving pageGutter/scrollPadding* pinned at their static app defaults (see
//     usePreferencesConfig.ts) decouples margin from column layout entirely while still visually
//     padding the page.
export const applyMargin = (win: Window, marginHorizontal: number) => {
  try {
    const body = win.document.body;
    body.style.setProperty("padding-left", `${ marginHorizontal }px`, "important");
    body.style.setProperty("padding-right", `${ marginHorizontal }px`, "important");
    body.style.setProperty("box-sizing", "border-box", "important");
  } catch {
    // Best-effort -- frame may not be ready yet.
  }
};

// CLAUDE-ADDED: StatefulReader's frameLoaded listener applies the current value to each
// newly-loaded frame via applyMargin above. This hook covers the other half: when the user changes
// the value while a frame is already on screen, frameLoaded won't fire again for it, so re-apply
// directly to every currently-loaded frame.
export const useMarginSync = ({ getCframes, marginHorizontal }: UseMarginSyncProps) => {
  useEffect(() => {
    const cframes = getCframes();
    if (!cframes) return;

    cframes.forEach((frame) => {
      // CLAUDE-ADDED: `.window` is a live getter over the frame's iframe element, not a plain
      // property -- if the navigator is mid-teardown (e.g. during a forced reader reload, see
      // StatefulColumns.tsx's readerReloadKey), the iframe can already be detached from the DOM
      // while its wrapper object still sits in the frame-pool array, and reading `.window` on it
      // throws instead of just returning undefined, so optional chaining alone doesn't guard it.
      try {
        if (frame?.window) applyMargin(frame.window, marginHorizontal);
      } catch {
        // Best-effort -- frame is being torn down.
      }
    });
  }, [getCframes, marginHorizontal]);
};
