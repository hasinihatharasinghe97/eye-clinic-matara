import { Router } from 'express';
import db from '../db.js';
import {
  ageBand,
  buildMonthlyActivity,
  extractAssessmentMetrics,
  extractVisitScreeningMetrics,
  monthKey,
  parseJson,
} from '../analytics.js';

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

router.get('/', async (_req, res) => {
  try {
    const patients = await db.prepare('SELECT * FROM patients').all();
    const visits = await db.prepare('SELECT * FROM visits').all();
    const progress = await db.prepare('SELECT * FROM progress_logs').all();
    const assessments = await db.prepare('SELECT * FROM disease_assessments').all();

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const genderCounts = { M: 0, F: 0, Other: 0 };
    const ageBands = {};
    const conditionCounts = {};
    const registrationsByMonth = {};

    for (const p of patients) {
      const g = String(p.gender || '').toUpperCase();
      if (g === 'M' || g === 'MALE') genderCounts.M += 1;
      else if (g === 'F' || g === 'FEMALE') genderCounts.F += 1;
      else genderCounts.Other += 1;

      const band = ageBand(p.age);
      ageBands[band] = (ageBands[band] || 0) + 1;

      for (const c of parseConditions(p.conditions)) {
        conditionCounts[c] = (conditionCounts[c] || 0) + 1;
      }

      const regMonth =
        monthKey(p.registration_date) || monthKey(p.created_at) || null;
      if (regMonth) {
        registrationsByMonth[regMonth] = (registrationsByMonth[regMonth] || 0) + 1;
      }
    }

    const visitsByMonth = {};
    const diagnosisCounts = {};
    let visitsThisMonth = 0;
    for (const v of visits) {
      const m = monthKey(v.visit_date);
      if (m) {
        visitsByMonth[m] = (visitsByMonth[m] || 0) + 1;
        if (m === thisMonth) visitsThisMonth += 1;
      }
      const diag = String(v.diagnosis || '').trim();
      if (diag) diagnosisCounts[diag] = (diagnosisCounts[diag] || 0) + 1;
    }

    const assessmentsByType = {};
    const assessmentsByMonth = {};
    let assessmentsThisMonth = 0;
    for (const a of assessments) {
      assessmentsByType[a.form_type] = (assessmentsByType[a.form_type] || 0) + 1;
      const m = monthKey(a.assessment_date);
      if (m) {
        assessmentsByMonth[m] = (assessmentsByMonth[m] || 0) + 1;
        if (m === thisMonth) assessmentsThisMonth += 1;
      }
    }

    const toPairs = (obj) =>
      Object.entries(obj)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const monthSeries = (obj) =>
      Object.entries(obj)
        .map(([month, value]) => ({ month, value }))
        .sort((a, b) => (a.month < b.month ? -1 : 1));

    const last12 = (series) => {
      if (series.length <= 12) return series;
      return series.slice(-12);
    };

    res.json({
      totals: {
        patients: patients.length,
        visits: visits.length,
        progressLogs: progress.length,
        assessments: assessments.length,
        visitsThisMonth,
        assessmentsThisMonth,
        patientsWithConditions: patients.filter((p) => parseConditions(p.conditions).length > 0)
          .length,
      },
      gender: [
        { name: 'Male', value: genderCounts.M },
        { name: 'Female', value: genderCounts.F },
        { name: 'Other / blank', value: genderCounts.Other },
      ].filter((x) => x.value > 0),
      ageBands: ['0–17', '18–29', '30–44', '45–59', '60–74', '75+', 'Unknown']
        .filter((b) => ageBands[b])
        .map((name) => ({ name, value: ageBands[name] })),
      conditions: toPairs(conditionCounts),
      diagnoses: toPairs(diagnosisCounts).slice(0, 12),
      assessmentsByType: toPairs(assessmentsByType),
      registrationsByMonth: last12(monthSeries(registrationsByMonth)),
      visitsByMonth: last12(monthSeries(visitsByMonth)),
      assessmentsByMonth: last12(monthSeries(assessmentsByMonth)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load stats' });
  }
});

export default router;

export async function getPatientCharts(patientId) {
  const patient = await db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
  if (!patient) return null;

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
      contrastRight: mergeSeries(extracted.series.contrastRight, visitMetrics.contrastRight),
      contrastLeft: mergeSeries(extracted.series.contrastLeft, visitMetrics.contrastLeft),
      nearRight: mergeSeries(extracted.series.nearRight, visitMetrics.nearRight),
      nearLeft: mergeSeries(extracted.series.nearLeft, visitMetrics.nearLeft),
      colorVision: mergeSeries(extracted.series.colorVision, visitMetrics.colorVision),
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
    activity: buildMonthlyActivity({ visits, assessments, progress }),
    progress: progress.map((p) => ({
      id: p.id,
      date: p.log_date,
      rightEye: p.right_eye,
      leftEye: p.left_eye,
      rightScore: p.right_score ?? null,
      leftScore: p.left_score ?? null,
    })),
    counts: {
      visits: visits.length,
      assessments: assessments.length,
      progress: progress.length,
    },
  };
}
