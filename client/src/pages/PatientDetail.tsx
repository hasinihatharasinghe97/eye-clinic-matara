import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  localClinicDate,
  type Attachment,
  type DiseaseAssessment,
  type Patient,
  type ProgressLog,
  type Visit,
} from '@/lib/api';
import { diseaseFormTitle } from '@/diseaseForms/catalog';
import { useDiseaseForms } from '@/diseaseForms/DiseaseFormsContext';
import { PatientChartsPanel } from './PatientCharts';
import { CameraCapture } from '@/components/CameraCapture';
import { SendMedicineWhatsApp } from '@/components/SendMedicineWhatsApp';
import { Button, EmptyState, LoadingBlock, Tabs, type TabItem } from '@/components/ui';
import { PATIENT_TAB_LABELS } from '@/app/routes';
import { PAGE_SIZE_OPTIONS, Pagination } from '@/components/Pagination';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { VisitTodayTick } from '@/components/VisitTodayTick';
import { VisitTimeline } from '@/components/VisitTimeline';
import { DateInput } from '@/components/DateInput';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';

function formatIop(iop: Visit['iop']): string {
  if (!iop) return '-';
  if (typeof iop === 'object') {
    const r = iop.r?.trim() || '-';
    const l = iop.l?.trim() || '-';
    if (r === '-' && l === '-') return '-';
    return `R ${r} / L ${l}`;
  }
  return String(iop);
}

type PatientTab = 'visits' | 'diseases' | 'charts' | 'progress' | 'images' | 'whatsapp';

const PATIENT_TABS: ReadonlyArray<TabItem<PatientTab>> = (
  ['visits', 'diseases', 'charts', 'progress', 'images', 'whatsapp'] as const
).map((key) => ({ key, label: PATIENT_TAB_LABELS[key] }));

const VISIT_VIEWS: ReadonlyArray<TabItem<'list' | 'timeline'>> = [
  { key: 'list', label: 'List' },
  { key: 'timeline', label: 'All visits by section' },
];

type Props = {
  patientId: string;
  tab: string;
  onNavigate: (to: string) => void;
};

