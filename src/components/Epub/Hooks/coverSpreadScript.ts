// CLAUDE-ADDED: Injected only into the very first reading-order resource (the cover) via an exact-href injectable rule (see useInjectablesConfig.ts). Forces the cover's content to start in the SECOND column using the standard CSS multicol "break-after:column" spacer trick, so it sits in the right-hand column of a two-column spread -- mimicking a physical book's front cover opening on the right -- instead of the left column where content normally starts. Gated on actually being in two-column mode right now (checked from inside the frame, mirroring useShortImageSpread's isEffectivelyTwoColumn): a forced column break is NOT a no-op with column-count:1 -- each "column" is a full page in paginated single-column mode, so unconditionally forcing one would push the entire cover onto the next page, leaving page 1 blank. Wrapped in a double requestAnimationFrame so it reads column-count only after readium-css has finished applying the current column preference to this frame (that can happen slightly after initial script execution), not before.
export const getCoverSpreadScript = () => `(function () {
  function apply() {
    var columnCount = getComputedStyle(document.documentElement).columnCount;
    if (columnCount !== "2") return;

    var spacer = document.createElement("div");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText = "break-after:column;-webkit-column-break-after:always;height:1px;";
    document.body.prepend(spacer);
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(apply);
  });
})();`;
