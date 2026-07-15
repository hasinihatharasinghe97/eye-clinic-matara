import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type Attachment,
  type Patient,
  type ProgressLog,
  type Visit,
} from '../api';

type Props = {
  patientId: string;
  tab: string;
  onNavigate: (to: string) => void;
};

export function PatientDetail({ patientId, tab, onNavigate }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const [logForm, setLogForm] = useState({
    logDate: new Date().toISOString().slice(0, 10),
    rightEye: '',
    leftEye: '',
  });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, v, l, a] = await Promise.all([
        api.getPatient(patientId),
        api.listVisits(patientId),
        api.listProgress(patientId),
        api.listAttachments(patientId),
      ]);
      setPatient(p);
      setVisits(v);
      setLogs(l);
      setFiles(a);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patient');
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addProgress(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createProgress(patientId, logForm);
      setLogForm({
        logDate: new Date().toISOString().slice(0, 10),
        rightEye: '',
        leftEye: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save progress');
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadAttachment(patientId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (!patient && !error) return <p className="muted">Loading…</p>;
  if (!patient) return <p className="error">{error}</p>;

  const active = tab === 'progress' ? 'progress' : tab === 'images' ? 'images' : 'visits';

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>{patient.name}</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              OPD {patient.opdAdNo || '—'} · {patient.age ?? '—'} yrs · {patient.gender || '—'} ·{' '}
              {patient.phone || 'no phone'}
            </p>
            {patient.address && <p className="muted" style={{ margin: '0.25rem 0 0' }}>{patient.address}</p>}
          </div>
          <div className="row">
            <button className="btn secondary" type="button" onClick={() => onNavigate(`/patients/${patientId}/edit`)}>
              Edit details
            </button>
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                if (!confirm(`Delete patient ${patient.name}? This cannot be undone.`)) return;
                await api.deletePatient(patientId);
                onNavigate('/');
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="tabs">
        <button type="button" className={active === 'visits' ? 'active' : ''} onClick={() => onNavigate(`/patients/${patientId}/visits`)}>
          Visits
        </button>
        <button type="button" className={active === 'progress' ? 'active' : ''} onClick={() => onNavigate(`/patients/${patientId}/progress`)}>
          Progress
        </button>
        <button type="button" className={active === 'images' ? 'active' : ''} onClick={() => onNavigate(`/patients/${patientId}/images`)}>
          Images
        </button>
      </div>

      {active === 'visits' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Eye screening visits</h3>
            <button className="btn" type="button" onClick={() => onNavigate(`/patients/${patientId}/visits/new`)}>
              New visit
            </button>
          </div>
          {visits.length === 0 ? (
            <p className="empty">No visits yet. Add a screening visit to record findings.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Diagnosis</th>
                  <th>IOP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td>{v.visitDate}</td>
                    <td>{v.diagnosis || '—'}</td>
                    <td>{v.iop || '—'}</td>
                    <td className="row">
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => onNavigate(`/patients/${patientId}/visits/${v.id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={async () => {
                          if (!confirm('Delete this visit?')) return;
                          await api.deleteVisit(patientId, v.id);
                          await load();
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {active === 'progress' && (
        <>
          <form className="card" onSubmit={addProgress}>
            <h3>Add progress entry</h3>
            <div className="grid-3">
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={logForm.logDate}
                  onChange={(e) => setLogForm((f) => ({ ...f, logDate: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>R (right eye)</label>
                <input
                  value={logForm.rightEye}
                  onChange={(e) => setLogForm((f) => ({ ...f, rightEye: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>L (left eye)</label>
                <input
                  value={logForm.leftEye}
                  onChange={(e) => setLogForm((f) => ({ ...f, leftEye: e.target.value }))}
                />
              </div>
            </div>
            <button className="btn" type="submit" style={{ marginTop: '0.75rem' }}>
              Add to timeline
            </button>
          </form>

          <div className="card">
            <h3>Improvement timeline</h3>
            {logs.length === 0 ? (
              <p className="empty">No progress rows yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>R</th>
                    <th>L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.logDate}</td>
                      <td>{log.rightEye || '—'}</td>
                      <td>{log.leftEye || '—'}</td>
                      <td>
                        <button
                          className="btn danger"
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this progress entry?')) return;
                            await api.deleteProgress(patientId, log.id);
                            await load();
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {active === 'images' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Report images</h3>
            <label className="btn secondary" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : 'Upload image / PDF'}
              <input type="file" accept="image/*,application/pdf" hidden onChange={onUpload} disabled={uploading} />
            </label>
          </div>
          {files.length === 0 ? (
            <p className="empty">No files uploaded. Scan or photograph paper reports and upload them here.</p>
          ) : (
            <div className="gallery">
              {files.map((f) => (
                <div className="gallery-item" key={f.id}>
                  {f.mimeType?.startsWith('image/') ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <img src={f.url} alt={f.originalName} />
                    </a>
                  ) : (
                    <div style={{ height: 120, display: 'grid', placeItems: 'center', background: '#eee' }}>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </div>
                  )}
                  <div className="meta">
                    <div title={f.originalName}>{f.originalName}</div>
                    <div className="muted">{new Date(f.createdAt).toLocaleString()}</div>
                    <button
                      className="btn danger"
                      type="button"
                      style={{ marginTop: '0.35rem' }}
                      onClick={async () => {
                        if (!confirm('Delete this file?')) return;
                        await api.deleteAttachment(patientId, f.id);
                        await load();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
