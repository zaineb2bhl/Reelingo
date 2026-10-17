import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Prevent closing via backdrop / Escape (e.g. while rendering). */
  locked?: boolean;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, locked, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !locked) onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, locked]);

  if (!open) return null;
  // Portal to <body> so ancestors with transforms / backdrop filters can't trap `position: fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => !locked && onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:max-w-lg sm:rounded-3xl sm:p-7"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          {!locked && (
            <button type="button" onClick={onClose} aria-label="Close" className="-m-1 grid h-8 w-8 place-items-center rounded-lg text-ink/50 hover:bg-ink/5 hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
