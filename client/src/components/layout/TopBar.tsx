import { useState } from 'react';
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

/** Clinic name, main menu (a slide-down menu on phones) and sign-out. */
export function TopBar({ user, activeRoute, onNavigate, onSignOut }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const items: ReadonlyArray<NavItem> = [
    ...NAV_ITEMS,
    { path: '/users', label: user.role === 'admin' ? 'Users' : 'My account', route: 'users' },
  ];

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
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>
      </div>
      <nav id="main-nav" aria-label="Main" className={cx('nav-links', open && 'is-open')}>
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
        <button
          type="button"
          className="linkish"
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
