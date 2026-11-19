import type { ReactNode } from 'react';
import { Button } from './Button';

/** Spinner + text while something loads. Announced to screen readers. */
export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  hint?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

/** Friendly message when a list has nothing to show, with an optional next step. */
export function EmptyState({ title, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

type NoticeProps = {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
};

/** Inline message banner (e.g. "No backup has been made yet"). */
export function Notice({ tone = 'info', children }: NoticeProps) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
