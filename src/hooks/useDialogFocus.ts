import { useEffect, useRef, type RefObject } from 'react';

/** Contain keyboard focus while an overlay is open, and return it to its trigger. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0);
    (dialog.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const items = focusable();
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
    // Callers use inline close handlers; reinstalling would steal focus on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
