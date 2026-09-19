import { Router } from 'express';
import db, { getPatientOpd } from '../db.js';
import { normalizeClinicDate, nowClinic } from '../clinicDate.js';

const router = Router({ mergeParams: true });

function now() {
  return nowClinic();
}

/** Coerce MySQL DATE / string / Date into YYYY-MM-DD for comparisons. */
function asDateKey(value) {
  return normalizeClinicDate(value, new Date(0));
}

router.get('/', async (req, res) => {
  try {
    const patient = await db
      .prepare('SELECT id FROM patients WHERE id = ?')
      .get(req.params.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const rows = await db
      .prepare(
        `SELECT visit_date, created_at, opd_ad_no
         FROM clinic_attendance
         WHERE patient_id = ?
         ORDER BY visit_date DESC
         LIMIT 90`
      )
      .all(req.params.patientId);

    const onDate = normalizeClinicDate(req.query.onDate);
    const visitedOnDate = rows.some((r) => asDateKey(r.visit_date) === onDate);

    res.json({
      onDate,
      visitedToday: visitedOnDate,
      dates: rows.map((r) => ({
        date: asDateKey(r.visit_date),
        createdAt: r.created_at,
        opdAdNo: r.opd_ad_no ?? null,
      })),
    });
  } catch (err) {
    console.error('[attendance] list failed:', err);
    res.status(500).json({ error: err.message || 'Could not load attendance' });
  }
});

router.put('/', async (req, res) => {
  try {
    const patient = await db
      .prepare('SELECT id FROM patients WHERE id = ?')
      .get(req.params.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const onDate = normalizeClinicDate(req.body?.date || req.body?.onDate);
    const visited = Boolean(req.body?.visited);
    const ts = now();
    const opdAdNo = await getPatientOpd(req.params.patientId);
    const patientId = Number(req.params.patientId);

    if (visited) {
      await db
        .prepare(
          `INSERT INTO clinic_attendance (patient_id, opd_ad_no, visit_date, created_at)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE opd_ad_no = VALUES(opd_ad_no)`
        )
        .run(patientId, opdAdNo, onDate, ts);
      await db
        .prepare('UPDATE patients SET updated_at = ? WHERE id = ?')
        .run(ts, patientId);
    } else {
      await db
        .prepare('DELETE FROM clinic_attendance WHERE patient_id = ? AND visit_date = ?')
        .run(patientId, onDate);
    }

    res.json({
      ok: true,
      patientId: req.params.patientId,
      opdAdNo,
      date: onDate,
      visited,
    });
  } catch (err) {
    console.error('[attendance] update failed:', err);
    res.status(500).json({ error: err.message || 'Could not update attendance' });
  }
});

export default router;
