import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';

const router = Router({ mergeParams: true });

function now() {
  return new Date().toISOString();
}

function mapLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    logDate: row.log_date,
    rightEye: row.right_eye,
    leftEye: row.left_eye,
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
  const id = uuid();
  const ts = now();
  await db
    .prepare(
      `INSERT INTO progress_logs (id, patient_id, log_date, right_eye, left_eye, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      req.params.patientId,
      body.logDate || ts.slice(0, 10),
      body.rightEye || null,
      body.leftEye || null,
      ts
    );
  await db.prepare('UPDATE patients SET updated_at = ? WHERE id = ?').run(ts, req.params.patientId);
  res.status(201).json(mapLog(await db.prepare('SELECT * FROM progress_logs WHERE id = ?').get(id)));
});

router.put('/:logId', async (req, res) => {
  const existing = await db
    .prepare('SELECT * FROM progress_logs WHERE id = ? AND patient_id = ?')
    .get(req.params.logId, req.params.patientId);
  if (!existing) return res.status(404).json({ error: 'Progress log not found' });
  const body = req.body || {};
  await db
    .prepare(`UPDATE progress_logs SET log_date = ?, right_eye = ?, left_eye = ? WHERE id = ?`)
    .run(
      body.logDate || existing.log_date,
      body.rightEye ?? existing.right_eye,
      body.leftEye ?? existing.left_eye,
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
