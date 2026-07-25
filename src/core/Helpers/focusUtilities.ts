"use client";

export const isActiveElement = (el: Element | undefined | null) => {
  if (el) return document.activeElement === el;
  return false;
}

export const isKeyboardTriggered = (el: Element | undefined | null) => {
  if (el) return el.matches(":focus-visible");
  return false;
}

// CLAUDE-ADDED: After go()-ing to a locator from a sheet (Annotations list, return-to-position), the
// sheet's own overlay returns focus to whatever trigger button opened it -- correct a11y default, but it
// leaves keyboard page-turns (ArrowRight/Left) going nowhere since the reading iframe no longer has focus.
// Deferred via setTimeout so it runs after that focus-restoration effect rather than racing it.
export const focusReadingContainer = () => {
  window.setTimeout(() => {
    const iframe = document.getElementById("thorium-web-container")?.querySelector("iframe");
    (iframe as HTMLElement | null)?.focus();
  }, 0);
}

export const isInteractiveElement = (element: Element | null) => {
  const iElements = ["A", "AREA", "BUTTON", "DETAILS", "INPUT", "SELECT", "TEXTAREA"];
  const iRoles = ["dialog", "radiogroup", "radio", "menu", "menuitem"]

  if (element && (element instanceof HTMLElement || element instanceof SVGElement)) {
    if (element.closest("[inert]")) return false;
    if (element.hasAttribute("disabled")) return false;
    if (element.role && iRoles.includes(element.role)) return true;

    // Panel Resize Handler cos’ of typo on tabIndex/tabindex
    if (element.hasAttribute("tabindex")) {
      const attr = element.getAttribute("tabindex");
      return attr && parseInt(attr, 10) >= 0;
    }

    if (element.tabIndex) return element.tabIndex >= 0;
    if (iElements.includes(element.tagName)) return true;
  }

  return false;
}
