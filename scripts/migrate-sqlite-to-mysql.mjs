/**
 * Import into MySQL from:
 *   - a snapshot.json (from `npm run export:snapshot` or Backup ZIP), or
 *   - legacy local SQLite data/patients.db
 *
 * IDs are remapped to MySQL AUTO_INCREMENT integers.
 * MYSQL_* env vars point at the *destination* database (local or HeatWave).
 *
 * HeatWave example (PowerShell):
 *   $env:MYSQL_HOST="<NLB public IP>"
 *   $env:MYSQL_PORT="3306"
 *   $env:MYSQL_USER="clinicadmin"
 *   $env:MYSQL_PASSWORD="..."
 *   $env:MYSQL_DATABASE="eye_clinic"
 *   $env:MYSQL_SSL="1"
 *   $env:STORE_FILES_IN_DB="1"
 *   node scripts/migrate-sqlite-to-mysql.mjs .\data\backups\snapshot.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'patients.db');
const defaultUploadsDir = path.join(dataDir, 'uploads');

const STORE_FILES =
  process.env.STORE_FILES_IN_DB === '1' || process.env.STORE_FILES_IN_DB === 'true';

function loadFromSqlite(filePath) {
  const local = new DatabaseSync(filePath);
  const tables = {
    patients: local.prepare('SELECT * FROM patients').all(),
    visits: local.prepare('SELECT * FROM visits').all(),
    progress_logs: local.prepare('SELECT * FROM progress_logs').all(),
    attachments: local.prepare('SELECT * FROM attachments').all(),
    disease_assessments: (() => {
      try {
        return local.prepare('SELECT * FROM disease_assessments').all();
      } catch {
        return [];
      }
    })(),
    custom_disease_forms: [],
  };
  local.close();
  return tables;
}

function loadFromSnapshot(filePath) {
  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    patients: snap.patients || [],
    visits: snap.visits || [],
    progress_logs: snap.progress_logs || [],
    attachments: snap.attachments || [],
    disease_assessments: snap.disease_assessments || [],
    clinic_attendance: snap.clinic_attendance || [],
    custom_disease_forms: snap.custom_disease_forms || [],
  };
}

const argPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
let data;
let uploadsDir = defaultUploadsDir;
if (argPath && argPath.endsWith('.json') && fs.existsSync(argPath)) {
  console.log(`Reading snapshot: ${argPath}`);
  data = loadFromSnapshot(argPath);
  const beside = path.join(path.dirname(argPath), 'uploads');
  if (fs.existsSync(beside)) uploadsDir = beside;
} else if (fs.existsSync(dbPath)) {
  console.log(`Reading local SQLite: ${dbPath}`);
  data = loadFromSqlite(dbPath);
} else {
  console.error(
    `No source found. Expected ${dbPath} or pass a snapshot.json path as the first argument.`
  );
  console.error('Tip: run  npm run export:snapshot  against your local MySQL first.');
  process.exit(1);
}

const {
  patients,
  visits,
  progress_logs,
  attachments,
  disease_assessments,
  clinic_attendance = [],
  custom_disease_forms,
} = data;

console.log(
  `Found ${patients.length} patients, ${visits.length} visits, ${progress_logs.length} progress logs, ${attachments.length} attachments, ${disease_assessments.length} assessments, ${(clinic_attendance || []).length} attendance, ${custom_disease_forms.length} custom forms`
);

const { db } = await import('../server/src/db.js');
const { clinicTimestamp } = await import('../server/src/clinicDate.js');

const patientMap = new Map();
console.log('Writing patients…');
for (const row of patients) {
  const result = await db
    .prepare(
      `INSERT INTO patients (
        name, age, gender, registration_date, opd_ad_no, occupation,
        id_number, address, phone, conditions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.name,
      row.age ?? null,
      row.gender ?? null,
      row.registration_date ?? null,
      row.opd_ad_no ?? null,
      row.occupation ?? null,
      row.id_number ?? null,
      row.address ?? null,
      row.phone ?? null,
      row.conditions ?? null,
      row.created_at,
      row.updated_at
    );
  patientMap.set(String(row.id), result.insertId);
}

const visitMap = new Map();
console.log('Writing visits…');
for (const row of visits) {
  const patientId = patientMap.get(String(row.patient_id));
  if (!patientId) continue;
  const result = await db
    .prepare(
      `INSERT INTO visits (
        patient_id, visit_date, co_complaints, oc_other, family_history,
        exam_external, vision, inspection, slit_lamp, cataract, ix_history,
        diagnosis, iop, color_vision, visual_field, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      patientId,
      row.visit_date,
      row.co_complaints ?? null,
      row.oc_other ?? null,
      row.family_history ?? null,
      row.exam_external ?? null,
      row.vision ?? null,
      row.inspection ?? null,
      row.slit_lamp ?? null,
      row.cataract ?? null,
      row.ix_history ?? null,
      row.diagnosis ?? null,
      row.iop ?? null,
      row.color_vision ?? null,
      row.visual_field ?? null,
      row.notes ?? null,
      row.created_at,
      row.updated_at
    );
  visitMap.set(String(row.id), result.insertId);
}

console.log('Writing progress logs…');
for (const row of progress_logs) {
  const patientId = patientMap.get(String(row.patient_id));
  if (!patientId) continue;
  await db
    .prepare(
      `INSERT INTO progress_logs (
        patient_id, log_date, right_eye, left_eye, right_score, left_score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      patientId,
      row.log_date,
      row.right_eye ?? null,
      row.left_eye ?? null,
      row.right_score ?? null,
      row.left_score ?? null,
      row.created_at
    );
}

console.log('Writing attachments metadata…');
for (const row of attachments) {
  const patientId = patientMap.get(String(row.patient_id));
  if (!patientId) continue;
  const visitId = row.visit_id ? visitMap.get(String(row.visit_id)) ?? null : null;
  await db
    .prepare(
      `INSERT INTO attachments (
        patient_id, visit_id, relative_path, original_name, mime_type, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      patientId,
      visitId,
      row.relative_path,
      row.original_name,
      row.mime_type ?? null,
      row.created_at
    );
}

console.log('Writing disease assessments…');
for (const row of disease_assessments) {
  const patientId = patientMap.get(String(row.patient_id));
  if (!patientId) continue;
  await db
    .prepare(
      `INSERT INTO disease_assessments (
        patient_id, form_type, assessment_date, eye, \`data\`, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      patientId,
      row.form_type,
      row.assessment_date,
      row.eye ?? null,
      row.data ?? null,
      row.notes ?? null,
      row.created_at,
      row.updated_at
    );
}

if ((clinic_attendance || []).length) {
  console.log('Writing clinic attendance…');
  for (const row of clinic_attendance) {
    const patientId = patientMap.get(String(row.patient_id));
    if (!patientId) continue;
    await db
      .prepare(
        `INSERT IGNORE INTO clinic_attendance (patient_id, visit_date, created_at)
         VALUES (?, ?, ?)`
      )
      .run(patientId, row.visit_date, row.created_at ?? clinicTimestamp());
  }
}

if (custom_disease_forms.length) {
  console.log('Writing custom disease forms…');
  for (const row of custom_disease_forms) {
    await db
      .prepare(
        `INSERT INTO custom_disease_forms (
          id, title, short_title, fields, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           short_title = VALUES(short_title),
           fields = VALUES(fields),
           updated_at = VALUES(updated_at)`
      )
      .run(
        row.id,
        row.title,
        row.short_title ?? row.title,
        row.fields ?? '[]',
        row.created_at ?? clinicTimestamp(),
        row.updated_at ?? clinicTimestamp()
      );
  }
}

if (STORE_FILES && fs.existsSync(uploadsDir)) {
  console.log(`Uploading attachment files into MySQL from ${uploadsDir}…`);
  let n = 0;
  for (const row of attachments) {
    const full = path.join(uploadsDir, row.relative_path);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full);
    await db
      .prepare(
        `INSERT INTO attachment_files (relative_path, content) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE content = VALUES(content)`
      )
      .run(row.relative_path, content);
    n += 1;
  }
  console.log(`Stored ${n} file(s) in attachment_files.`);
} else if (STORE_FILES) {
  console.log(
    `STORE_FILES_IN_DB=1 but no uploads folder found at ${uploadsDir} — attachment metadata only.`
  );
} else if (fs.existsSync(uploadsDir)) {
  console.log(
    'Leaving upload files on disk (set STORE_FILES_IN_DB=1 to copy them into MySQL).'
  );
}

console.log('Migration complete (IDs remapped to AUTO_INCREMENT).');
console.log('Start the app with the same MYSQL_* environment variables.');
process.exit(0);
