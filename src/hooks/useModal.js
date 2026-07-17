import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

// Shared behavior for modal dialog surfaces: Escape-to-close, focus trapping
// (Tab/Shift+Tab wrap and stay inside), moving focus into the dialog on open
// (unless something inside already autofocused), and restoring focus to the
// element that opened it on close. Attach the returned ref to the dialog
// container element, which should also carry role="dialog"/aria-modal="true".
export function useModal(onClose) {
  const ref = useRef(null);
  // Keep the latest onClose without re-running the effect (and thus re-stealing
  // focus) on every render, since callers pass an inline arrow each time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;

    if (!dialog.contains(document.activeElement)) {
      const [first] = focusableWithin(dialog);
      if (first) {
        first.focus();
      } else {
        dialog.setAttribute("tabindex", "-1");
        dialog.focus();
      }
    }

    function handleKeyDown(event) {
      // Yield entirely to a nested dialog (e.g. a confirmation) that currently
      // owns focus, so its Escape/Tab win and we don't close the parent too.
      const owningDialog = document.activeElement?.closest?.('[role="dialog"], [role="alertdialog"]');
      if (owningDialog && owningDialog !== dialog) return;
      // Let a nested handler (e.g. dnd-kit cancelling a keyboard drag) win first.
      if (event.defaultPrevented) return;

      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableWithin(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return ref;
}