export function PatientDetail({ patientId, tab, onNavigate }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { forms: DISEASE_FORMS } = useDiseaseForms();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [assessments, setAssessments] = useState<DiseaseAssessment[]>([]);
  const [logForm, setLogForm] = useState({
    logDate: localClinicDate(),
    rightEye: '',
    leftEye: '',
    rightScore: '' as string,
    leftScore: '' as string,
  });
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [filterFormType, setFilterFormType] = useState('');
  const [newFormType, setNewFormType] = useState('');
  const [visitedToday, setVisitedToday] = useState(false);
  const [togglingVisit, setTogglingVisit] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(
    PAGE_SIZE_OPTIONS[0]
  );
  const [listTotal, setListTotal] = useState(0);
  const [tabLoading, setTabLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [visitView, setVisitView] = useState<'list' | 'timeline'>('list');
  const today = localClinicDate();

  const active: PatientTab = PATIENT_TABS.some((t) => t.key === tab)
    ? (tab as PatientTab)
    : 'visits';

  useEffect(() => {
    setNewFormType('');
    setFilterFormType('');
    setPage(1);
  }, [patientId]);

  useEffect(() => {
    setPage(1);
  }, [active, filterFormType]);

  const loadPatient = useCallback(async () => {
    try {
      const p = await api.getPatient(patientId, today);
      setPatient(p);
      setVisitedToday(Boolean(p.visitedToday));
      setLoadFailed(false);
    } catch (err) {
      setPatient(null);
      setLoadFailed(true);
      toast.error(errorMessage(err, 'Failed to load patient'));
    }
  }, [patientId, today, toast]);

  const fetchTabList = useCallback(async () => {
    if (active === 'charts' || active === 'whatsapp') return;
    setTabLoading(true);
    try {
      if (active === 'visits') {
        const res = await api.listVisits(patientId, page, pageSize);
        if (res.total > 0 && res.visits.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        setVisits(res.visits);
        setListTotal(res.total);
      } else if (active === 'diseases') {
        const formType = filterFormType || undefined;
        const res = await api.listDiseaseAssessments(patientId, formType, page, pageSize);
        if (res.total > 0 && res.assessments.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        setAssessments(res.assessments);
        setListTotal(res.total);
      } else if (active === 'progress') {
        const res = await api.listProgress(patientId, page, pageSize);
        if (res.total > 0 && res.logs.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        setLogs(res.logs);
        setListTotal(res.total);
      } else if (active === 'images') {
        const res = await api.listAttachments(patientId, page, pageSize);
        if (res.total > 0 && res.attachments.length === 0 && page > 1) {
          setPage(1);
          return;
        }
        setFiles(res.attachments);
        setListTotal(res.total);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load list'));
    } finally {
      setTabLoading(false);
    }
  }, [active, patientId, page, pageSize, filterFormType, toast]);

  async function toggleVisitedToday(next: boolean) {
    setTogglingVisit(true);
    try {
      await api.setAttendance(patientId, next, today);
      setVisitedToday(next);
      setPatient((p) => (p ? { ...p, visitedToday: next } : p));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update visit mark'));
    } finally {
      setTogglingVisit(false);
    }
  }

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  useEffect(() => {
    if (!patient) return;
    fetchTabList();
  }, [patient, fetchTabList]);

  const patientConditions = patient?.conditions || [];
  const availableForms = useMemo(() => {
    if (patientConditions.length === 0) return DISEASE_FORMS;
    const selected = DISEASE_FORMS.filter((f) => patientConditions.includes(f.id));
    return selected.length ? selected : DISEASE_FORMS;
  }, [patientConditions, DISEASE_FORMS]);

  useEffect(() => {
    if (availableForms.length === 0) {
      setNewFormType('');
      return;
    }
    const stillValid = availableForms.some((f) => f.id === newFormType);
    if (!stillValid) {
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
        logDate: localClinicDate(),
        rightEye: '',
        leftEye: '',
        rightScore: '',
        leftScore: '',
      });
      await fetchTabList();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save progress'));
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      await api.uploadAttachment(patientId, file);
      setCameraOpen(false);
      if (page === 1) {
        await fetchTabList();
      } else {
        setPage(1);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Upload failed'));
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

  if (!patient && !loadFailed) return <LoadingBlock label="Loading patient…" />;
  if (!patient) {
    return (
      <EmptyState
        title="Could not load this patient"
        hint="Check your connection or try again from the patients list."
        actionLabel="← Back to patients"
        onAction={() => onNavigate('/')}
      />
    );
  }

  const paginationProps = {
    total: listTotal,
    page,
    pageSize,
    disabled: tabLoading,
    onPageChange: setPage,
    onPageSizeChange: (n: number) => {
      setPageSize(n as (typeof PAGE_SIZE_OPTIONS)[number]);
      setPage(1);
    },
  };

  return (
    <>
      <div className="card">
        <div className="patient-header">
          <div>
            <h2 style={{ margin: 0 }}>{patient.name}</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              OPD {patient.opdAdNo || '-'} · {patient.age ?? '-'} yrs · {patient.gender || '-'} ·{' '}
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
            <div style={{ marginTop: '0.75rem' }}>
              <VisitTodayTick
                checked={visitedToday}
                disabled={togglingVisit}
                label={`Visited clinic today (${formatDate(today)})`}
                onChange={toggleVisitedToday}
              />
            </div>
          </div>
          <div className="patient-header-actions">
            <Button
              variant="secondary"

              onClick={() => onNavigate(`/patients/${patientId}/edit`)}
            >
              Edit details
            </Button>
            <Button
              variant="secondary"

              disabled={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                try {
                  const { downloadPatientProfilePdf } = await import('@/lib/patientPdf');
                  await downloadPatientProfilePdf(patient);
                } catch (err) {
                  toast.error(errorMessage(err, 'Could not create PDF'));
                } finally {
                  setPdfBusy(false);
                }
              }}
            >
              {pdfBusy ? 'Preparing PDF…' : 'Download full PDF'}
            </Button>
            <Button
              variant="danger-outline"

              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete patient?',
                  message: `Delete ${patient.name} (OPD ${patient.opdAdNo || '-'}) and all of their visits, assessments, progress notes and images? This cannot be undone.`,
                  confirmLabel: 'Delete patient',
                  danger: true,
                });
                if (!ok) return;
                try {
                  await api.deletePatient(patientId);
                  toast.success(`Patient “${patient.name}” deleted.`);
                  onNavigate('/');
                } catch (err) {
                  toast.error(errorMessage(err, 'Could not delete patient'));
                }
              }}
            >
              Delete patient
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        label="Patient sections"
        items={PATIENT_TABS}
        active={active}
        onChange={(key) => onNavigate(`/patients/${patientId}/${key}`)}
      />

      {active === 'visits' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>Eye screening forms</h3>
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                General eye check / findings form. Used when you need a fuller exam: diagnosis, IOP,
                contrast, etc. Optional - for a normal clinic day, use{' '}
                <strong>Visited today</strong> instead. One general visit record, not
                disease-specific.
              </p>
            </div>
            <Button onClick={() => onNavigate(`/patients/${patientId}/visits/new`)}>
              Add screening form
            </Button>
          </div>
          {listTotal > 0 && (
            <Tabs
              label="Screening forms view"
              items={VISIT_VIEWS}
              active={visitView}
              onChange={setVisitView}
            />
          )}
          {listTotal > 0 && visitView === 'timeline' ? (
            <VisitTimeline
              patientId={patientId}
              onEditVisit={(id) => onNavigate(`/patients/${patientId}/visits/${id}/edit`)}
            />
          ) : tabLoading && visits.length === 0 ? (
            <LoadingBlock label="Loading visits…" />
          ) : listTotal === 0 ? (
            <EmptyState
              title="No screening forms yet"
              hint="Mark Visited today for normal clinic days. Add a screening form only when you need full eye findings."
            />
          ) : (
            <>
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
                        <td>{formatDate(v.visitDate)}</td>
                        <td>{v.diagnosis || '-'}</td>
                        <td>{formatIop(v.iop)}</td>
                        <td className="row">
                          <Button
                            variant="secondary"

                            onClick={() => onNavigate(`/patients/${patientId}/visits/${v.id}/edit`)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger-outline"

                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Delete visit?',
                                message: 'Delete this visit? This cannot be undone.',
                                confirmLabel: 'Delete',
                                danger: true,
                              });
                              if (!ok) return;
                              try {
                                await api.deleteVisit(patientId, v.id);
                                toast.success('Visit deleted.');
                                await fetchTabList();
                              } catch (err) {
                                toast.error(errorMessage(err, 'Could not delete visit'));
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...paginationProps} />
            </>
          )}
        </div>
      )}

      {active === 'diseases' && (
        <>
          <div className="card">
            <h3>New assessment</h3>
            <p className="muted">
              Disease-specific forms (cataract, DR, ARMD, CME, and others). Fill a new assessment
              each review visit to track improvement. Use Visited today for ordinary attendance
              days, and Visits for a general eye screening exam.
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
              <Button
                disabled={!newFormType}
                onClick={() =>
                  onNavigate(
                    `/patients/${patientId}/diseases/${encodeURIComponent(newFormType)}/new`
                  )
                }
              >
                New assessment
              </Button>
            </div>
            <div className="check-grid" style={{ marginTop: '1rem' }}>
              {availableForms.map((f) => (
                <Button
                  key={f.id}

                  variant="secondary"
                  onClick={() =>
                    onNavigate(`/patients/${patientId}/diseases/${encodeURIComponent(f.id)}/new`)
                  }
                >
                  {f.shortTitle}
                </Button>
              ))}
            </div>
          </div>

          <div className="card">
            <div
              className="row"
              style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}
            >
              <h3 style={{ margin: 0 }}>Saved assessments</h3>
              <select value={filterFormType} onChange={(e) => setFilterFormType(e.target.value)}>
                <option value="">All forms</option>
                {DISEASE_FORMS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortTitle}
                  </option>
                ))}
              </select>
            </div>
            {tabLoading && assessments.length === 0 ? (
              <LoadingBlock label="Loading assessments…" />
            ) : listTotal === 0 ? (
              <p className="empty">No disease assessments yet.</p>
            ) : (
              <>
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
                      {assessments.map((a) => (
                        <tr key={a.id}>
                          <td>{formatDate(a.assessmentDate)}</td>
                          <td>{diseaseFormTitle(a.formType)}</td>
                          <td>{a.eye || '-'}</td>
                          <td className="row">
                            <Button
                              variant="secondary"

                              onClick={() =>
                                onNavigate(
                                  `/patients/${patientId}/diseases/${encodeURIComponent(a.formType)}/${a.id}/edit`
                                )
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger-outline"

                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Delete assessment?',
                                  message: 'Delete this assessment? This cannot be undone.',
                                  confirmLabel: 'Delete',
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await api.deleteDiseaseAssessment(patientId, a.id);
                                  toast.success('Assessment deleted.');
                                  await fetchTabList();
                                } catch (err) {
                                  toast.error(errorMessage(err, 'Could not delete assessment'));
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...paginationProps} />
              </>
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
                <DateInput
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
            <Button type="submit" style={{ marginTop: '0.75rem' }}>
              Add to timeline
            </Button>
          </form>

          <div className="card">
            <h3>Improvement timeline</h3>
            {tabLoading && logs.length === 0 ? (
              <LoadingBlock label="Loading progress…" />
            ) : listTotal === 0 ? (
              <p className="empty">No progress rows yet.</p>
            ) : (
              <>
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
                          <td>{formatDate(log.logDate)}</td>
                          <td>{log.rightEye || '-'}</td>
                          <td>{log.rightScore ?? '-'}</td>
                          <td>{log.leftEye || '-'}</td>
                          <td>{log.leftScore ?? '-'}</td>
                          <td>
                            <Button
                              variant="danger-outline"

                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Delete progress entry?',
                                  message: 'Delete this progress entry? This cannot be undone.',
                                  confirmLabel: 'Delete',
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await api.deleteProgress(patientId, log.id);
                                  toast.success('Progress entry deleted.');
                                  await fetchTabList();
                                } catch (err) {
                                  toast.error(errorMessage(err, 'Could not delete progress entry'));
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination {...paginationProps} />
              </>
            )}
          </div>
        </>
      )}

      {active === 'images' && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0 }}>Report images</h3>
            <div className="row">
              <Button disabled={uploading} onClick={() => setCameraOpen(true)}>
                Take photo
              </Button>
              <label
                className="btn secondary"
                style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? 'Saving…' : 'Upload image / PDF'}
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
            Use <strong>Take photo</strong> to open the device camera, capture a report picture,
            then save it to this patient.
          </p>
          {tabLoading && files.length === 0 ? (
            <LoadingBlock label="Loading images…" />
          ) : listTotal === 0 ? (
            <p className="empty">
              No files uploaded yet. Take a photo or upload a scanned image / PDF.
            </p>
          ) : (
            <>
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
                      <div className="muted">{formatDateTime(f.createdAt)}</div>
                      <Button
                        variant="danger-outline"

                        style={{ marginTop: '0.35rem' }}
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Delete file?',
                            message: 'Delete this file? This cannot be undone.',
                            confirmLabel: 'Delete',
                            danger: true,
                          });
                          if (!ok) return;
                          try {
                            await api.deleteAttachment(patientId, f.id);
                            toast.success('File deleted.');
                            await fetchTabList();
                          } catch (err) {
                            toast.error(errorMessage(err, 'Could not delete file'));
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination {...paginationProps} />
            </>
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
          busy={uploading}
          onPatientUpdated={(p) => setPatient(p)}
        />
      )}
    </>
  );
}
