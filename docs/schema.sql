-- Postgres-compatible schema for future Supabase migration
-- Mirrors the local SQLite structure used by the Eye Clinic system

CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  registration_date TEXT,
  opd_ad_no TEXT,
  occupation TEXT,
  id_number TEXT,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_opd ON patients(opd_ad_no);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_id_number ON patients(id_number);

CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date TEXT NOT NULL,
  co_complaints TEXT,
  oc_other TEXT,
  family_history TEXT,
  exam_external JSONB,
  vision JSONB,
  inspection JSONB,
  slit_lamp JSONB,
  cataract JSONB,
  ix_history TEXT,
  diagnosis TEXT,
  iop TEXT,
  color_vision TEXT,
  visual_field TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_visits_patient ON visits(patient_id);
CREATE INDEX idx_visits_date ON visits(visit_date);

CREATE TABLE progress_logs (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  right_eye TEXT,
  left_eye TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_progress_patient ON progress_logs(patient_id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id TEXT REFERENCES visits(id) ON DELETE SET NULL,
  relative_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_attachments_patient ON attachments(patient_id);
