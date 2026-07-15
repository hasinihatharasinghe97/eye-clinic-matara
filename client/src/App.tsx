import { useEffect, useMemo, useState } from 'react';
import {
  api,
  isLoggedIn,
  setToken,
  type Patient,
  type SystemSettings,
} from './api';
import { PatientForm } from './pages/PatientForm';
import { PatientDetail } from './pages/PatientDetail';
import { VisitForm } from './pages/VisitForm';
import { BackupPage } from './pages/BackupPage';

type Route =
  | { name: 'dashboard' }
  | { name: 'new-patient' }
  | { name: 'edit-patient'; id: string }
  | { name: 'patient'; id: string; tab?: string }
  | { name: 'new-visit'; patientId: string }
  | { name: 'edit-visit'; patientId: string; visitId: string }
  | { name: 'backup' };

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
  if (parts[0] === 'patients' && parts[1]) {
    return { name: 'patient', id: parts[1], tab: parts[2] };
  }
  if (parts[0] === 'backup') return { name: 'backup' };
  return { name: 'dashboard' };
}

function navigate(to: string) {
  window.location.hash = to;
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
        <h1>Eye Clinic Matara</h1>
        <p className="muted">District Ayurvedic Hospital — Aparekka</p>
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
        <p className="muted" style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}>
          Default password: clinic123 — change it under Backup &amp; Settings.
        </p>
      </form>
    </div>
  );
}

function Dashboard() {
  const [q, setQ] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [recent, setRecent] = useState<
    Array<{
      visit_id: string;
      visit_date: string;
      diagnosis: string | null;
      patient_id: string;
      patient_name: string;
      opd_ad_no: string | null;
    }>
  >([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [list, visits, s] = await Promise.all([
          api.listPatients(q),
          api.recentVisits(),
          api.getSettings(),
        ]);
        if (!cancelled) {
          setPatients(list);
          setRecent(visits);
          setSettings(s);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const backupStale = useMemo(() => {
    if (!settings?.lastBackupAt) return true;
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

      <div className="row" style={{ marginBottom: '1rem', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Patients</h2>
        <button className="btn" type="button" onClick={() => navigate('/patients/new')}>
          New patient
        </button>
      </div>

      <div className="search">
        <input
          placeholder="Search name, OPD no, phone, or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {patients.length === 0 ? (
          <p className="empty">No patients found. Register the first patient to get started.</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>OPD</th>
                <th>Age / Gender</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a
                      href={`#/patients/${p.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/patients/${p.id}`);
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
                    <button className="btn secondary" type="button" onClick={() => navigate(`/patients/${p.id}`)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Recent visits</h3>
        {recent.length === 0 ? (
          <p className="empty">No visits recorded yet.</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>OPD</th>
                <th>Diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.visit_id}>
                  <td>{v.visit_date}</td>
                  <td>
                    <a
                      href={`#/patients/${v.patient_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/patients/${v.patient_id}`);
                      }}
                    >
                      {v.patient_name}
                    </a>
                  </td>
                  <td>{v.opd_ad_no || '—'}</td>
                  <td>{v.diagnosis || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '/';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>District Ayurvedic Hospital — Matara</strong>
          <span>Eye Clinic Patient System</span>
        </div>
        <nav className="nav-links">
          <a
            href="#/"
            className={route.name === 'dashboard' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            Dashboard
          </a>
          <a
            href="#/backup"
            className={route.name === 'backup' ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              navigate('/backup');
            }}
          >
            Backup &amp; Settings
          </a>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setToken(null);
              setAuthed(false);
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

      {route.name === 'dashboard' && <Dashboard />}
      {route.name === 'new-patient' && (
        <PatientForm
          onDone={(id) => navigate(`/patients/${id}`)}
          onCancel={() => navigate('/')}
        />
      )}
      {route.name === 'edit-patient' && (
        <PatientForm
          patientId={route.id}
          onDone={(id) => navigate(`/patients/${id}`)}
          onCancel={() => navigate(`/patients/${route.id}`)}
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
          onDone={() => navigate(`/patients/${route.patientId}/visits`)}
          onCancel={() => navigate(`/patients/${route.patientId}`)}
        />
      )}
      {route.name === 'edit-visit' && (
        <VisitForm
          patientId={route.patientId}
          visitId={route.visitId}
          onDone={() => navigate(`/patients/${route.patientId}/visits`)}
          onCancel={() => navigate(`/patients/${route.patientId}`)}
        />
      )}
      {route.name === 'backup' && <BackupPage />}
    </div>
  );
}
