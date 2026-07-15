const TOKEN_KEY = 'eye-clinic-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return getToken() === 'local-clinic';
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data as T;
}

export type Patient = {
  id: string;
  name: string;
  age: number | null;
  gender: string | null;
  registrationDate: string | null;
  opdAdNo: string | null;
  occupation: string | null;
  idNumber: string | null;
  address: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VisionData = {
  distance?: { rEye?: string; rPh?: string; lEye?: string; lPh?: string; cfs?: string; hm?: string; pl?: string };
  near?: { rEye?: string; rPh?: string; lEye?: string; lPh?: string };
};

export type ExamExternal = {
  headPosture?: string;
  foreheadFacialSymmetry?: string;
  eyebrows?: string;
  eyelids?: string;
  palpebralAperture?: string;
  lacrimalApparatus?: string;
  eyeball?: string;
};

export type InspectionData = {
  sclera?: string;
  pupilSize?: string;
  pupilShape?: string;
  pupillaryLightReflex?: string;
  eyelidPtosis?: string;
  nystagmus?: string;
  conjunctiva?: string;
  ocularMovements?: string;
  cornealSensation?: string;
};

export type SlitLampData = {
  anteriorSegment?: string;
  opticNerveHead?: string;
  ophthalmoscopyLens?: string;
};

export type CataractData = {
  rightEye?: boolean;
  leftEye?: boolean;
  nsGrade?: string;
  psc?: boolean;
  psx?: boolean;
  subluxed?: boolean;
  k1?: string;
  k2?: string;
  cyl?: string;
  cylAxis?: string;
  axialMm?: string;
  diopter?: string;
};

export type Visit = {
  id: string;
  patientId: string;
  visitDate: string;
  coComplaints: string | null;
  ocOther: string | null;
  familyHistory: string | null;
  examExternal: ExamExternal;
  vision: VisionData;
  inspection: InspectionData;
  slitLamp: SlitLampData;
  cataract: CataractData;
  ixHistory: string | null;
  diagnosis: string | null;
  iop: string | null;
  colorVision: string | null;
  visualField: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProgressLog = {
  id: string;
  patientId: string;
  logDate: string;
  rightEye: string | null;
  leftEye: string | null;
  createdAt: string;
};

export type Attachment = {
  id: string;
  patientId: string;
  visitId: string | null;
  relativePath: string;
  originalName: string;
  mimeType: string | null;
  createdAt: string;
  url: string;
};

export type SystemSettings = {
  backupFolder: string;
  lastBackupAt: string | null;
  hasPassword: boolean;
  cloudMode?: boolean;
  defaultBackupFolder?: string;
};

export type BackupInfo = {
  id: string;
  zipName: string;
  createdAt: string;
  size?: number;
};

export const api = {
  login: (password: string) =>
    request<{ ok: boolean; token: string }>('/api/system/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),

  getSettings: () => request<SystemSettings>('/api/system/settings'),

  updateSettings: (body: { backupFolder?: string; clinicPassword?: string }) =>
    request<SystemSettings>('/api/system/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  backup: () =>
    request<{ ok: boolean; zipName: string; lastBackupAt: string; size: number; downloadUrl: string }>(
      '/api/system/backup',
      { method: 'POST' }
    ),

  listBackups: () => request<BackupInfo[]>('/api/system/backups'),

  backupDownloadUrl: (id: string) => `/api/system/backups/${encodeURIComponent(id)}/download`,

  listPatients: (q = '') =>
    request<Patient[]>(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  recentVisits: () =>
    request<
      Array<{
        visit_id: string;
        visit_date: string;
        diagnosis: string | null;
        patient_id: string;
        patient_name: string;
        opd_ad_no: string | null;
      }>
    >('/api/patients/recent-visits'),

  getPatient: (id: string) => request<Patient>(`/api/patients/${id}`),

  createPatient: (body: Partial<Patient> & { name: string }) =>
    request<Patient>('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updatePatient: (id: string, body: Partial<Patient> & { name: string }) =>
    request<Patient>(`/api/patients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deletePatient: (id: string) =>
    request<{ ok: boolean }>(`/api/patients/${id}`, { method: 'DELETE' }),

  listVisits: (patientId: string) => request<Visit[]>(`/api/patients/${patientId}/visits`),

  getVisit: (patientId: string, visitId: string) =>
    request<Visit>(`/api/patients/${patientId}/visits/${visitId}`),

  createVisit: (patientId: string, body: Partial<Visit>) =>
    request<Visit>(`/api/patients/${patientId}/visits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateVisit: (patientId: string, visitId: string, body: Partial<Visit>) =>
    request<Visit>(`/api/patients/${patientId}/visits/${visitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteVisit: (patientId: string, visitId: string) =>
    request<{ ok: boolean }>(`/api/patients/${patientId}/visits/${visitId}`, { method: 'DELETE' }),

  listProgress: (patientId: string) =>
    request<ProgressLog[]>(`/api/patients/${patientId}/progress`),

  createProgress: (patientId: string, body: Partial<ProgressLog>) =>
    request<ProgressLog>(`/api/patients/${patientId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  updateProgress: (patientId: string, logId: string, body: Partial<ProgressLog>) =>
    request<ProgressLog>(`/api/patients/${patientId}/progress/${logId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  deleteProgress: (patientId: string, logId: string) =>
    request<{ ok: boolean }>(`/api/patients/${patientId}/progress/${logId}`, { method: 'DELETE' }),

  listAttachments: (patientId: string) =>
    request<Attachment[]>(`/api/patients/${patientId}/attachments`),

  uploadAttachment: async (patientId: string, file: File, visitId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (visitId) form.append('visitId', visitId);
    const res = await fetch(`/api/patients/${patientId}/attachments`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data as Attachment;
  },

  deleteAttachment: (patientId: string, attachmentId: string) =>
    request<{ ok: boolean }>(`/api/patients/${patientId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
};
