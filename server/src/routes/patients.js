import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import db, { UPLOADS_DIR, IS_CLOUD, deleteUploadFile, syncOpdToRelatedTables } from '../db.js';
import { normalizeClinicDate, clinicCalendarDate, nowClinic } from '../clinicDate.js';
import { getPatientCharts } from './stats.js';
import attendanceRouter from './attendance.js';

const router = Router();

function now() {
  return nowClinic();
}

function parseConditions(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Medicine PDF numbers 1–200 already sent to this patient. */
function parseMedicinesSent(value) {
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const set = new Set();
  for (const item of list) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 200) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

function mapPatient(row, visitedToday = false) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    registrationDate: row.registration_date,
    opdAdNo: row.opd_ad_no,
    occupation: row.occupation,
    idNumber: row.id_number,
    address: row.address,
    phone: row.phone,
    conditions: parseConditions(row.conditions),
    medicinesSent: parseMedicinesSent(row.medicines_sent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    visitedToday: Boolean(visitedToday),
  };
}

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const onDate = normalizeClinicDate(req.query.onDate);
    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = await db
        .prepare(
          `SELECT p.*,
                  CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS visited_today
           FROM patients p
           LEFT JOIN clinic_attendance a
             ON a.patient_id = p.id AND a.visit_date = ?
           WHERE p.name LIKE ? OR p.opd_ad_no LIKE ? OR p.phone LIKE ? OR p.id_number LIKE ?
           ORDER BY visited_today DESC, p.updated_at DESC
           LIMIT 200`
        )
        .all(onDate, like, like, like, like);
    } else {
      rows = await db
        .prepare(
          `SELECT p.*,
                  CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS visited_today
           FROM patients p
           LEFT JOIN clinic_attendance a
             ON a.patient_id = p.id AND a.visit_date = ?
           ORDER BY visited_today DESC, p.updated_at DESC
           LIMIT 200`
        )
        .all(onDate);
    }
    res.json(rows.map((r) => mapPatient(r, r.visited_today)));
  } catch (err) {
    console.error('[patients] list failed:', err);
    res.status(500).json({ error: err.message || 'Could not load patients' });
  }
});

router.get('/recent-assessments', async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT a.id AS assessment_id, a.assessment_date, a.form_type, a.eye,
                p.id AS patient_id, p.name AS patient_name, p.opd_ad_no
         FROM disease_assessments a
         JOIN patients p ON p.id = a.patient_id
         ORDER BY a.assessment_date DESC, a.created_at DESC
         LIMIT 15`
      )
      .all();
    res.json(rows);
  } catch (err) {
    console.error('[patients] recent-assessments failed:', err);
    res.status(500).json({ error: err.message || 'Could not load recent assessments' });
  }
});

router.use('/:patientId/attendance', attendanceRouter);
router.get('/:id/charts', async (req, res) => {
  try {
    const data = await getPatientCharts(req.params.id);
    if (!data) return res.status(404).json({ error: 'Patient not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load charts' });
  }
});

router.get('/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Patient not found' });
  const onDate = normalizeClinicDate(req.query.onDate);
  const attendance = await db
    .prepare('SELECT id FROM clinic_attendance WHERE patient_id = ? AND visit_date = ?')
    .get(req.params.id, onDate);
  res.json(mapPatient(row, Boolean(attendance)));
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const ts = now();
  const conditions = Array.isArray(body.conditions) ? body.conditions : [];
  const result = await db
    .prepare(
      `INSERT INTO patients (
      name, age, gender, registration_date, opd_ad_no, occupation,
      id_number, address, phone, conditions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.name.trim(),
      body.age ?? null,
      body.gender || null,
      body.registrationDate ? normalizeClinicDate(body.registrationDate) : clinicCalendarDate(),
      body.opdAdNo || null,
      body.occupation || null,
      body.idNumber || null,
      body.address || null,
      body.phone || null,
      JSON.stringify(conditions),
      ts,
      ts
    );
  const row = await db.prepare('SELECT * FROM patients WHERE id = ?').get(result.insertId);
  res.status(201).json(mapPatient(row));
});

router.put('/:id', async (req, res) => {
  const existing = await db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found' });
  const body = req.body || {};
  if (!body.name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const ts = now();
  const conditions = Array.isArray(body.conditions)
    ? body.conditions
    : parseConditions(existing.conditions);
  await db
    .prepare(
      `UPDATE patients SET
      name = ?, age = ?, gender = ?, registration_date = ?, opd_ad_no = ?,
      occupation = ?, id_number = ?, address = ?, phone = ?, conditions = ?, updated_at = ?
     WHERE id = ?`
    )
    .run(
      body.name.trim(),
      body.age ?? null,
      body.gender || null,
      body.registrationDate
        ? normalizeClinicDate(body.registrationDate)
        : existing.registration_date,
      body.opdAdNo || null,
      body.occupation || null,
      body.idNumber || null,
      body.address || null,
      body.phone || null,
      JSON.stringify(conditions),
      ts,
      req.params.id
    );
  await syncOpdToRelatedTables(req.params.id, body.opdAdNo || null);
  const row = await db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  res.json(mapPatient(row));
});

router.put('/:id/medicines-sent', async (req, res) => {
  const existing = await db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found' });
  const medicinesSent = parseMedicinesSent(req.body?.medicinesSent);
  const ts = now();
  await db
    .prepare('UPDATE patients SET medicines_sent = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(medicinesSent), ts, req.params.id);
  const row = await db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  res.json(mapPatient(row));
});

router.delete('/:id', async (req, res) => {
  const existing = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient not found' });

  const attachments = await db
    .prepare('SELECT relative_path FROM attachments WHERE patient_id = ?')
    .all(req.params.id);
  for (const a of attachments) {
    await deleteUploadFile(a.relative_path);
  }
  if (!IS_CLOUD) {
    const dir = path.join(UPLOADS_DIR, String(req.params.id));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }

  await db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
