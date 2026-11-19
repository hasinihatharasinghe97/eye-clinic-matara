import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, Modal } from '@/components/ui';

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

  const cancel = useCallback(() => close(false), [close]);
  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Modal
        open={pending !== null}
        role="alertdialog"
        title={pending?.title}
        onClose={cancel}
        actions={
          <>
            <Button variant="secondary" onClick={cancel}>
              {pending?.cancelLabel}
            </Button>
            <Button
              variant={pending?.danger ? 'danger' : 'primary'}
              autoFocus
              onClick={() => close(true)}
            >
              {pending?.confirmLabel}
            </Button>
          </>
        }
      >
        {pending?.message}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
