import { useEffect, useState } from 'react';
import type { AppUser } from '@/lib/api';
import type { RouteName } from '@/app/routes';
import { cx } from '@/lib/cx';

type NavItem = { path: string; label: string; route: RouteName };

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { path: '/', label: 'Patients', route: 'dashboard' },
  { path: '/daily', label: 'Daily & monthly report', route: 'daily' },
  { path: '/stats', label: 'Stats', route: 'stats' },
  { path: '/forms', label: 'Form builder', route: 'forms' },
  { path: '/backup', label: 'Backup & Settings', route: 'backup' },
];

type TopBarProps = {
  user: AppUser;
  activeRoute: RouteName;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
};

/**
 * Clinic name, main menu and sign-out. On desktop the menu is a row of links; on phones
 * it is a side drawer that slides in over the page.
 */
export function TopBar({ user, activeRoute, onNavigate, onSignOut }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const items: ReadonlyArray<NavItem> = [
    ...NAV_ITEMS,
    { path: '/users', label: user.role === 'admin' ? 'Users' : 'My account', route: 'users' },
  ];

  // While the drawer is open: Escape closes it and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    onNavigate(path);
  };

  return (
    <header className="topbar">
      <div className="topbar-main">
        <button
          type="button"
          className="brand brand-btn"
          onClick={() => go('/')}
          title="Go to patient list"
        >
          <strong>Nethraloka Ayurvedic Eye Clinic</strong>
          <span>Patient System</span>
        </button>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>
      </div>

      {/* Phones only (hidden by CSS on desktop): dims the page; a tap closes the drawer. */}
      {open && <div className="nav-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}

      <nav id="main-nav" aria-label="Main" className={cx('nav-links', open && 'is-open')}>
        <div className="nav-drawer-head">
          <span className="nav-drawer-title">Menu</span>
          <button
            type="button"
            className="nav-drawer-close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        {items.map((item) => (
          <a
            key={item.path}
            href={`#${item.path}`}
            className={activeRoute === item.route ? 'active' : ''}
            aria-current={activeRoute === item.route ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(item.path);
            }}
          >
            {item.label}
          </a>
        ))}
        <div className="nav-drawer-user">
          Signed in as <strong>{user.fullName}</strong>
        </div>
        <button
          type="button"
          className="linkish nav-signout"
          title={`Signed in as ${user.fullName} (${user.username})`}
          onClick={() => {
            setOpen(false);
            onSignOut();
          }}
        >
          Sign out ({user.username})
        </button>
      </nav>
    </header>
  );
}
