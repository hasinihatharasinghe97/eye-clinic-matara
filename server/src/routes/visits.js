import { Router } from 'express';
import db, { getPatientOpd } from '../db.js';
import { clinicCalendarDate, normalizeClinicDate, nowClinic } from '../clinicDate.js';

const router = Router({ mergeParams: true });

function now() {
  return nowClinic();
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

function asStoredText(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseIop(raw) {
  if (raw == null || raw === '') return { r: '', l: '' };
  if (typeof raw === 'object') {
    return { r: String(raw.r ?? ''), l: String(raw.l ?? '') };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('r' in parsed || 'l' in parsed)) {
      return { r: String(parsed.r ?? ''), l: String(parsed.l ?? '') };
    }
  } catch {
    /* legacy free-text IOP */
  }
  return { r: String(raw), l: '' };
}

function mapVisit(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    opdAdNo: row.opd_ad_no ?? null,
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
    iop: parseIop(row.iop),
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
  const ts = now();
  const opdAdNo = await getPatientOpd(req.params.patientId);
  const result = await db
    .prepare(
      `INSERT INTO visits (
      patient_id, opd_ad_no, visit_date, co_complaints, oc_other, family_history,
      exam_external, vision, inspection, slit_lamp, cataract, ix_history,
      diagnosis, iop, color_vision, visual_field, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.patientId,
      opdAdNo,
      body.visitDate ? normalizeClinicDate(body.visitDate) : clinicCalendarDate(),
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
      asStoredText(body.iop),
      body.colorVision || null,
      asStoredText(body.visualField),
      body.notes || null,
      ts,
      ts
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  res
    .status(201)
    .json(mapVisit(await db.prepare('SELECT * FROM visits WHERE id = ?').get(result.insertId)));
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
      body.visitDate ? normalizeClinicDate(body.visitDate) : existing.visit_date,
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
      body.iop !== undefined ? asStoredText(body.iop) : existing.iop,
      body.colorVision ?? existing.color_vision,
      body.visualField !== undefined ? asStoredText(body.visualField) : existing.visual_field,
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
