"use client";

import { useMemo } from "react";

import { ILinkInjectable, IBlobInjectable, IScriptInjectable, IInjectableRule } from "@readium/navigator";
import { InjectableFontResources } from "@/preferences/services/fonts";
import { getLandscapeSpreadScript } from "./landscapeSpreadScript";
import { getCoverSpreadScript } from "./coverSpreadScript";
import { getNoteHoverScript } from "./noteHoverScript";

// CLAUDE-ADDED: iOS Safari's long-press text-selection callout (Copy/Look Up/Share) isn't driven by
// a contextmenu event, so defaultContentProtectionConfig's disableContextMenu (the vendor navigator's
// Peripherals.addContextMenuPrevention) doesn't suppress it -- only -webkit-touch-callout does. Without
// this, that native callout visually competes with the app's own SelectionPopover for creating
// highlights/notes on mobile. Selection itself (and therefore SelectionPopover, which reads it on
// pointerup) is untouched -- only the OS-level callout UI is suppressed.
const noteSelectionStyle: ILinkInjectable & IBlobInjectable = {
  as: "link",
  rel: "stylesheet",
  target: "head",
  blob: new Blob(["* { -webkit-touch-callout: none; }"], { type: "text/css" })
};

interface UseEpubInjectablesConfigProps {
  isFXL: boolean;
  isFontFamilyUsed: boolean;
  fontLanguage: string;
  getFontInjectables: (options?: { language?: string } | { key?: string }, optimize?: boolean) => InjectableFontResources | null;
  getAndroidFXLPatch: () => (ILinkInjectable & IBlobInjectable) | null;
  // CLAUDE-ADDED: href of the very first reading-order resource, used to target the cover-alone-on-right injectable at exactly that one resource (an exact-string entry in an IInjectableRule's `resources` array matches only that href, unlike the /\.xhtml$/ regex used elsewhere).
  firstResourceHref?: string;
}

export const useEpubInjectablesConfig = ({
  isFXL,
  isFontFamilyUsed,
  fontLanguage,
  getFontInjectables,
  getAndroidFXLPatch,
  firstResourceHref,
}: UseEpubInjectablesConfigProps) => {
  // CLAUDE-ADDED: Restructured from independent if-blocks that each reassigned the whole config to an early-return (FXL) plus a single merged reflowable branch — needed once the reflowable branch had two independent injectables (fonts + landscape spread) that must coexist in one rule instead of one clobbering the other.
  const injectables = useMemo(() => {
    if (isFXL) {
      const androidPatch = getAndroidFXLPatch();
      if (!androidPatch) return undefined;

      // CLAUDE-ADDED: Fixed-layout resources can still carry real, selectable text (text-over-image
      // picture books, fixed-layout novels), so notes/hover-preview aren't reflowable-only features --
      // this early return used to skip the noteHover injectable entirely for any FXL book.
      const noteHover: IScriptInjectable & IBlobInjectable = {
        as: "script",
        target: "body",
        blob: new Blob([getNoteHoverScript()], { type: "text/javascript" })
      };

      return {
        allowedDomains: [window.location.origin],
        rules: [{
          resources: [/\.xhtml$/, /\.html$/],
          prepend: [androidPatch],
          append: [noteHover, noteSelectionStyle]
        }]
      };
    }

    const fontResources = isFontFamilyUsed ? getFontInjectables({ language: fontLanguage }) : null;

    // CLAUDE-ADDED: Marks landscape images (covers, two-page illustrations) so readium-css's two-column layout can let them span the full spread instead of being squeezed into one column. Always injected for reflowable content, independent of font settings.
    const landscapeSpread: IScriptInjectable & IBlobInjectable = {
      as: "script",
      target: "body",
      blob: new Blob([getLandscapeSpreadScript()], { type: "text/javascript" })
    };

    // CLAUDE-ADDED: Shows a hover preview of a note's text while the cursor is over its decorated
    // quote -- reads its data from localStorage rather than having it baked in here, since this
    // injectables config is only ever read once at book-open (see useReaderInit.ts) and would
    // otherwise never see notes created/edited/deleted afterwards. See noteHoverScript.ts.
    const noteHover: IScriptInjectable & IBlobInjectable = {
      as: "script",
      target: "body",
      blob: new Blob([getNoteHoverScript()], { type: "text/javascript" })
    };

    const rules: IInjectableRule[] = [{
      resources: [/\.xhtml$/, /\.html$/],
      prepend: fontResources?.prepend,
      append: [...(fontResources?.append || []), landscapeSpread, noteHover, noteSelectionStyle]
    }];

    // CLAUDE-ADDED: Separate rule (rather than folding into the one above) since it targets an exact href instead of the blanket regex — only the cover resource should get the right-column spacer.
    if (firstResourceHref) {
      const coverSpread: IScriptInjectable & IBlobInjectable = {
        as: "script",
        target: "body",
        blob: new Blob([getCoverSpreadScript()], { type: "text/javascript" })
      };

      rules.push({
        resources: [firstResourceHref],
        prepend: [coverSpread]
      });
    }

    return {
      allowedDomains: fontResources?.allowedDomains || [],
      rules
    };
  }, [isFXL, isFontFamilyUsed, fontLanguage, getFontInjectables, getAndroidFXLPatch, firstResourceHref]);

  return { injectables };
};
