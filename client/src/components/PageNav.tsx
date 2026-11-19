export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  crumbs: Crumb[];
  /** Where Back goes. Defaults to the previous crumb with an href, else the patient list. */
  backTo?: string;
  onNavigate: (to: string) => void;
  /** Optional hint under the trail (e.g. patient OPD). */
  subtitle?: string;
};

/** Slim "‹ Back | Patients › Name › Visits" line at the top of inner pages. */
export function PageNav({ crumbs, backTo, onNavigate, subtitle }: Props) {
  const parent = [...crumbs].reverse().find((c) => c.href);
  const target = backTo ?? parent?.href ?? '/';
  const showBack = crumbs.length > 1 || Boolean(backTo);

  return (
    <div className="page-nav">
      <div className="page-nav-row">
        {showBack && (
          <button type="button" className="page-back" onClick={() => onNavigate(target)}>
            <span aria-hidden="true">‹</span> Back
          </button>
        )}
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <li key={`${c.label}-${i}`}>
                  {i > 0 && (
                    <span className="crumb-sep" aria-hidden="true">
                      ›
                    </span>
                  )}
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
                    <span
                      className={isLast ? 'crumb-current' : undefined}
                      aria-current={isLast ? 'page' : undefined}
                    >
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
