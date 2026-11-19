import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons shown on the right (stacked full-width on phones). */
  actions?: ReactNode;
};

/** Page title row with optional subtitle and action buttons. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-toolbar">
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {subtitle && (
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="page-toolbar-actions">{actions}</div>}
    </div>
  );
}
