import { useEffect, useMemo, useState } from 'react';
import {
  api,
  isLoggedIn,
  localClinicDate,
  setToken,
  type Patient,
  type SystemSettings,
} from './api';
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
  | { name: 'forms' };

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
      return { crumbs: [patients, { label: 'Daily attendance' }], backTo: '/' };
    case 'backup':
      return { crumbs: [patients, { label: 'Backup & Settings' }], backTo: '/' };
    case 'forms':
      return { crumbs: [patients, { label: 'Disease form builder' }], backTo: '/' };
    default:
      return { crumbs: [patients] };
  }
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(password);
      setToken(res.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Nethraloka Ayurvedic Eye Clinic</h1>
        <p className="muted">Sign in to continue</p>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="password">Clinic password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: '0.85rem', width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function Dashboard() {
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [recent, setRecent] = useState<
    Array<{
      assessment_id: string;
      assessment_date: string;
      form_type: string;
      eye: string | null;
      patient_id: string;
      patient_name: string;
      opd_ad_no: string | null;
    }>
  >([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const today = localClinicDate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [list, assessments, s] = await Promise.all([
          api.listPatients(q, today),
          api.recentAssessments(),
          api.getSettings(),
        ]);
        if (!cancelled) {
          setPatients(list);
          setRecent(assessments);
          setSettings(s);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, today]);

  async function toggleVisited(patientId: string, visited: boolean) {
    setTogglingId(patientId);
    setError('');
    try {
      await api.setAttendance(patientId, visited, today);
      setPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, visitedToday: visited } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update visit mark');
    } finally {
      setTogglingId(null);
    }
  }

  const visitedCount = patients.filter((p) => p.visitedToday).length;

  const backupStale = useMemo(() => {
    if (!settings) return false;
    if (!settings.lastBackupAt) return true;
    const days = (Date.now() - new Date(settings.lastBackupAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 2;
  }, [settings]);

  return (
    <>
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
                ? `${patients.length} match${patients.length === 1 ? '' : 'es'}`
                : `${patients.length} patient${patients.length === 1 ? '' : 's'}${
                    visitedCount ? ` · ${visitedCount} visited today` : ''
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
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Search patients"
        />
        {q && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQ('')}
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

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
            onAction={() => (q ? setQ('') : navigate('/patients/new'))}
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
          </>
        )}
      </div>

      <div className="card">
        <h3>Recent assessments</h3>
        {loading ? (
          <LoadingBlock label="Loading recent assessments…" />
        ) : recent.length === 0 ? (
          <EmptyState
            title="No assessments recorded yet"
            hint="Open a patient and add a New assessment."
          />
        ) : (
          <>
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>OPD</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr
                    key={a.assessment_id}
                    className="clickable-row"
                    onClick={() => navigate(`/patients/${a.patient_id}/diseases`)}
                  >
                    <td>{a.assessment_date}</td>
                    <td>
                      <a
                        href={`#/patients/${a.patient_id}/diseases`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/patients/${a.patient_id}/diseases`);
                        }}
                      >
                        {a.patient_name}
                      </a>
                    </td>
                    <td>{a.opd_ad_no || '—'}</td>
                    <td>{diseaseFormTitle(a.form_type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mobile-list mobile-only">
            {recent.map((a) => (
              <li key={a.assessment_id}>
                <button
                  type="button"
                  className="mobile-list-item"
                  onClick={() => navigate(`/patients/${a.patient_id}/diseases`)}
                >
                  <span className="mobile-list-title">{a.patient_name}</span>
                  <span className="mobile-list-meta">
                    {a.assessment_date} · OPD {a.opd_ad_no || '—'}
                  </span>
                  <span className="mobile-list-meta">{diseaseFormTitle(a.form_type)}</span>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [route, setRoute] = useState<Route>(parseRoute);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const patientId = routePatientId(route);

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
    if (!patientId) {
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
  }, [patientId]);

  const nav = useMemo(() => buildCrumbs(route, patientName), [route, patientName]);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
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
            Daily report
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
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setNavOpen(false);
              setToken(null);
              setAuthed(false);
            }}
          >
            Sign out
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
      {route.name === 'backup' && <BackupPage />}
      {route.name === 'forms' && <FormBuilderPage onNavigate={navigate} />}
    </div>
  );
}
