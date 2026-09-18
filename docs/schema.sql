-- Nethraloka Ayurvedic Eye Clinic — MySQL schema + query helpers
-- Tables are also created/updated automatically by server/src/db.js on startup.
--
-- Design:
--   - patients.id          = internal key used by the app (stable FK)
--   - patients.opd_ad_no   = clinic OPD number (human key for SQL reports)
--   - Related tables keep patient_id AND a copied opd_ad_no for easy joins/filters
--
-- Prefer the v_* views below when exploring data in DBeaver / MySQL Workbench.

CREATE DATABASE IF NOT EXISTS eye_clinic
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE eye_clinic;

-- ---------------------------------------------------------------------------
-- Core tables (simplified reference — runtime may add columns via migration)
-- ---------------------------------------------------------------------------

-- patients: one row per person (lookup by opd_ad_no)
-- clinic_attendance: “visited clinic that day” ticks
-- disease_assessments: disease monitoring forms (New assessment)
-- progress_logs, attachments: linked to the same patient / OPD
-- visits: legacy screening forms (no longer used in the app UI)

-- ---------------------------------------------------------------------------
-- Handy views (created on app startup too)
-- ---------------------------------------------------------------------------
-- v_patients
-- v_attendance
-- v_disease_assessments
-- v_progress_logs
-- v_attachments
-- v_patient_summary
-- v_visits (legacy)

-- ---------------------------------------------------------------------------
-- Example queries (use OPD number)
-- ---------------------------------------------------------------------------

-- Patient master by OPD
-- SELECT * FROM v_patients WHERE opd_ad_no = 'OPD-123';

-- Everything for one OPD (attendance + disease assessments)
-- SELECT 'attendance' AS kind, visit_date AS the_date, NULL AS detail
-- FROM v_attendance WHERE opd_ad_no = 'OPD-123'
-- UNION ALL
-- SELECT 'disease', assessment_date, form_type FROM v_disease_assessments WHERE opd_ad_no = 'OPD-123'
-- ORDER BY the_date DESC;

-- Who visited the clinic today
-- SELECT opd_ad_no, patient_name, phone
-- FROM v_attendance
-- WHERE visit_date = CURDATE()
-- ORDER BY patient_name;

-- Join attendance to patient details explicitly by OPD
-- SELECT p.*, a.visit_date
-- FROM patients p
-- JOIN clinic_attendance a ON a.opd_ad_no = p.opd_ad_no
-- WHERE p.opd_ad_no = 'OPD-123';

-- Join disease assessments by OPD
-- SELECT p.opd_ad_no, p.name, d.assessment_date, d.form_type, d.eye
-- FROM patients p
-- JOIN disease_assessments d ON d.opd_ad_no = p.opd_ad_no
-- WHERE p.opd_ad_no = 'OPD-123'
-- ORDER BY d.assessment_date DESC;

-- Patient summary counts
-- SELECT * FROM v_patient_summary WHERE opd_ad_no = 'OPD-123';
-- SELECT * FROM v_patient_summary ORDER BY last_attendance_date DESC LIMIT 50;

-- Search patient then pull related rows
-- SET @opd := (SELECT opd_ad_no FROM patients WHERE name LIKE '%Silva%' LIMIT 1);
-- SELECT * FROM v_attendance WHERE opd_ad_no = @opd;
-- SELECT * FROM v_disease_assessments WHERE opd_ad_no = @opd;
-- SELECT * FROM v_attachments WHERE opd_ad_no = @opd;
