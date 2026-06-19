import { useEffect, useRef } from "react";

// Focus management for modal dialogs: on open, move focus to the first control
// inside the container; trap Tab/Shift+Tab within it; and on close, restore
// focus to whatever was focused before (usually the trigger button).
// Attach the returned ref to the dialog element.
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const SEL =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(SEL)).filter(
        (el) => el.offsetParent !== null,
      );

    focusables()[0]?.focus();

    // Listen at the document level (not on the dialog node) so Tab is still
    // intercepted if focus ever escapes the dialog — otherwise the keydown
    // never reaches a node-scoped listener and focus leaks to the page behind.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault(); // nothing focusable inside — don't let Tab escape
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? els.indexOf(active) : -1;
      // Focus is outside the dialog (escaped, or never entered): pull it back in.
      if (idx === -1) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
