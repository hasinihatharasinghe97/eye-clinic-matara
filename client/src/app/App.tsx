import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  AUTH_EXPIRED_EVENT,
  isLoggedIn,
  localClinicDate,
  setToken,
  TOKEN_STORAGE_KEY,
  type AppUser,
  type Patient,
  type SystemSettings,
} from './api';
import { IDLE_LOGOUT_LABEL, useIdleLogout } from './useIdleLogout';
import { ChangePasswordForm, UsersPage } from './pages/UsersPage';

/** sessionStorage key telling the login screen why the user was signed out. */
const SIGNOUT_REASON_KEY = 'eye-clinic-signout-reason';
import { PatientForm } from './pages/PatientForm';
import { PatientDetail } from './pages/PatientDetail';
import { VisitForm } from './pages/VisitForm';
import { BackupPage } from './pages/BackupPage';
import { DiseaseFormPage } from './diseaseForms/DiseaseFormPage';
import { StatsPage } from './pages/StatsPage';
import { DailyReportPage } from './pages/DailyReportPage';
import { FormBuilderPage } from './pages/FormBuilderPage';
import { diseaseFormTitle } from './diseaseForms/catalog';
import { EmptyState, LoadingBlock, PageNav, type Crumb } from './components/PageNav';
import { VisitTodayTick } from './components/VisitTodayTick';
import { PAGE_SIZE_OPTIONS, Pagination } from './components/Pagination';
import { useToast } from './components/Toast';

type Route =
  | { name: 'dashboard' }
  | { name: 'new-patient' }
  | { name: 'edit-patient'; id: string }
  | { name: 'patient'; id: string; tab?: string }
  | { name: 'new-visit'; patientId: string }
  | { name: 'edit-visit'; patientId: string; visitId: string }
  | { name: 'new-disease'; patientId: string; formType: string }
  | { name: 'edit-disease'; patientId: string; formType: string; assessmentId: string }
  | { name: 'backup' }
  | { name: 'stats' }
  | { name: 'daily' }
  | { name: 'forms' }
  | { name: 'users' };

const TAB_LABELS: Record<string, string> = {
  visits: 'Visits',
  diseases: 'Assessments',
  charts: 'Charts',
  progress: 'Progress',
  images: 'Images',
  whatsapp: 'WhatsApp',
};

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'patients' && parts[1] === 'new') return { name: 'new-patient' };
  if (parts[0] === 'patients' && parts[1] && parts[2] === 'edit') {
    return { name: 'edit-patient', id: parts[1] };
  }
  if (parts[0] === 'patients' && parts[1] && parts[2] === 'visits' && parts[3] === 'new') {
    return { name: 'new-visit', patientId: parts[1] };
  }
  if (parts[0] === 'patients' && parts[1] && parts[2] === 'visits' && parts[3] && parts[4] === 'edit') {
    return { name: 'edit-visit', patientId: parts[1], visitId: parts[3] };
  }
  if (
    parts[0] === 'patients' &&
    parts[1] &&
    parts[2] === 'diseases' &&
    parts[3] &&
    parts[4] === 'new'
  ) {
    return {
      name: 'new-disease',
      patientId: parts[1],
      formType: decodeURIComponent(parts[3]),
    };
  }
  if (
    parts[0] === 'patients' &&
    parts[1] &&
    parts[2] === 'diseases' &&
    parts[3] &&
    parts[4] &&
    parts[5] === 'edit'
  ) {
    return {
      name: 'edit-disease',
      patientId: parts[1],
      formType: decodeURIComponent(parts[3]),
      assessmentId: parts[4],
    };
  }
  if (parts[0] === 'patients' && parts[1]) {
    return { name: 'patient', id: parts[1], tab: parts[2] };
  }
  if (parts[0] === 'backup') return { name: 'backup' };
  if (parts[0] === 'stats') return { name: 'stats' };
  if (parts[0] === 'daily') return { name: 'daily' };
  if (parts[0] === 'forms') return { name: 'forms' };
  if (parts[0] === 'users') return { name: 'users' };
  return { name: 'dashboard' };
}

function navigate(to: string) {
  window.location.hash = to;
}

function routePatientId(route: Route): string | null {
  if (route.name === 'patient' || route.name === 'edit-patient') return route.id;
  if (
    route.name === 'new-visit' ||
    route.name === 'edit-visit' ||
    route.name === 'new-disease' ||
    route.name === 'edit-disease'
  ) {
    return route.patientId;
  }
  return null;
}

