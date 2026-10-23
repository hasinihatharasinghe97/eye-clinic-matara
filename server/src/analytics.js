import { toClinicSortableDate } from './clinicDate.js';

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, '').trim();
  // Allow values like "320 µm" or "14 mmHg"
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function toSortableDate(value) {
  return toClinicSortableDate(value);
}

function monthKey(value) {
  const d = toSortableDate(value);
  return d ? d.slice(0, 7) : null;
}

/**
 * Distance vision score: 1 = best (6/6) … 11 = worst (PL); 12 = "-" (blind).
 * Charts plot this on a reversed axis so improvement goes up.
 */
const DISTANCE_VISION_SCORE = {
  '6/6': 1,
  '6/9': 2,
  '6/12': 3,
  '6/18': 4,
  '6/24': 5,
  '6/36': 6,
  '6/60': 7,
  '3/60': 8,
  CFS: 9,
  HM: 10,
  PL: 11,
  '-': 12,
};

function distanceVisionScore(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim();
  if (Object.prototype.hasOwnProperty.call(DISTANCE_VISION_SCORE, key)) {
    return DISTANCE_VISION_SCORE[key];
  }
  return null;
}

/** Near vision score: 1 = best … 12 = worst; 13 = "-" (blind). */
function nearVisionScore(value) {
  if (value == null || value === '') return null;
  if (String(value).trim() === '-') return 13;
  const n = toNumber(value);
  if (n == null || n < 1 || n > 12) return null;
  return n;
}

function parseVisitIop(raw) {
  if (raw == null || raw === '') return { r: null, l: null };
  if (typeof raw === 'object') {
    return { r: toNumber(raw.r), l: toNumber(raw.l) };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('r' in parsed || 'l' in parsed)) {
      return { r: toNumber(parsed.r), l: toNumber(parsed.l) };
    }
  } catch {
    /* legacy single value */
  }
  const n = toNumber(raw);
  return { r: n, l: null };
}

const METRIC_KEYS = [
  { key: 'cmt', label: 'CMT (µm)', aliases: ['cmt'] },
  { key: 'iop', label: 'IOP (mmHg)', aliases: ['iop'] },
  { key: 'iopRight', label: 'Eye pressure R (mmHg)', aliases: [] },
  { key: 'iopLeft', label: 'Eye pressure L (mmHg)', aliases: [] },
  { key: 'visionRight', label: 'Vision improvement R', aliases: [] },
  { key: 'visionLeft', label: 'Vision improvement L', aliases: [] },
  { key: 'phRight', label: 'Pinhole (PH) improvement R', aliases: [] },
  { key: 'phLeft', label: 'Pinhole (PH) improvement L', aliases: [] },
  { key: 'contrastRight', label: 'Contrast improvement R', aliases: [] },
  { key: 'contrastLeft', label: 'Contrast improvement L', aliases: [] },
  { key: 'colorVisionRight', label: 'Color vision R', aliases: [] },
  { key: 'colorVisionLeft', label: 'Color vision L', aliases: [] },
  { key: 'nearRight', label: 'Near vision R', aliases: [] },
  { key: 'nearLeft', label: 'Near vision L', aliases: [] },
  { key: 'csgs', label: 'CSGS score', aliases: ['csgs', 'csgsTotal'] },
  { key: 'hba1c', label: 'HbA1c (%)', aliases: ['hba1c'] },
  { key: 'srf', label: 'SRF height (µm)', aliases: ['srf', 'srfHeight'] },
  { key: 'improvementRight', label: 'Improvement score R (0–10)', aliases: [] },
  { key: 'improvementLeft', label: 'Improvement score L (0–10)', aliases: [] },
];

function pushPoint(bucket, point) {
  if (!point.date || point.value == null) return;
  bucket.push(point);
}

/**
 * Build time-series metric points from disease assessments (top-level + follow-up rows).
 */
