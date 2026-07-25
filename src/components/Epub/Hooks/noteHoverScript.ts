// CLAUDE-ADDED: postMessage type for the note-hover-preview channel between the app (posts the current
// notes' quote/preview text directly to each reading iframe's window -- see StatefulReader.tsx's
// frameLoaded listener and its notes-changed effect) and this injected script (listens for it). A plain
// injectable can't carry this data: the EpubNavigator is only ever loaded once per book-open (see
// useReaderInit.ts), so injectable scripts and whatever's baked into them at construction time are frozen
// for the whole session -- unusable for something that changes as often as notes do. localStorage was
// tried first, but proved unsafe: some publisher-prepared EPUBs (Kobo-formatted ones in particular) embed
// their own <script src=".../kobo.js"> in the resource, which replaces window.localStorage with a fake
// stub object (reads always return undefined, writes silently no-op) for its own reading-position
// tracking purposes -- confirmed by comparing `[object Storage]` vs `[object Object]` across books.
// postMessage isn't something book content has any reason to touch, so it doesn't share that risk.
export const NOTE_HOVER_MESSAGE_TYPE = "__th_note_hover_data__";

export interface NoteHoverEntry {
  id: string;
  quote: string;
  preview: string;
  timestamp: string;
}

// CLAUDE-ADDED: Injected into every reflowable resource. Finds each note's quoted text via a plain
// substring search over the resource's full concatenated text (not a full locator/CFI resolution) --
// notes whose quote isn't present in this resource (i.e. every resource except the one the note is
// actually on) simply produce no match, so this doesn't need to know its own resource href to filter by.
// Searches the FULL concatenated text rather than one text node at a time: a quote selected across an
// inline formatting boundary (a sentence that starts in plain text and continues into an <em>/<i> run,
// common in this kind of prose) spans two or more separate text nodes, and no single node's own
// textContent would ever contain it -- a per-node indexOf search silently finds nothing for exactly the
// selections real users are likely to make. Hit-testing against the resulting Range (not a rendered DOM
// element) is required because decorations render via the CSS Custom Highlight API in browsers that
// support it (see @readium/navigator's DecorationGroup), which paints text without creating any
// hit-testable element at all.
export const getNoteHoverScript = () => `(function () {
  var MESSAGE_TYPE = "${ NOTE_HOVER_MESSAGE_TYPE }";

  var ranges = [];
  var tooltip = null;
  var activeId = null;

  // Resolves an offset into the full concatenated text (built the same way below) to a {node, offset}
  // boundary point, given the same node list + cumulative-length table.
  function resolvePoint(nodes, starts, fullOffset) {
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (fullOffset >= starts[i]) {
        return { node: nodes[i], offset: fullOffset - starts[i] };
      }
    }
    return { node: nodes[0], offset: 0 };
  }

  function buildRanges(entries) {
    ranges = [];
    if (!entries || !entries.length) return;

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var nodes = [];
    var starts = [];
    var fullText = "";
    var node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
      starts.push(fullText.length);
      fullText += node.textContent;
    }
    if (!nodes.length) return;

    entries.forEach(function (entry) {
      if (!entry.quote) return;
      var idx = fullText.indexOf(entry.quote);
      if (idx < 0) return;
      var startPoint = resolvePoint(nodes, starts, idx);
      var endPoint = resolvePoint(nodes, starts, idx + entry.quote.length);
      try {
        var range = document.createRange();
        range.setStart(startPoint.node, startPoint.offset);
        range.setEnd(endPoint.node, endPoint.offset);
        ranges.push({ id: entry.id, preview: entry.preview, timestamp: entry.timestamp, range: range });
      } catch (err) {
        // Malformed boundary (shouldn't normally happen) -- skip this note rather than throw.
      }
    });
  }

  var tooltipTimestampEl = null;
  var tooltipPreviewEl = null;

  // CLAUDE-ADDED: readium-css ships a theming rule, roughly: root-with-a-theme-style selector matching
  // every element, forcing background: transparent !important (plus a matching one forcing text color)
  // -- so every element in the resource shows the reading theme's own background/text color uniformly,
  // instead of whatever an EPUB's own stylesheet set. It applies to this tooltip too since it's just
  // another element in the same document, and its !important beats a plain inline style. Inline
  // !important (set here) is the one thing that outranks it in the cascade, so every color-related
  // property needs its own !important, not just a plain assignment.
  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.setAttribute("data-readium", "true");
    tooltip.style.cssText = "position:fixed !important;pointer-events:none !important;z-index:99999 !important;display:none;"
      + "box-sizing:border-box !important;max-width:240px !important;padding:6px 10px !important;border-radius:6px !important;"
      + "font-size:13px !important;line-height:1.3 !important;font-family:sans-serif !important;"
      + "border-style:solid !important;border-width:1px !important;"
      + "box-shadow:0 2px 8px rgba(0,0,0,0.3) !important;overflow-wrap:break-word !important;";

    tooltipTimestampEl = document.createElement("div");
    tooltipTimestampEl.style.cssText = "font-size:11px !important;opacity:0.7 !important;margin-bottom:2px !important;white-space:nowrap !important;";
    tooltip.appendChild(tooltipTimestampEl);

    tooltipPreviewEl = document.createElement("div");
    tooltipPreviewEl.style.cssText = "white-space:pre-wrap !important;";
    tooltip.appendChild(tooltipPreviewEl);

    document.body.appendChild(tooltip);
    return tooltip;
  }

  // CLAUDE-ADDED: Matches the tooltip's colors to the current reading theme instead of a fixed dark
  // scheme, so it reads as part of the book rather than an unrelated overlay. Same technique
  // useShortImageSpread.ts uses for its own paired-image overlay: read the live computed background off
  // documentElement first (readium-css applies the theme there via inline style, unaffected by its own
  // "force every descendant transparent" reset rule, which only targets descendants of :root, not :root
  // itself), falling back to body, then to a plain default if neither reports an opaque color.
  function isOpaqueColor(color) {
    var m = color && color.match(/rgba?\([^)]+,\s*([\d.]+)\)/);
    if (m) return parseFloat(m[1]) > 0;
    return !!color && color !== "transparent";
  }

  function getThemeColors() {
    try {
      var rootStyle = getComputedStyle(document.documentElement);
      var bodyStyle = getComputedStyle(document.body);
      var bg = isOpaqueColor(rootStyle.backgroundColor) ? rootStyle.backgroundColor
        : isOpaqueColor(bodyStyle.backgroundColor) ? bodyStyle.backgroundColor
        : "#fff";
      var color = rootStyle.color || bodyStyle.color || "#000";
      return { bg: bg, color: color };
    } catch (err) {
      return { bg: "#fff", color: "#000" };
    }
  }

  // CLAUDE-ADDED: The reader's font-size preference is implemented as CSS zoom on the resource's own
  // <body> (confirmed empirically -- getComputedStyle(document.body).zoom reflects the fontSize setting
  // directly), not just a font-size/rem change. Since the tooltip is appended inside that same zoomed
  // subtree, any "px" value assigned to its position:fixed left/top gets re-multiplied by the ancestor's
  // zoom factor by the renderer -- e.g. at zoom 1.4, setting left to the cursor's true clientX visually
  // lands 40% further right/down than the cursor actually is. event.clientX/clientY themselves are NOT
  // zoom-scaled (they always report true viewport coordinates), so dividing by the cumulative zoom before
  // assigning is what makes the two coordinate spaces agree. Walks the ancestor chain (not just body)
  // since zoom can compound if it's ever applied at more than one level.
  function cumulativeZoom(el) {
    var z = 1;
    var cur = el;
    while (cur) {
      var cz = parseFloat(getComputedStyle(cur).zoom);
      if (cz && !isNaN(cz)) z *= cz;
      cur = cur.parentElement;
    }
    return z || 1;
  }

  function showTooltip(hit, x, y) {
    var el = ensureTooltip();
    var theme = getThemeColors();
    el.style.setProperty("background", theme.bg, "important");
    el.style.setProperty("color", theme.color, "important");
    el.style.setProperty("border-color", theme.color, "important");
    tooltipTimestampEl.textContent = hit.timestamp || "";
    tooltipTimestampEl.style.display = hit.timestamp ? "block" : "none";
    tooltipPreviewEl.textContent = hit.preview;
    el.style.display = "block";
    var zoom = cumulativeZoom(document.body);

    // First pass: position at the raw target so getBoundingClientRect (which always reports true,
    // already-visual viewport coordinates -- unlike offsetWidth/offsetHeight, whose relationship to zoom
    // is murkier) can report the tooltip's actual on-screen size for clamping.
    el.style.left = ((x + 14) / zoom) + "px";
    el.style.top = ((y + 14) / zoom) + "px";
    var rect = el.getBoundingClientRect();

    var maxLeft = window.innerWidth - rect.width - 8;
    var maxTop = window.innerHeight - rect.height - 8;
    var clampedLeft = Math.max(8, Math.min(x + 14, maxLeft));
    var clampedTop = Math.max(8, Math.min(y + 14, maxTop));
    el.style.left = (clampedLeft / zoom) + "px";
    el.style.top = (clampedTop / zoom) + "px";
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = "none";
    activeId = null;
  }

  function hitTest(x, y) {
    if (!ranges.length) return null;
    var node = null;
    var offset = 0;
    if (document.caretRangeFromPoint) {
      var caretRange = document.caretRangeFromPoint(x, y);
      if (!caretRange) return null;
      node = caretRange.startContainer;
      offset = caretRange.startOffset;
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      node = pos.offsetNode;
      offset = pos.offset;
    } else {
      return null;
    }
    for (var i = 0; i < ranges.length; i++) {
      try {
        if (ranges[i].range.comparePoint(node, offset) === 0) return ranges[i];
      } catch (err) {
        // comparePoint throws if the point isn't in the same tree as the range -- not a match.
      }
    }
    return null;
  }

  document.addEventListener("pointermove", function (event) {
    var hit = hitTest(event.clientX, event.clientY);
    if (hit) {
      activeId = hit.id;
      showTooltip(hit, event.clientX, event.clientY);
    } else if (activeId) {
      hideTooltip();
    }
  }, true);

  document.addEventListener("pointerleave", hideTooltip, true);

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (data && data.type === MESSAGE_TYPE) buildRanges(data.notes);
  });
})();`;
