import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
};

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

function normalizeOptions(options: ConfirmOptions | string): ConfirmOptions {
  if (typeof options === 'string') return { message: options };
  return options;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const close = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      const opts = normalizeOptions(options);
      const next: Pending = {
        title: opts.title || (opts.danger ? 'Confirm delete' : 'Please confirm'),
        message: opts.message,
        confirmLabel: opts.confirmLabel || (opts.danger ? 'Delete' : 'OK'),
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: opts.danger ?? true,
        resolve,
      };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {pending && (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="confirm-title">
              {pending.title}
            </h2>
            <p id="confirm-message" className="confirm-message">
              {pending.message}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => close(false)}
              >
                {pending.cancelLabel}
              </button>
              <button
                type="button"
                className={pending.danger ? 'btn danger' : 'btn'}
                autoFocus
                onClick={() => close(true)}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