export function extractAssessmentMetrics(assessments) {
  const series = Object.fromEntries(METRIC_KEYS.map((m) => [m.key, []]));

  for (const row of assessments) {
    const data = parseJson(row.data, {});
    const eye = row.eye || data.eyeDetail || null;
    const formType = row.form_type || row.formType;
    const baseDate = toSortableDate(row.assessment_date || row.assessmentDate);

    for (const metric of METRIC_KEYS) {
      for (const alias of metric.aliases) {
        const value = toNumber(data[alias]);
        if (value != null && baseDate) {
          pushPoint(series[metric.key], {
            date: baseDate,
            value,
            eye,
            source: formType,
            kind: 'assessment',
          });
        }
      }
    }

    const followUps = Array.isArray(data.followUps) ? data.followUps : [];
    for (const fu of followUps) {
      const fuDate = toSortableDate(fu.date) || baseDate;
      const fuEye = fu.eye || eye;
      for (const metric of METRIC_KEYS) {
        for (const alias of metric.aliases) {
          const value = toNumber(fu[alias]);
          if (value != null && fuDate) {
            pushPoint(series[metric.key], {
              date: fuDate,
              value,
              eye: fuEye,
              source: formType,
              kind: 'followup',
            });
          }
        }
      }
      // Cataract follow-up contrast / colorVision free-text numbers
      const contrast = toNumber(fu.contrast);
      if (contrast != null && fuDate) {
        const eyeKey =
          String(fuEye || '').toLowerCase().startsWith('l') ? 'contrastLeft' : 'contrastRight';
        pushPoint(series[eyeKey], {
          date: fuDate,
          value: contrast,
          eye: fuEye,
          source: formType,
          kind: 'followup',
        });
      }
      const color = toNumber(fu.colorVision);
      if (color != null && fuDate) {
        const eyeKey =
          String(fuEye || '').toLowerCase().startsWith('l') ? 'colorVisionLeft' : 'colorVisionRight';
        pushPoint(series[eyeKey], {
          date: fuDate,
          value: color,
          eye: fuEye,
          source: formType,
          kind: 'followup',
        });
      }
    }

    const topColor = toNumber(data.colorVision);
    if (topColor != null && baseDate) {
      const eyeKey =
        String(eye || '').toLowerCase().startsWith('l') ? 'colorVisionLeft' : 'colorVisionRight';
      pushPoint(series[eyeKey], {
        date: baseDate,
        value: topColor,
        eye,
        source: formType,
        kind: 'assessment',
      });
    }
  }

  for (const key of Object.keys(series)) {
    series[key].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return { metrics: METRIC_KEYS, series };
}

/** @deprecated Prefer extractVisitScreeningMetrics */
export function extractVisitIop(visits) {
  return extractVisitScreeningMetrics(visits).iopCombined;
}

/**
 * Extract screening-visit chart series: VA, pinhole VA, contrast, near, color, IOP R/L.
 */
export function extractVisitScreeningMetrics(visits) {
  const visionRight = [];
  const visionLeft = [];
  const phRight = [];
  const phLeft = [];
  const contrastRight = [];
  const contrastLeft = [];
  const nearRight = [];
  const nearLeft = [];
  const colorVisionRight = [];
  const colorVisionLeft = [];
  const iopRight = [];
  const iopLeft = [];
  const iopCombined = [];

  for (const v of visits) {
    const date = toSortableDate(v.visit_date || v.visitDate);
    if (!date) continue;

    const vision = parseJson(v.vision, {});
    const distance = vision.distance || {};
    const near = vision.near || {};
    const contrast = vision.contrast || {};

    const vr = distanceVisionScore(distance.rEye);
    const vl = distanceVisionScore(distance.lEye);
    if (vr != null) pushPoint(visionRight, { date, value: vr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (vl != null) pushPoint(visionLeft, { date, value: vl, eye: 'Left', source: 'visit', kind: 'visit' });

    const pr = distanceVisionScore(distance.rPh);
    const pl = distanceVisionScore(distance.lPh);
    if (pr != null) pushPoint(phRight, { date, value: pr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (pl != null) pushPoint(phLeft, { date, value: pl, eye: 'Left', source: 'visit', kind: 'visit' });

    const cr = toNumber(contrast.rEye);
    const cl = toNumber(contrast.lEye);
    if (cr != null) pushPoint(contrastRight, { date, value: cr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (cl != null) pushPoint(contrastLeft, { date, value: cl, eye: 'Left', source: 'visit', kind: 'visit' });

    const nr = nearVisionScore(near.rEye);
    const nl = nearVisionScore(near.lEye);
    if (nr != null) pushPoint(nearRight, { date, value: nr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (nl != null) pushPoint(nearLeft, { date, value: nl, eye: 'Left', source: 'visit', kind: 'visit' });

    const colorRaw = v.color_vision ?? v.colorVision;
    let colorR = null;
    let colorL = null;
    if (colorRaw != null && colorRaw !== '') {
      if (typeof colorRaw === 'object') {
        colorR = toNumber(colorRaw.r);
        colorL = toNumber(colorRaw.l);
      } else {
        try {
          const parsed = JSON.parse(colorRaw);
          if (parsed && typeof parsed === 'object' && ('r' in parsed || 'l' in parsed)) {
            colorR = toNumber(parsed.r);
            colorL = toNumber(parsed.l);
          } else {
            colorR = toNumber(colorRaw);
          }
        } catch {
          colorR = toNumber(colorRaw);
        }
      }
    }
    if (colorR != null) {
      pushPoint(colorVisionRight, { date, value: colorR, eye: 'Right', source: 'visit', kind: 'visit' });
    }
    if (colorL != null) {
      pushPoint(colorVisionLeft, { date, value: colorL, eye: 'Left', source: 'visit', kind: 'visit' });
    }

    const iop = parseVisitIop(v.iop);
    if (iop.r != null) {
      pushPoint(iopRight, { date, value: iop.r, eye: 'Right', source: 'visit', kind: 'visit' });
      pushPoint(iopCombined, { date, value: iop.r, eye: 'Right', source: 'visit', kind: 'visit' });
    }
    if (iop.l != null) {
      pushPoint(iopLeft, { date, value: iop.l, eye: 'Left', source: 'visit', kind: 'visit' });
      pushPoint(iopCombined, { date, value: iop.l, eye: 'Left', source: 'visit', kind: 'visit' });
    }
  }

  const sortPts = (pts) =>
    pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    visionRight: sortPts(visionRight),
    visionLeft: sortPts(visionLeft),
    phRight: sortPts(phRight),
    phLeft: sortPts(phLeft),
    contrastRight: sortPts(contrastRight),
    contrastLeft: sortPts(contrastLeft),
    nearRight: sortPts(nearRight),
    nearLeft: sortPts(nearLeft),
    colorVisionRight: sortPts(colorVisionRight),
    colorVisionLeft: sortPts(colorVisionLeft),
    iopRight: sortPts(iopRight),
    iopLeft: sortPts(iopLeft),
    iopCombined: sortPts(iopCombined),
  };
}

export function buildMonthlyActivity({ attendance = [], visits = [], assessments, progress }) {
  const map = new Map();

  function bump(dateValue, field) {
    const m = monthKey(dateValue);
    if (!m) return;
    if (!map.has(m)) {
      map.set(m, { month: m, attendance: 0, visits: 0, assessments: 0, progress: 0 });
    }
    map.get(m)[field] += 1;
  }

  for (const row of attendance) bump(row.visit_date || row.visitDate, 'attendance');
  for (const v of visits) bump(v.visit_date || v.visitDate, 'visits');
  for (const a of assessments) bump(a.assessment_date || a.assessmentDate, 'assessments');
  for (const p of progress) bump(p.log_date || p.logDate, 'progress');

  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

/** Eye-side words that don't change the disease ("Cataract OU" = "Cataract"). */
const EYE_SIDE_RE =
  /\(\s*(?:r|l|re|le|od|os|ou|be)\s*\)|\b(?:ou|od|os|re|le|be|r\/e|l\/e|b\/e|bilateral|both\s+eyes?|right\s+eye|left\s+eye|rt\s+eye|lt\s+eye)\b/gi;

/**
 * Split a free-text Diagnosis into separate diseases and normalise each one so the
 * same disease groups together: case, spacing and eye side are ignored.
 * "Cataract OU, Glaucoma (R)" → [{ key: 'cataract' }, { key: 'glaucoma' }]
 */
export function parseDiagnoses(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const seen = new Map();
  for (const part of raw.split(/[,;\n+&]|\s+and\s+|\s+\/\s+/i)) {
    const label = part
      .replace(EYE_SIDE_RE, ' ')
      .replace(/\b[RL]\b\s*$/i, ' ') // trailing lone "R" / "L"
      .replace(/[()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, '')
      .trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { key, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
  }
  return [...seen.values()];
}

export const AGE_BANDS = ['0-15', '16-30', '31-45', '46-60', '61-75', '76 and above', 'Unknown'];

export function ageBand(age) {
  if (age == null || age === '' || Number.isNaN(Number(age))) return 'Unknown';
  const n = Number(age);
  if (n <= 15) return '0-15';
  if (n <= 30) return '16-30';
  if (n <= 45) return '31-45';
  if (n <= 60) return '46-60';
  if (n <= 75) return '61-75';
  return '76 and above';
}

export { parseJson, toNumber, toSortableDate, monthKey, METRIC_KEYS };
