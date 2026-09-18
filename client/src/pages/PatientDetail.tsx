import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type Attachment,
  type DiseaseAssessment,
  type Patient,
  type ProgressLog,
  type Visit,
} from '../api';
import { diseaseFormTitle } from '../diseaseForms/catalog';
import { useDiseaseForms } from '../diseaseForms/DiseaseFormsContext';
import { PatientChartsPanel } from './PatientCharts';
import { CameraCapture } from '../components/CameraCapture';
import { SendMedicineWhatsApp } from '../components/SendMedicineWhatsApp';
import { EmptyState, LoadingBlock } from '../components/PageNav';

function formatWhen(value: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  // date-only strings show as local date; datetimes show with time
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return d.toLocaleDateString();
  return d.toLocaleString();
}

function formatIop(iop: Visit['iop']): string {
  if (!iop) return '—';
  if (typeof iop === 'object') {
    const r = iop.r?.trim() || '—';
    const l = iop.l?.trim() || '—';
    if (r === '—' && l === '—') return '—';
    return `R ${r} / L ${l}`;
  }
  return String(iop);
}

type Props = {
  patientId: string;
  tab: string;
  onNavigate: (to: string) => void;
};

export function PatientDetail({ patientId, tab, onNavigate }: Props) {
  const { forms: DISEASE_FORMS } = useDiseaseForms();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [assessments, setAssessments] = useState<DiseaseAssessment[]>([]);
  const [error, setError] = useState('');
  const [logForm, setLogForm] = useState({
    logDate: new Date().toISOString().slice(0, 10),
    rightEye: '',
    leftEye: '',
    rightScore: '' as string,
    leftScore: '' as string,
  });
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [filterFormType, setFilterFormType] = useState('');
  const [newFormType, setNewFormType] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, v, l, a, d] = await Promise.all([
        api.getPatient(patientId),
        api.listVisits(patientId),
        api.listProgress(patientId),
        api.listAttachments(patientId),
        api.listDiseaseAssessments(patientId),
      ]);
      setPatient(p);
      setVisits(v);
      setLogs(l);
      setFiles(a);
      setAssessments(d);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patient');
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const patientConditions = patient?.conditions || [];
  const availableForms = useMemo(() => {
    if (patientConditions.length === 0) return DISEASE_FORMS;
    const selected = DISEASE_FORMS.filter((f) => patientConditions.includes(f.id));
    return selected.length ? selected : DISEASE_FORMS;
  }, [patientConditions]);

  useEffect(() => {
    if (!newFormType && availableForms[0]) {
      setNewFormType(availableForms[0].id);
    }
  }, [availableForms, newFormType]);

  async function addProgress(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createProgress(patientId, {
        logDate: logForm.logDate,
        rightEye: logForm.rightEye,
        leftEye: logForm.leftEye,
        rightScore: logForm.rightScore === '' ? null : Number(logForm.rightScore),
        leftScore: logForm.leftScore === '' ? null : Number(logForm.leftScore),
      });
      setLogForm({
        logDate: new Date().toISOString().slice(0, 10),
        rightEye: '',
        leftEye: '',
        rightScore: '',
        leftScore: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save progress');
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      await api.uploadAttachment(patientId, file);
      await load();
      setCameraOpen(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = '';
  }

  if (!patient && !error) return <LoadingBlock label="Loading patient…" />;
  if (!patient) {
    return (
      <div className="card">
        <p className="error">{error}</p>
        <button className="btn secondary" type="button" onClick={() => onNavigate('/')}>
          ← Back to patients
        </button>
      </div>
    );
  }

  const active =
    tab === 'progress'
      ? 'progress'
      : tab === 'images'
        ? 'images'
        : tab === 'diseases'
          ? 'diseases'
          : tab === 'charts'
            ? 'charts'
            : tab === 'whatsapp'
              ? 'whatsapp'
              : 'visits';

  const filteredAssessments = filterFormType
    ? assessments.filter((a) => a.formType === filterFormType)
    : assessments;

  return (
    <>
      <div className="card">
        <div className="patient-header">
          <div>
            <h2 style={{ margin: 0 }}>{patient.name}</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              OPD {patient.opdAdNo || '—'} · {patient.age ?? '—'} yrs · {patient.gender || '—'} ·{' '}
              {patient.phone || 'no phone'}
            </p>
            {patient.address && (
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {patient.address}
              </p>
            )}
            {patientConditions.length > 0 && (
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                Conditions: {patientConditions.map(diseaseFormTitle).join(', ')}
              </p>
            )}
          </div>
          <div className="patient-header-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => onNavigate('/')}
            >
              ← Patients
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => onNavigate(`/patients/${patientId}/edit`)}
            >
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
        <button
          type="button"
          className={active === 'visits' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/visits`)}
        >
          Visits
        </button>
        <button
          type="button"
          className={active === 'diseases' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/diseases`)}
        >
          Disease forms
        </button>
        <button
          type="button"
          className={active === 'charts' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/charts`)}
        >
          Charts
        </button>
        <button
          type="button"
          className={active === 'progress' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/progress`)}
        >
          Progress
        </button>
        <button
          type="button"
          className={active === 'images' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/images`)}
        >
          Images
        </button>
        <button
          type="button"
          className={active === 'whatsapp' ? 'active' : ''}
          onClick={() => onNavigate(`/patients/${patientId}/whatsapp`)}
        >
          WhatsApp
        </button>
      </div>

      {active === 'visits' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Eye screening visits</h3>
            <button
              className="btn"
              type="button"
              onClick={() => onNavigate(`/patients/${patientId}/visits/new`)}
            >
              New visit
            </button>
          </div>
          {visits.length === 0 ? (
            <EmptyState
              title="No visits yet"
              hint="Add an eye screening visit to record vision, IOP, and findings."
              actionLabel="New visit"
              onAction={() => onNavigate(`/patients/${patientId}/visits/new`)}
            />
          ) : (
            <div className="table-wrap">
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
                      <td>{formatIop(v.iop)}</td>
                      <td className="row">
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() =>
                            onNavigate(`/patients/${patientId}/visits/${v.id}/edit`)
                          }
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
            </div>
          )}
        </div>
      )}

      {active === 'diseases' && (
        <>
          <div className="card">
            <h3>Start disease monitoring form</h3>
            <p className="muted">
              Forms match the clinic PDF proformas (cataract, DR, ARMD, CME, and others). Fill a new
              assessment each review visit to track improvement.
            </p>
            {patientConditions.length === 0 && (
              <p className="warn-banner">
                No conditions selected on this patient yet. You can still open any form, or{' '}
                <a
                  href={`#/patients/${patientId}/edit`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(`/patients/${patientId}/edit`);
                  }}
                >
                  edit patient details
                </a>{' '}
                to mark their diseases.
              </p>
            )}
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <select
                value={newFormType}
                onChange={(e) => setNewFormType(e.target.value)}
                style={{ minWidth: 220 }}
              >
                {availableForms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                disabled={!newFormType}
                onClick={() =>
                  onNavigate(
                    `/patients/${patientId}/diseases/${encodeURIComponent(newFormType)}/new`
                  )
                }
              >
                New assessment
              </button>
            </div>
            <div className="check-grid" style={{ marginTop: '1rem' }}>
              {availableForms.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="btn secondary"
                  onClick={() =>
                    onNavigate(
                      `/patients/${patientId}/diseases/${encodeURIComponent(f.id)}/new`
                    )
                  }
                >
                  {f.shortTitle}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0 }}>Saved assessments</h3>
              <select
                value={filterFormType}
                onChange={(e) => setFilterFormType(e.target.value)}
              >
                <option value="">All forms</option>
                {DISEASE_FORMS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortTitle}
                  </option>
                ))}
              </select>
            </div>
            {filteredAssessments.length === 0 ? (
              <p className="empty">No disease assessments yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Form</th>
                      <th>Eye</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssessments.map((a) => (
                      <tr key={a.id}>
                        <td>{formatWhen(a.assessmentDate)}</td>
                        <td>{diseaseFormTitle(a.formType)}</td>
                        <td>{a.eye || '—'}</td>
                        <td className="row">
                          <button
                            className="btn secondary"
                            type="button"
                            onClick={() =>
                              onNavigate(
                                `/patients/${patientId}/diseases/${encodeURIComponent(a.formType)}/${a.id}/edit`
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="btn danger"
                            type="button"
                            onClick={async () => {
                              if (!confirm('Delete this assessment?')) return;
                              await api.deleteDiseaseAssessment(patientId, a.id);
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
              </div>
            )}
          </div>
        </>
      )}

      {active === 'charts' && <PatientChartsPanel patientId={patientId} />}

      {active === 'progress' && (
        <>
          <form className="card" onSubmit={addProgress}>
            <h3>Add progress entry</h3>
            <p className="muted">
              Notes are free text. Optional scores (0–10) feed the improvement charts.
            </p>
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
                <label>R notes (right eye)</label>
                <input
                  value={logForm.rightEye}
                  onChange={(e) => setLogForm((f) => ({ ...f, rightEye: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>L notes (left eye)</label>
                <input
                  value={logForm.leftEye}
                  onChange={(e) => setLogForm((f) => ({ ...f, leftEye: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>R improvement score (0–10)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={logForm.rightScore}
                  onChange={(e) => setLogForm((f) => ({ ...f, rightScore: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="field">
                <label>L improvement score (0–10)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={logForm.leftScore}
                  onChange={(e) => setLogForm((f) => ({ ...f, leftScore: e.target.value }))}
                  placeholder="Optional"
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
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>R notes</th>
                      <th>R score</th>
                      <th>L notes</th>
                      <th>L score</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.logDate}</td>
                        <td>{log.rightEye || '—'}</td>
                        <td>{log.rightScore ?? '—'}</td>
                        <td>{log.leftEye || '—'}</td>
                        <td>{log.leftScore ?? '—'}</td>
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
              </div>
            )}
          </div>
        </>
      )}

      {active === 'images' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Report images</h3>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={uploading}
                onClick={() => setCameraOpen(true)}
              >
                Take photo
              </button>
              <label className="btn secondary" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
                {uploading ? 'Uploading…' : 'Upload image / PDF'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={onUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Use <strong>Take photo</strong> to open the device camera, capture a report picture, then save it
            to this patient.
          </p>
          {files.length === 0 ? (
            <p className="empty">
              No files uploaded yet. Take a photo or upload a scanned image / PDF.
            </p>
          ) : (
            <div className="gallery">
              {files.map((f) => (
                <div className="gallery-item" key={f.id}>
                  {f.mimeType?.startsWith('image/') ? (
                    <a href={f.url} target="_blank" rel="noreferrer">
                      <img src={f.url} alt={f.originalName} />
                    </a>
                  ) : (
                    <div
                      style={{
                        height: 120,
                        display: 'grid',
                        placeItems: 'center',
                        background: '#eee',
                      }}
                    >
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
          <CameraCapture
            open={cameraOpen}
            busy={uploading}
            onClose={() => setCameraOpen(false)}
            onCapture={uploadFile}
          />
        </div>
      )}

      {active === 'whatsapp' && (
        <SendMedicineWhatsApp
          patient={patient}
          attachments={files}
          busy={uploading}
          onPatientUpdated={(p) => setPatient(p)}
        />
      )}
    </>
  );
}
