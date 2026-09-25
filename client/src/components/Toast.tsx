import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastKind = 'error' | 'success' | 'warn' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  durationMs: number;
};

type ToastApi = {
  error: (message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  warn: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const TITLES: Record<ToastKind, string> = {
  error: 'ERROR',
  success: 'SUCCESS',
  warn: 'WARNING',
  info: 'INFO',
};

const ICONS: Record<ToastKind, string> = {
  error: '✕',
  success: '✓',
  warn: '!',
  info: 'i',
};

const DEFAULT_DURATION: Record<ToastKind, number> = {
  error: 6000,
  success: 4000,
  warn: 5500,
  info: 4500,
};

const ToastContext = createContext<ToastApi | null>(null);

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: (id: number) => void;
}) {
  useEffect(() => {
    if (item.durationMs <= 0) return;
    const t = window.setTimeout(() => onClose(item.id), item.durationMs);
    return () => window.clearTimeout(t);
  }, [item.id, item.durationMs, onClose]);

  return (
    <div className={`toast toast-${item.kind}`} role="status">
      <span className="toast-icon" aria-hidden>
        {ICONS[item.kind]}
      </span>
      <div className="toast-body">
        <strong className="toast-title">{item.title}</strong>
        <p className="toast-message">{item.message}</p>
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss"
        onClick={() => onClose(item.id)}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, title?: string) => {
    const text = String(message || '').trim();
    if (!text) return;
    const id = ++idRef.current;
    setToasts((prev) => [
      ...prev.slice(-4),
      {
        id,
        kind,
        title: title || TITLES[kind],
        message: text,
        durationMs: DEFAULT_DURATION[kind],
      },
    ]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      error: (message, title) => push('error', message, title),
      success: (message, title) => push('success', message, title),
      warn: (message, title) => push('warn', message, title),
      info: (message, title) => push('info', message, title),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