function buildCrumbs(route: Route, patientName: string | null): { crumbs: Crumb[]; backTo?: string; subtitle?: string } {
  const patients: Crumb = { label: 'Patients', href: '/' };
  const name = patientName || 'Patient';

  switch (route.name) {
    case 'dashboard':
      return { crumbs: [{ label: 'Patients' }] };
    case 'new-patient':
      return {
        crumbs: [patients, { label: 'New patient' }],
        backTo: '/',
      };
    case 'edit-patient':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.id}` },
          { label: 'Edit details' },
        ],
        backTo: `/patients/${route.id}`,
      };
    case 'patient': {
      const tab = route.tab || 'visits';
      const tabLabel = TAB_LABELS[tab] || 'Visits';
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.id}/visits` },
          { label: tabLabel },
        ],
        backTo: '/',
      };
    }
    case 'new-visit':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.patientId}/visits` },
          { label: 'Visits', href: `/patients/${route.patientId}/visits` },
          { label: 'New screening form' },
        ],
        backTo: `/patients/${route.patientId}/visits`,
      };
    case 'edit-visit':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.patientId}/visits` },
          { label: 'Visits', href: `/patients/${route.patientId}/visits` },
          { label: 'Edit screening form' },
        ],
        backTo: `/patients/${route.patientId}/visits`,
      };
    case 'new-disease':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.patientId}/diseases` },
          { label: 'Assessments', href: `/patients/${route.patientId}/diseases` },
          { label: diseaseFormTitle(route.formType) },
          { label: 'New' },
        ],
        backTo: `/patients/${route.patientId}/diseases`,
      };
    case 'edit-disease':
      return {
        crumbs: [
          patients,
          { label: name, href: `/patients/${route.patientId}/diseases` },
          { label: 'Assessments', href: `/patients/${route.patientId}/diseases` },
          { label: diseaseFormTitle(route.formType) },
          { label: 'Edit' },
        ],
        backTo: `/patients/${route.patientId}/diseases`,
      };
    case 'stats':
      return { crumbs: [patients, { label: 'Clinic stats' }], backTo: '/' };
    case 'daily':
      return { crumbs: [patients, { label: 'Daily & monthly report' }], backTo: '/' };
    case 'backup':
      return { crumbs: [patients, { label: 'Backup & Settings' }], backTo: '/' };
    case 'forms':
      return { crumbs: [patients, { label: 'Disease form builder' }], backTo: '/' };
    case 'users':
      return { crumbs: [patients, { label: 'Users & account' }], backTo: '/' };
    default:
      return { crumbs: [patients] };
  }
}

function LoginScreen({ onLogin }: { onLogin: (user: AppUser) => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [idleNotice] = useState(() => {
    try {
      const reason = sessionStorage.getItem(SIGNOUT_REASON_KEY);
      sessionStorage.removeItem(SIGNOUT_REASON_KEY);
      return reason === 'idle';
    } catch {
      return false;
    }
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.login(username.trim(), password);
      setToken(res.token);
      setPassword('');
      onLogin(res.user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Nethraloka Ayurvedic Eye Clinic</h1>
        <p className="muted">Sign in to continue</p>
        {idleNotice && (
          <p className="login-notice" role="status">
            You were signed out after {IDLE_LOGOUT_LABEL} without activity, to keep patient
            records private.
          </p>
        )}
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: '0.85rem', width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

/** Shown after signing in with a temporary password: nothing else works until it's changed. */
function ForcePasswordChange({
  user,
  onChanged,
  onSignOut,
}: {
  user: AppUser;
  onChanged: (u: AppUser) => void;
  onSignOut: () => void;
}) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Choose your password</h1>
        <p className="muted">
          Welcome, {user.fullName}. You signed in with a temporary password — choose your own to
          continue. Don&apos;t share it with anyone.
        </p>
        <ChangePasswordForm onChanged={onChanged} submitLabel="Save and continue" />
        <button type="button" className="linkish" onClick={onSignOut} style={{ marginTop: '0.75rem' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Dashboard() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [visitedToday, setVisitedToday] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const today = localClinicDate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [list, s] = await Promise.all([
          api.listPatients(q, today, page, pageSize),
          api.getSettings(),
        ]);
        if (!cancelled) {
          if (list.total > 0 && list.patients.length === 0 && page > 1) {
            setPage(1);
            return;
          }
          setPatients(list.patients);
          setTotal(list.total);
          setVisitedToday(list.visitedToday);
          setSettings(s);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, today, page, pageSize, toast]);

  async function toggleVisited(patientId: string, visited: boolean) {
    setTogglingId(patientId);
    try {
      await api.setAttendance(patientId, visited, today);
      setPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, visitedToday: visited } : p))
      );
      setVisitedToday((c) => Math.max(0, c + (visited ? 1 : -1)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update visit mark');
    } finally {
      setTogglingId(null);
    }
  }

  // On the clinic laptop: remind the doctor when today's work hasn't reached the cloud yet.
  const [unsyncedTables, setUnsyncedTables] = useState<string[]>([]);
  const [autoSync, setAutoSync] = useState<{ enabled: boolean; blocked: string | null } | null>(null);
  useEffect(() => {
    if (!settings?.cloudSync) return;
    let cancelled = false;
    api
      .getCloudSync()
      .then((s) => {
        if (cancelled || !s.configured) return;
        setUnsyncedTables(s.pending?.changedTables || []);
        setAutoSync({ enabled: s.auto.enabled, blocked: s.auto.blocked });
      })
      .catch(() => {
        /* reminder only */
      });
    return () => {
      cancelled = true;
    };
  }, [settings?.cloudSync]);

  const backupStale = useMemo(() => {
    if (!settings) return false;
    if (!settings.lastBackupAt) return true;
    const days = (Date.now() - new Date(settings.lastBackupAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 2;
  }, [settings]);

  return (
    <>
      {autoSync?.blocked ? (
        <div className="warn-banner">
          Automatic sync with the online app is paused to protect your records.{' '}
          <a href="#/backup" onClick={(e) => { e.preventDefault(); navigate('/backup'); }}>
            Open Backup &amp; Settings
          </a>{' '}
          to see why.
        </div>
      ) : unsyncedTables.length > 0 && autoSync?.enabled ? (
        <div className="info-banner">
          Some work on this laptop is not in the online app yet. It will be sent automatically
          when the laptop has a stable internet connection.
        </div>
      ) : unsyncedTables.length > 0 ? (
        <div className="warn-banner">
          Today’s work on this laptop is not in the online app yet. When you have internet,{' '}
          <a href="#/backup" onClick={(e) => { e.preventDefault(); navigate('/backup'); }}>
            sync to cloud
          </a>
          .
        </div>
      ) : null}
      {backupStale && (
        <div className="warn-banner">
          {settings?.lastBackupAt
            ? `Last backup was on ${new Date(settings.lastBackupAt).toLocaleString()}. `
            : 'No backup has been made yet. '}
          Please{' '}
          <a href="#/backup" onClick={(e) => { e.preventDefault(); navigate('/backup'); }}>
            run or download a backup
          </a>
          {settings?.cloudMode
            ? ' (auto-backup runs daily in the cloud).'
            : ' and keep the ZIP on Google Drive, OneDrive, or a USB drive.'}
        </div>
      )}

      <div className="page-toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Patients</h2>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
            {loading
              ? 'Loading…'
              : q
                ? `${total} match${total === 1 ? '' : 'es'}`
                : `${total} patient${total === 1 ? '' : 's'}${
                    visitedToday ? ` · ${visitedToday} visited today` : ''
                  }`}
          </p>
        </div>
        <div className="page-toolbar-actions">
          <button className="btn secondary" type="button" onClick={() => navigate('/stats')}>
            Clinic stats
          </button>
          <button className="btn" type="button" onClick={() => navigate('/patients/new')}>
            New patient
          </button>
        </div>
      </div>

      <div className="search">
        <input
          placeholder="Search name, OPD no, phone, or ID…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          autoFocus
          aria-label="Search patients"
        />
        {q && (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setQ('');
              setPage(1);
            }}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock label="Loading patients…" />
        ) : patients.length === 0 ? (
          <EmptyState
            title={q ? 'No patients match your search' : 'No patients yet'}
            hint={
              q
                ? 'Try another name, OPD number, phone, or ID.'
                : 'Register the first patient to start recording disease assessments.'
            }
            actionLabel={q ? 'Clear search' : 'New patient'}
            onAction={() => {
              if (q) {
                setQ('');
                setPage(1);
              } else {
                navigate('/patients/new');
              }
            }}
          />
        ) : (
          <>
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Today</th>
                  <th>Name</th>
                  <th>OPD</th>
                  <th>Age / Gender</th>
                  <th>Phone</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="clickable-row" onClick={() => navigate(`/patients/${p.id}/visits`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <VisitTodayTick
                        checked={Boolean(p.visitedToday)}
                        disabled={togglingId === p.id}
                        label="Visited"
                        onChange={(next) => toggleVisited(p.id, next)}
                      />
                    </td>
                    <td>
                      <a
                        href={`#/patients/${p.id}/visits`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/patients/${p.id}/visits`);
                        }}
                      >
                        {p.name}
                      </a>
                    </td>
                    <td>{p.opdAdNo || '—'}</td>
                    <td>
                      {p.age ?? '—'} / {p.gender || '—'}
                    </td>
                    <td>{p.phone || '—'}</td>
                    <td>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${p.id}/visits`);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mobile-list mobile-only">
            {patients.map((p) => (
              <li key={p.id}>
                <div className="mobile-list-card">
                  <VisitTodayTick
                    checked={Boolean(p.visitedToday)}
                    disabled={togglingId === p.id}
                    label="Visited"
                    onChange={(next) => toggleVisited(p.id, next)}
                  />
                  <button
                    type="button"
                    className="mobile-list-item"
                    onClick={() => navigate(`/patients/${p.id}/visits`)}
                  >
                    <span className="mobile-list-title">{p.name}</span>
                    <span className="mobile-list-meta">
                      OPD {p.opdAdNo || '—'} · {p.age ?? '—'} / {p.gender || '—'}
                    </span>
                    <span className="mobile-list-meta">{p.phone || 'No phone'}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n as (typeof PAGE_SIZE_OPTIONS)[number]);
              setPage(1);
            }}
          />
          </>
        )}
      </div>

    </>
  );
}

export default function App() {
  // A stored token is only trusted after the server accepts it, so a stale or
  // tampered token never shows anything but the login screen.
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>(() =>
    isLoggedIn() ? 'checking' : 'out'
  );
  const [me, setMe] = useState<AppUser | null>(null);
  const authed = auth === 'in' && me !== null;
  const [route, setRoute] = useState<Route>(parseRoute);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const patientId = routePatientId(route);

  useEffect(() => {
    if (auth !== 'checking') return;
    let cancelled = false;
    api
      .checkSession()
      .then((s) => {
        if (cancelled) return;
        setMe(s.user);
        setAuth('in');
      })
      .catch(() => !cancelled && setAuth('out'));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  useEffect(() => {
    const onExpired = () => setAuth('out');
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    // Signing out (or idle sign-out) in one tab signs out every open tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY && !e.newValue) setAuth('out');
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const signOutIdle = useCallback(() => {
    setToken(null);
    try {
      sessionStorage.setItem(SIGNOUT_REASON_KEY, 'idle');
    } catch {
      /* ignore */
    }
    setAuth('out');
  }, []);
  const idle = useIdleLogout(authed, signOutIdle);

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    setAuth('out');
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      setNavOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '/';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!patientId || !authed) {
      setPatientName(null);
      return;
    }
    let cancelled = false;
    api
      .getPatient(patientId)
      .then((p) => {
        if (!cancelled) setPatientName(p.name);
      })
      .catch(() => {
        if (!cancelled) setPatientName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, authed]);

  const nav = useMemo(() => buildCrumbs(route, patientName), [route, patientName]);

  if (auth === 'checking') {
    return (
      <div className="login-wrap">
        <LoadingBlock label="Checking sign-in…" />
      </div>
    );
  }

  if (!authed || !me) {
    return (
      <LoginScreen
        onLogin={(user) => {
          // Always start on the patient list after signing in, not the page used last time.
          navigate('/');
          setMe(user);
          setAuth('in');
        }}
      />
    );
  }

  if (me.mustChangePassword) {
    return (
      <ForcePasswordChange
        user={me}
        onChanged={(u) => {
          navigate('/');
          setMe(u);
        }}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-main">
          <button
            type="button"
            className="brand brand-btn"
            onClick={() => navigate('/')}
            title="Go to patient list"
          >
            <strong>Nethraloka Ayurvedic Eye Clinic</strong>
            <span>Patient System</span>
          </button>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-controls="main-nav"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setNavOpen((o) => !o)}
          >
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
          </button>
        </div>
        <nav id="main-nav" className={`nav-links${navOpen ? ' is-open' : ''}`}>
          <a
            href="#/"
            className={route.name === 'dashboard' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/');
            }}
          >
            Patients
          </a>
          <a
            href="#/daily"
            className={route.name === 'daily' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/daily');
            }}
          >
            Daily & monthly report
          </a>
          <a
            href="#/stats"
            className={route.name === 'stats' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/stats');
            }}
          >
            Stats
          </a>
          <a
            href="#/forms"
            className={route.name === 'forms' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/forms');
            }}
          >
            Form builder
          </a>
          <a
            href="#/backup"
            className={route.name === 'backup' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/backup');
            }}
          >
            Backup &amp; Settings
          </a>
          <a
            href="#/users"
            className={route.name === 'users' ? 'active' : ''}
            title={`Signed in as ${me.fullName}`}
            onClick={(e) => {
              e.preventDefault();
              setNavOpen(false);
              navigate('/users');
            }}
          >
            {me.role === 'admin' ? 'Users' : 'My account'}
          </a>
          <button
            type="button"
            className="linkish"
            title={`Signed in as ${me.fullName} (${me.username})`}
            onClick={() => {
              setNavOpen(false);
              signOut();
            }}
          >
            Sign out ({me.username})
          </button>
        </nav>
      </header>

      {route.name !== 'dashboard' && (
        <PageNav crumbs={nav.crumbs} backTo={nav.backTo} onNavigate={navigate} />
      )}

      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'daily' && <DailyReportPage />}
      {route.name === 'stats' && <StatsPage />}
      {route.name === 'new-patient' && (
        <PatientForm
          onDone={(id) => navigate(`/patients/${id}/visits`)}
          onCancel={() => navigate('/')}
        />
      )}
      {route.name === 'edit-patient' && (
        <PatientForm
          patientId={route.id}
          onDone={(id) => navigate(`/patients/${id}/visits`)}
          onCancel={() => navigate(`/patients/${route.id}/visits`)}
        />
      )}
      {route.name === 'patient' && (
        <PatientDetail
          patientId={route.id}
          tab={route.tab || 'visits'}
          onNavigate={navigate}
        />
      )}
      {route.name === 'new-visit' && (
        <VisitForm
          patientId={route.patientId}
          patientName={patientName}
          onDone={() => navigate(`/patients/${route.patientId}/visits`)}
          onCancel={() => navigate(`/patients/${route.patientId}/visits`)}
        />
      )}
      {route.name === 'edit-visit' && (
        <VisitForm
          patientId={route.patientId}
          visitId={route.visitId}
          patientName={patientName}
          onDone={() => navigate(`/patients/${route.patientId}/visits`)}
          onCancel={() => navigate(`/patients/${route.patientId}/visits`)}
        />
      )}
      {route.name === 'new-disease' && (
        <DiseaseFormPage
          patientId={route.patientId}
          formType={route.formType}
          patientName={patientName}
          onDone={() => navigate(`/patients/${route.patientId}/diseases`)}
          onCancel={() => navigate(`/patients/${route.patientId}/diseases`)}
        />
      )}
      {route.name === 'edit-disease' && (
        <DiseaseFormPage
          patientId={route.patientId}
          formType={route.formType}
          assessmentId={route.assessmentId}
          patientName={patientName}
          onDone={() => navigate(`/patients/${route.patientId}/diseases`)}
          onCancel={() => navigate(`/patients/${route.patientId}/diseases`)}
        />
      )}
      {route.name === 'backup' && <BackupPage isAdmin={me.role === 'admin'} />}
      {route.name === 'users' && <UsersPage me={me} onMeChanged={setMe} />}
      {route.name === 'forms' && <FormBuilderPage onNavigate={navigate} />}
      {idle.secondsLeft !== null && (
        <div className="idle-overlay" data-idle-warning role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
          <div className="idle-card">
            <h3 id="idle-title">Still there?</h3>
            <p>
              For patient privacy you will be signed out in <strong>{idle.secondsLeft}</strong>{' '}
              second{idle.secondsLeft === 1 ? '' : 's'} because nobody has used the app for{' '}
              {IDLE_LOGOUT_LABEL}. Save any open form to keep your changes.
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={idle.stayActive} autoFocus>
                Stay signed in
              </button>
              <button className="btn secondary" type="button" onClick={signOutIdle}>
                Sign out now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
