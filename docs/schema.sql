-- MySQL schema for the Eye Clinic Patient System
-- Tables are also created automatically by server/src/db.js on startup.

CREATE DATABASE IF NOT EXISTS eye_clinic
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE eye_clinic;

CREATE TABLE IF NOT EXISTS patients (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age INT NULL,
  gender VARCHAR(32) NULL,
  registration_date VARCHAR(32) NULL,
  opd_ad_no VARCHAR(128) NULL,
  occupation VARCHAR(255) NULL,
  id_number VARCHAR(128) NULL,
  address TEXT NULL,
  phone VARCHAR(64) NULL,
  conditions TEXT NULL,
  medicines_sent TEXT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_patients_name ON patients(name);
CREATE INDEX idx_patients_opd ON patients(opd_ad_no);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_id_number ON patients(id_number);

CREATE TABLE IF NOT EXISTS visits (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  visit_date VARCHAR(32) NOT NULL,
  co_complaints TEXT NULL,
  oc_other TEXT NULL,
  family_history TEXT NULL,
  exam_external TEXT NULL,
  vision TEXT NULL,
  inspection TEXT NULL,
  slit_lamp TEXT NULL,
  cataract TEXT NULL,
  ix_history TEXT NULL,
  diagnosis TEXT NULL,
  iop TEXT NULL,
  color_vision TEXT NULL,
  visual_field TEXT NULL,
  notes TEXT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  CONSTRAINT fk_visits_patient
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_visits_patient ON visits(patient_id);
CREATE INDEX idx_visits_date ON visits(visit_date);

CREATE TABLE IF NOT EXISTS progress_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  log_date VARCHAR(32) NOT NULL,
  right_eye TEXT NULL,
  left_eye TEXT NULL,
  right_score DOUBLE NULL,
  left_score DOUBLE NULL,
  created_at VARCHAR(64) NOT NULL,
  CONSTRAINT fk_progress_patient
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_progress_patient ON progress_logs(patient_id);

CREATE TABLE IF NOT EXISTS attachments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  visit_id INT NULL,
  relative_path VARCHAR(512) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NULL,
  created_at VARCHAR(64) NOT NULL,
  CONSTRAINT fk_attachments_patient
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_visit
    FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_attachments_patient ON attachments(patient_id);

CREATE TABLE IF NOT EXISTS attachment_files (
  relative_path VARCHAR(512) PRIMARY KEY,
  content LONGBLOB NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_archives (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  zip_name VARCHAR(255) NOT NULL,
  content LONGBLOB NOT NULL,
  created_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS disease_assessments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  form_type VARCHAR(128) NOT NULL,
  assessment_date VARCHAR(32) NOT NULL,
  eye VARCHAR(16) NULL,
  `data` LONGTEXT NULL,
  notes TEXT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  CONSTRAINT fk_disease_patient
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_disease_assessments_patient ON disease_assessments(patient_id);
CREATE INDEX idx_disease_assessments_type ON disease_assessments(form_type);

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(128) PRIMARY KEY,
  value LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_disease_forms (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  short_title VARCHAR(255) NOT NULL,
  fields LONGTEXT NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
