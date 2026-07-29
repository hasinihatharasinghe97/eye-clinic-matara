export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  crumbs: Crumb[];
  /** Where the Back button goes. Defaults to previous crumb with an href, else Dashboard. */
  backTo?: string;
  onNavigate: (to: string) => void;
  /** Optional hint under the trail (e.g. patient OPD). */
  subtitle?: string;
};

export function PageNav({ crumbs, backTo, onNavigate, subtitle }: Props) {
  const parent = [...crumbs].reverse().find((c) => c.href);
  const target = backTo ?? parent?.href ?? '/';
  const showBack = crumbs.length > 1 || Boolean(backTo);

  return (
    <div className="page-nav">
      <div className="page-nav-row">
        {showBack && (
          <button
            type="button"
            className="btn secondary btn-back"
            onClick={() => onNavigate(target)}
          >
            ← Back
          </button>
        )}
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={`${c.label}-${i}`}>
                  {i > 0 && <span className="crumb-sep" aria-hidden="true">/</span>}
                  {c.href && !isLast ? (
                    <a
                      href={`#${c.href === '/' ? '/' : c.href}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(c.href!);
                      }}
                    >
                      {c.label}
                    </a>
                  ) : (
                    <span className={isLast ? 'crumb-current' : undefined} aria-current={isLast ? 'page' : undefined}>
                      {c.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
      {subtitle && <p className="page-nav-subtitle muted">{subtitle}</p>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {actionLabel && onAction && (
        <button className="btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
