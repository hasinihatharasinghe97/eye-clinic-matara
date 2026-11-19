import { useEffect, useId, useRef, type ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  /** Buttons along the bottom. */
  actions?: ReactNode;
  /** Called on Escape or a click on the dim background. Omit to make the dialog blocking. */
  onClose?: () => void;
  /** `alertdialog` for questions/warnings that need an answer. */
  role?: 'dialog' | 'alertdialog';
  /** Extra attributes for the overlay (e.g. data-* markers). */
  overlayProps?: Record<string, string | boolean | undefined>;
};

/**
 * Centered dialog over a dimmed page. Moves focus into the dialog when it opens and
 * back to where it was when it closes.
 */
export function Modal({
  open,
  title,
  children,
  actions,
  onClose,
  role = 'dialog',
  overlayProps,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Respect a control that already took focus via autoFocus; otherwise focus the first one.
    if (dialog && !dialog.contains(document.activeElement)) {
      const focusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea'
      );
      (focusable ?? dialog).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      {...overlayProps}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId} className="confirm-title">
          {title}
        </h3>
        <div className="confirm-message">{children}</div>
        {actions && <div className="confirm-actions">{actions}</div>}
      </div>
    </div>
  );
}
