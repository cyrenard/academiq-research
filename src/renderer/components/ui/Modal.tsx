import { useEffect, useId, useRef, type ReactNode } from 'react';

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

export function Modal({ title, open, onClose, children, wide }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Lifecycle: when the modal opens we (1) remember which element had
  // focus, (2) move focus into the dialog so screen readers and
  // keyboard users land in the right context, (3) install Escape +
  // Tab-trap handlers. On close we restore focus to where it was.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      // Prefer a meaningful focus target inside the modal; fall back to
      // the dialog itself (it has tabindex=-1) so focus is at least
      // somewhere useful.
      (firstFocusable || dialog).focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const target = previouslyFocusedRef.current;
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={['max-h-[86vh] overflow-hidden rounded-[14px] border border-aq-line/90 bg-[#fbfaf7]/95 shadow-[0_28px_90px_rgba(31,42,68,0.24)] backdrop-blur-xl outline-none', wide ? 'w-[min(1040px,96vw)]' : 'w-[min(560px,94vw)]'].join(' ')}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between bg-white/90 px-4 shadow-[0_1px_0_rgba(222,216,205,0.72),0_10px_24px_rgba(22,27,34,0.05)]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-aq-muted">AcademiQ</div>
            <h2 id={titleId} className="text-sm font-semibold leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted shadow-sm hover:bg-aq-panel hover:text-aq-ink">Kapat</button>
        </div>
        <div className="max-h-[calc(86vh-44px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
