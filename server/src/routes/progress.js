import { Router } from 'express';
import db, { getPatientOpd } from '../db.js';
import { clinicCalendarDate, normalizeClinicDate, nowClinic } from '../clinicDate.js';

const router = Router({ mergeParams: true });

function now() {
  return nowClinic();
}

function toScore(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, n));
}

function mapLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    opdAdNo: row.opd_ad_no ?? null,
    logDate: row.log_date,
    rightEye: row.right_eye,
    leftEye: row.left_eye,
    rightScore: row.right_score ?? null,
    leftScore: row.left_score ?? null,
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res) => {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const rows = await db
    .prepare('SELECT * FROM progress_logs WHERE patient_id = ? ORDER BY log_date DESC, created_at DESC')
    .all(req.params.patientId);
  res.json(rows.map(mapLog));
});

router.post('/', async (req, res) => {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  const body = req.body || {};
  const ts = now();
  const opdAdNo = await getPatientOpd(req.params.patientId);
  const result = await db
    .prepare(
      `INSERT INTO progress_logs (
        patient_id, opd_ad_no, log_date, right_eye, left_eye, right_score, left_score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.params.patientId,
      opdAdNo,
      body.logDate ? normalizeClinicDate(body.logDate) : clinicCalendarDate(),
      body.rightEye || null,
      body.leftEye || null,
      toScore(body.rightScore),
      toScore(body.leftScore),
      ts
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  res
    .status(201)
    .json(mapLog(await db.prepare('SELECT * FROM progress_logs WHERE id = ?').get(result.insertId)));
});

router.put('/:logId', async (req, res) => {
  const existing = await db
    .prepare('SELECT * FROM progress_logs WHERE id = ? AND patient_id = ?')
    .get(req.params.logId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Progress log not found' });
  const body = req.body || {};
  await db
    .prepare(
      `UPDATE progress_logs SET
        log_date = ?, right_eye = ?, left_eye = ?, right_score = ?, left_score = ?
       WHERE id = ?`
    )
    .run(
      body.logDate ? normalizeClinicDate(body.logDate) : existing.log_date,
      body.rightEye ?? existing.right_eye,
      body.leftEye ?? existing.left_eye,
      body.rightScore !== undefined ? toScore(body.rightScore) : existing.right_score,
      body.leftScore !== undefined ? toScore(body.leftScore) : existing.left_score,
      req.params.logId
    );
  res.json(mapLog(await db.prepare('SELECT * FROM progress_logs WHERE id = ?').get(req.params.logId)));
});

router.delete('/:logId', async (req, res) => {
  const existing = await db
    .prepare('SELECT id FROM progress_logs WHERE id = ? AND patient_id = ?')
    .get(req.params.logId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Progress log not found' });
  await db.prepare('DELETE FROM progress_logs WHERE id = ?').run(req.params.logId);
  res.json({ ok: true });
});

export default router;
