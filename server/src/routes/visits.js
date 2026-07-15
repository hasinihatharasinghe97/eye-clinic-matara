import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router({ mergeParams: true });

function now() {
  return new Date().toISOString();
}

function jsonOrNull(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapVisit(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    visitDate: row.visit_date,
    coComplaints: row.co_complaints,
    ocOther: row.oc_other,
    familyHistory: row.family_history,
    examExternal: parseJson(row.exam_external, {}),
    vision: parseJson(row.vision, {}),
    inspection: parseJson(row.inspection, {}),
    slitLamp: parseJson(row.slit_lamp, {}),
    cataract: parseJson(row.cataract, {}),
    ixHistory: row.ix_history,
    diagnosis: row.diagnosis,
    iop: row.iop,
    colorVision: row.color_vision,
    visualField: row.visual_field,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensurePatient(patientId) {
  return db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
}

router.get('/', async (req, res) => {
  if (!(await ensurePatient(req.params.patientId))) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const rows = await db
    .prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC, created_at DESC')
    .all(req.params.patientId);
  res.json(rows.map(mapVisit));
});

router.get('/:visitId', async (req, res) => {
  const row = await db
    .prepare('SELECT * FROM visits WHERE id = ? AND patient_id = ?')
    .get(req.params.visitId, req.params.patientId);
  if (!row) return res.status(404).json({ error: 'Visit not found' });
  res.json(mapVisit(row));
});

router.post('/', async (req, res) => {
  if (!(await ensurePatient(req.params.patientId))) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const body = req.body || {};
  const id = uuid();
  const ts = now();
  await db
    .prepare(
      `INSERT INTO visits (
      id, patient_id, visit_date, co_complaints, oc_other, family_history,
      exam_external, vision, inspection, slit_lamp, cataract, ix_history,
      diagnosis, iop, color_vision, visual_field, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      req.params.patientId,
      body.visitDate || ts.slice(0, 10),
      body.coComplaints || null,
      body.ocOther || null,
      body.familyHistory || null,
      jsonOrNull(body.examExternal ?? {}),
      jsonOrNull(body.vision ?? {}),
      jsonOrNull(body.inspection ?? {}),
      jsonOrNull(body.slitLamp ?? {}),
      jsonOrNull(body.cataract ?? {}),
      body.ixHistory || null,
      body.diagnosis || null,
      body.iop || null,
      body.colorVision || null,
      body.visualField || null,
      body.notes || null,
      ts,
      ts
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  res.status(201).json(mapVisit(await db.prepare('SELECT * FROM visits WHERE id = ?').get(id)));
});

router.put('/:visitId', async (req, res) => {
  const existing = await db
    .prepare('SELECT * FROM visits WHERE id = ? AND patient_id = ?')
    .get(req.params.visitId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Visit not found' });
  const body = req.body || {};
  const ts = now();
  await db
    .prepare(
      `UPDATE visits SET
      visit_date = ?, co_complaints = ?, oc_other = ?, family_history = ?,
      exam_external = ?, vision = ?, inspection = ?, slit_lamp = ?, cataract = ?,
      ix_history = ?, diagnosis = ?, iop = ?, color_vision = ?, visual_field = ?,
      notes = ?, updated_at = ?
     WHERE id = ?`
    )
    .run(
      body.visitDate || existing.visit_date,
      body.coComplaints ?? existing.co_complaints,
      body.ocOther ?? existing.oc_other,
      body.familyHistory ?? existing.family_history,
      jsonOrNull(body.examExternal ?? parseJson(existing.exam_external, {})),
      jsonOrNull(body.vision ?? parseJson(existing.vision, {})),
      jsonOrNull(body.inspection ?? parseJson(existing.inspection, {})),
      jsonOrNull(body.slitLamp ?? parseJson(existing.slit_lamp, {})),
      jsonOrNull(body.cataract ?? parseJson(existing.cataract, {})),
      body.ixHistory ?? existing.ix_history,
      body.diagnosis ?? existing.diagnosis,
      body.iop ?? existing.iop,
      body.colorVision ?? existing.color_vision,
      body.visualField ?? existing.visual_field,
      body.notes ?? existing.notes,
      ts,
      req.params.visitId
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  res.json(mapVisit(await db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.visitId)));
});

router.delete('/:visitId', async (req, res) => {
  const existing = await db
    .prepare('SELECT id FROM visits WHERE id = ? AND patient_id = ?')
    .get(req.params.visitId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Visit not found' });
  await db.prepare('DELETE FROM visits WHERE id = ?').run(req.params.visitId);
  res.json({ ok: true });
});

export default router;
