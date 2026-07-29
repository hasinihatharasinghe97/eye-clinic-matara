import { Router } from 'express';
import db from '../db.js';

const router = Router({ mergeParams: true });

const BUILTIN_FORM_TYPES = new Set([
  'cataract',
  'diabetic_retinopathy',
  'armd',
  'cme',
  'hypertensive_retinopathy',
  'cscr',
  'retinal_vascular_occlusive',
  'retinitis_pigmentosa',
  'hereditary_retinal_dystrophies',
  'macular_dystrophy',
  'retinal_degenerations',
  'retinopathy_of_prematurity',
]);

async function isValidFormType(formType) {
  if (!formType) return false;
  if (BUILTIN_FORM_TYPES.has(formType)) return true;
  const custom = await db
    .prepare('SELECT id FROM custom_disease_forms WHERE id = ?')
    .get(formType);
  return Boolean(custom);
}

function now() {
  return new Date().toISOString();
}

/** Store assessment dates as YYYY-MM-DD (same as other clinic records). */
function normalizeAssessmentDate(value, fallbackIso) {
  const raw = String(value || '').trim();
  if (!raw) return String(fallbackIso || now()).slice(0, 10);
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return String(fallbackIso || now()).slice(0, 10);
}

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    formType: row.form_type,
    assessmentDate: row.assessment_date,
    eye: row.eye,
    data: parseJson(row.data, {}),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res) => {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const formType = String(req.query.formType || '').trim();
  let rows;
  if (formType) {
    rows = await db
      .prepare(
        `SELECT * FROM disease_assessments
         WHERE patient_id = ? AND form_type = ?
         ORDER BY assessment_date DESC, created_at DESC`
      )
      .all(req.params.patientId, formType);
  } else {
    rows = await db
      .prepare(
        `SELECT * FROM disease_assessments
         WHERE patient_id = ?
         ORDER BY assessment_date DESC, created_at DESC`
      )
      .all(req.params.patientId);
  }
  res.json(rows.map(mapRow));
});

router.get('/:assessmentId', async (req, res) => {
  const row = await db
    .prepare('SELECT * FROM disease_assessments WHERE id = ? AND patient_id = ?')
    .get(req.params.assessmentId, req.params.patientId);
  if (!row) return res.status(404).json({ error: 'Assessment not found' });
  res.json(mapRow(row));
});

router.post('/', async (req, res) => {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const body = req.body || {};
  const formType = String(body.formType || '').trim();
  if (!(await isValidFormType(formType))) {
    return res.status(400).json({ error: 'Invalid form type' });
  }

  const ts = now();
  const assessmentDate = normalizeAssessmentDate(body.assessmentDate, ts);
  const result = await db
    .prepare(
      `INSERT INTO disease_assessments (
        patient_id, form_type, assessment_date, eye, \`data\`, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.patientId,
      formType,
      assessmentDate,
      body.eye || null,
      JSON.stringify(body.data || {}),
      body.notes || null,
      ts,
      ts
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  const row = await db
    .prepare('SELECT * FROM disease_assessments WHERE id = ?')
    .get(result.insertId);
  res.status(201).json(mapRow(row));
});

router.put('/:assessmentId', async (req, res) => {
  const existing = await db
    .prepare('SELECT * FROM disease_assessments WHERE id = ? AND patient_id = ?')
    .get(req.params.assessmentId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Assessment not found' });

  const body = req.body || {};
  const ts = now();
  await db
    .prepare(
      `UPDATE disease_assessments SET
        assessment_date = ?, eye = ?, \`data\` = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      normalizeAssessmentDate(body.assessmentDate ?? existing.assessment_date, ts),
      body.eye ?? existing.eye,
      JSON.stringify(body.data ?? parseJson(existing.data, {})),
      body.notes ?? existing.notes,
      ts,
      req.params.assessmentId
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  const row = await db
    .prepare('SELECT * FROM disease_assessments WHERE id = ?')
    .get(req.params.assessmentId);
  res.json(mapRow(row));
});

router.delete('/:assessmentId', async (req, res) => {
  const existing = await db
    .prepare('SELECT id FROM disease_assessments WHERE id = ? AND patient_id = ?')
    .get(req.params.assessmentId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Assessment not found' });
  await db.prepare('DELETE FROM disease_assessments WHERE id = ?').run(req.params.assessmentId);
  res.json({ ok: true });
});

export default router;
