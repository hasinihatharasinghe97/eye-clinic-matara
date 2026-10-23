import { Router } from 'express';
import db from '../db.js';
import { clinicMonthKey, normalizeClinicDate, toClinicSortableDate } from '../clinicDate.js';
import { districtFromAddress, UNKNOWN_DISTRICT } from '../districts.js';
import {
  AGE_BANDS,
  ageBand,
  buildMonthlyActivity,
  extractAssessmentMetrics,
  extractVisitScreeningMetrics,
  monthKey,
  parseDiagnoses,
} from '../analytics.js';
import { parsePagination, paginationMeta } from '../pagination.js';

const router = Router();

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

/** Optional from/to for stats. Empty = all time (no truncation). */
function parseOptionalStatsRange(query = {}) {
  const rawFrom = String(query.fromDate || '').trim();
  const rawTo = String(query.toDate || '').trim();
  if (!rawFrom && !rawTo) return { fromDate: null, toDate: null };
  let fromDate = rawFrom ? normalizeClinicDate(rawFrom) : null;
  let toDate = rawTo ? normalizeClinicDate(rawTo) : null;
  if (fromDate && toDate && fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }
  return { fromDate, toDate };
}

function dayInRange(day, fromDate, toDate) {
  if (!fromDate && !toDate) return true;
  if (!day) return false;
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

const DAILY_SORT = {
  visitDate: 'a.visit_date',
  name: 'p.name',
  age: 'p.age',
  opdAdNo: 'p.opd_ad_no',
  address: 'p.address',
};

/** Patients who attended in a date range (Visited today ticks). */
router.get('/daily', async (req, res) => {
  try {
    const single = req.query.onDate ? normalizeClinicDate(req.query.onDate) : null;
    let fromDate = normalizeClinicDate(req.query.fromDate || single || undefined);
    let toDate = normalizeClinicDate(req.query.toDate || single || undefined);
    if (fromDate > toDate) {
      const tmp = fromDate;
      fromDate = toDate;
      toDate = tmp;
    }

    const { page, pageSize, offset } = parsePagination(req.query);
    const sortKey = DAILY_SORT[String(req.query.sortKey || '')] ? String(req.query.sortKey) : 'visitDate';
    const sortDir = String(req.query.sortDir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const sortCol = DAILY_SORT[sortKey];

    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM clinic_attendance a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.visit_date >= ? AND a.visit_date <= ?`
      )
      .get(fromDate, toDate);
    const total = Number(countRow?.total || 0);

    const rows = await db
      .prepare(
        `SELECT p.id, p.name, p.age, p.gender, p.opd_ad_no, p.address, p.phone,
                a.visit_date, a.created_at AS attended_at
         FROM clinic_attendance a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.visit_date >= ? AND a.visit_date <= ?
         ORDER BY ${sortCol} ${sortDir}, a.visit_date ASC, p.name ASC
         LIMIT ${pageSize} OFFSET ${offset}`
      )
      .all(fromDate, toDate);

    res.json({
      fromDate,
      toDate,
      onDate: fromDate === toDate ? fromDate : null,
      count: total,
      patients: rows.map((r) => ({
        id: String(r.id),
        name: r.name || '',
        age: r.age ?? null,
        gender: r.gender || null,
        opdAdNo: r.opd_ad_no || null,
        address: r.address || null,
        phone: r.phone || null,
        visitDate: r.visit_date,
        attendedAt: r.attended_at || null,
      })),
      ...paginationMeta(page, pageSize, total),
      sortKey,
      sortDir: sortDir === 'DESC' ? 'desc' : 'asc',
    });
  } catch (err) {
    console.error('[stats] daily failed:', err);
    res.status(500).json({ error: err.message || 'Could not load daily attendance' });
  }
});

/** Monthly report: distinct patients who attended in a month, by age group and district (from the address). */
router.get('/monthly', async (req, res) => {
  try {
    const raw = String(req.query.month || '').trim();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : clinicMonthKey();
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const fromDate = `${month}-01`;
    const toDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const rows = await db
      .prepare(
        `SELECT p.id, p.name, p.age, p.gender, p.opd_ad_no, p.address,
                COUNT(*) AS visit_days
         FROM clinic_attendance a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.visit_date >= ? AND a.visit_date <= ?
         GROUP BY p.id, p.name, p.age, p.gender, p.opd_ad_no, p.address
         ORDER BY p.name ASC`
      )
      .all(fromDate, toDate);

    const ageCounts = {};
    const districtCounts = {};
    const genderCounts = { Male: 0, Female: 0, 'Other / blank': 0 };
    let attendanceDays = 0;

    const patients = rows.map((r) => {
      const band = ageBand(r.age);
      const district = districtFromAddress(r.address);
      ageCounts[band] = (ageCounts[band] || 0) + 1;
      districtCounts[district] = (districtCounts[district] || 0) + 1;
      const g = String(r.gender || '').toUpperCase();
      if (g === 'M' || g === 'MALE') genderCounts.Male += 1;
      else if (g === 'F' || g === 'FEMALE') genderCounts.Female += 1;
      else genderCounts['Other / blank'] += 1;
      const visitDays = Number(r.visit_days || 0);
      attendanceDays += visitDays;
      return {
        id: String(r.id),
        name: r.name || '',
        age: r.age ?? null,
        gender: r.gender || null,
        opdAdNo: r.opd_ad_no || null,
        address: r.address || null,
        district,
        ageGroup: band,
        visitDays,
      };
    });

    res.json({
      month,
      fromDate,
      toDate,
      totals: { patients: patients.length, attendanceDays },
      ageGroups: AGE_BANDS.filter((b) => b !== 'Unknown' || ageCounts[b]).map((name) => ({
        name,
        value: ageCounts[name] || 0,
      })),
      districts: Object.entries(districtCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) =>
          a.name === UNKNOWN_DISTRICT
            ? 1
            : b.name === UNKNOWN_DISTRICT
              ? -1
              : b.value - a.value || a.name.localeCompare(b.name)
        ),
      gender: Object.entries(genderCounts).map(([name, value]) => ({ name, value })),
      patients,
    });
  } catch (err) {
    console.error('[stats] monthly failed:', err);
    res.status(500).json({ error: err.message || 'Could not load monthly report' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { fromDate, toDate } = parseOptionalStatsRange(req.query);
    const patients = await db.prepare('SELECT * FROM patients').all();
    const attendance = await db.prepare('SELECT * FROM clinic_attendance').all();
    const progress = await db.prepare('SELECT * FROM progress_logs').all();
    const assessments = await db.prepare('SELECT * FROM disease_assessments').all();

    const thisMonth = clinicMonthKey();

    const genderCounts = { M: 0, F: 0, Other: 0 };
    const ageBands = {};
    const conditionCounts = {};
    const registrationsByMonth = {};
    let patientsInScope = 0;
    let patientsWithConditions = 0;

    for (const p of patients) {
      const regDay =
        toClinicSortableDate(p.registration_date) || toClinicSortableDate(p.created_at);
      if (!dayInRange(regDay, fromDate, toDate)) continue;

      patientsInScope += 1;

      const g = String(p.gender || '').toUpperCase();
      if (g === 'M' || g === 'MALE') genderCounts.M += 1;
      else if (g === 'F' || g === 'FEMALE') genderCounts.F += 1;
      else genderCounts.Other += 1;

      const band = ageBand(p.age);
      ageBands[band] = (ageBands[band] || 0) + 1;

      const conditions = parseConditions(p.conditions);
      if (conditions.length > 0) patientsWithConditions += 1;
      for (const c of conditions) {
        conditionCounts[c] = (conditionCounts[c] || 0) + 1;
      }

      const regMonth = monthKey(p.registration_date) || monthKey(p.created_at) || null;
      if (regMonth) {
        registrationsByMonth[regMonth] = (registrationsByMonth[regMonth] || 0) + 1;
      }
    }

    const attendanceByMonth = {};
    let attendanceDays = 0;
    let attendanceThisMonth = 0;
    for (const row of attendance) {
      const day = toClinicSortableDate(row.visit_date);
      if (!dayInRange(day, fromDate, toDate)) continue;
      attendanceDays += 1;
      const m = monthKey(row.visit_date);
      if (m) {
        attendanceByMonth[m] = (attendanceByMonth[m] || 0) + 1;
        if (m === thisMonth) attendanceThisMonth += 1;
      }
    }

    let progressLogs = 0;
    for (const row of progress) {
      const day = toClinicSortableDate(row.log_date) || toClinicSortableDate(row.created_at);
      if (!dayInRange(day, fromDate, toDate)) continue;
      progressLogs += 1;
    }

    const assessmentsByType = {};
    const assessmentsByMonth = {};
    let assessmentCount = 0;
    let assessmentsThisMonth = 0;
    for (const a of assessments) {
      const day = toClinicSortableDate(a.assessment_date) || toClinicSortableDate(a.created_at);
      if (!dayInRange(day, fromDate, toDate)) continue;
      assessmentCount += 1;
      assessmentsByType[a.form_type] = (assessmentsByType[a.form_type] || 0) + 1;
      const m = monthKey(a.assessment_date);
      if (m) {
        assessmentsByMonth[m] = (assessmentsByMonth[m] || 0) + 1;
        if (m === thisMonth) assessmentsThisMonth += 1;
      }
    }

    // Diseases from the free-text Diagnosis on screening forms in the period.
    // Each patient counts once per diagnosis, however many visits mention it.
    const visits = await db
      .prepare(
        "SELECT patient_id, visit_date, diagnosis FROM visits WHERE diagnosis IS NOT NULL AND diagnosis <> ''"
      )
      .all();
    const diagnosisPatients = new Map(); // key → { label, labels: Map<label, n>, patients: Set }
    const diagnosedPatients = new Set();
    for (const v of visits) {
      if (!dayInRange(toClinicSortableDate(v.visit_date), fromDate, toDate)) continue;
      for (const d of parseDiagnoses(v.diagnosis)) {
        if (!diagnosisPatients.has(d.key)) {
          diagnosisPatients.set(d.key, { labels: new Map(), patients: new Set() });
        }
        const entry = diagnosisPatients.get(d.key);
        entry.labels.set(d.label, (entry.labels.get(d.label) || 0) + 1);
        entry.patients.add(v.patient_id);
        diagnosedPatients.add(v.patient_id);
      }
    }
    const diagnoses = [...diagnosisPatients.values()]
      .map((entry) => ({
        // Show the spelling used most often for this diagnosis.
        name: [...entry.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
        value: entry.patients.size,
      }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const toPairs = (obj) =>
      Object.entries(obj)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const monthSeries = (obj) =>
      Object.entries(obj)
        .map(([month, value]) => ({ month, value }))
        .sort((a, b) => (a.month < b.month ? -1 : 1));

    res.json({
      fromDate,
      toDate,
      totals: {
        patients: patientsInScope,
        attendanceDays,
        progressLogs,
        assessments: assessmentCount,
        attendanceThisMonth,
        assessmentsThisMonth,
        patientsWithConditions,
      },
      gender: [
        { name: 'Male', value: genderCounts.M },
        { name: 'Female', value: genderCounts.F },
        { name: 'Other / blank', value: genderCounts.Other },
      ].filter((x) => x.value > 0),
      ageBands: AGE_BANDS.filter((b) => b !== 'Unknown' || ageBands[b])
        .map((name) => ({ name, value: ageBands[name] || 0 })),
      conditions: toPairs(conditionCounts),
      diagnoses,
      patientsWithDiagnosis: diagnosedPatients.size,
      assessmentsByType: toPairs(assessmentsByType),
      registrationsByMonth: monthSeries(registrationsByMonth),
      attendanceByMonth: monthSeries(attendanceByMonth),
      assessmentsByMonth: monthSeries(assessmentsByMonth),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load stats' });
  }
});

export default router;

export async function getPatientCharts(patientId) {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
  if (!patient) return null;

  const attendance = await db
    .prepare('SELECT * FROM clinic_attendance WHERE patient_id = ? ORDER BY visit_date ASC')
    .all(patientId);
  const visits = await db
    .prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date ASC')
    .all(patientId);
  const assessments = await db
    .prepare(
      'SELECT * FROM disease_assessments WHERE patient_id = ? ORDER BY assessment_date ASC'
    )
    .all(patientId);
  const progress = await db
    .prepare('SELECT * FROM progress_logs WHERE patient_id = ? ORDER BY log_date ASC')
    .all(patientId);

  const extracted = extractAssessmentMetrics(assessments);
  const visitMetrics = extractVisitScreeningMetrics(visits);

  function mergeSeries(a = [], b = []) {
    return [...a, ...b].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  }

  return {
    metrics: extracted.metrics,
    series: {
      ...extracted.series,
      iop: mergeSeries(extracted.series.iop, visitMetrics.iopCombined),
      iopRight: mergeSeries(extracted.series.iopRight, visitMetrics.iopRight),
      iopLeft: mergeSeries(extracted.series.iopLeft, visitMetrics.iopLeft),
      visionRight: mergeSeries(extracted.series.visionRight, visitMetrics.visionRight),
      visionLeft: mergeSeries(extracted.series.visionLeft, visitMetrics.visionLeft),
      phRight: mergeSeries(extracted.series.phRight, visitMetrics.phRight),
      phLeft: mergeSeries(extracted.series.phLeft, visitMetrics.phLeft),
      contrastRight: mergeSeries(extracted.series.contrastRight, visitMetrics.contrastRight),
      contrastLeft: mergeSeries(extracted.series.contrastLeft, visitMetrics.contrastLeft),
      nearRight: mergeSeries(extracted.series.nearRight, visitMetrics.nearRight),
      nearLeft: mergeSeries(extracted.series.nearLeft, visitMetrics.nearLeft),
      colorVisionRight: mergeSeries(extracted.series.colorVisionRight, visitMetrics.colorVisionRight),
      colorVisionLeft: mergeSeries(extracted.series.colorVisionLeft, visitMetrics.colorVisionLeft),
      improvementRight: progress
        .filter((p) => p.right_score != null)
        .map((p) => ({
          date: p.log_date,
          value: Number(p.right_score),
          source: 'progress',
          kind: 'progress',
          eye: 'Right',
        })),
      improvementLeft: progress
        .filter((p) => p.left_score != null)
        .map((p) => ({
          date: p.log_date,
          value: Number(p.left_score),
          source: 'progress',
          kind: 'progress',
          eye: 'Left',
        })),
    },
    activity: buildMonthlyActivity({ attendance, visits, assessments, progress }),
    progress: progress.map((p) => ({
      id: p.id,
      date: p.log_date,
      rightEye: p.right_eye,
      leftEye: p.left_eye,
      rightScore: p.right_score ?? null,
      leftScore: p.left_score ?? null,
    })),
    counts: {
      attendance: attendance.length,
      visits: visits.length,
      assessments: assessments.length,
      progress: progress.length,
    },
  };
}
