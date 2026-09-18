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
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function monthKey(value) {
  const d = toSortableDate(value);
  return d ? d.slice(0, 7) : null;
}

/** Higher score = better distance vision (for improvement charts). */
const DISTANCE_VISION_SCORE = {
  CFS: 1,
  HM: 2,
  PL: 3,
  '6/60': 4,
  '6/36': 5,
  '6/24': 6,
  '6/18': 7,
  '6/12': 8,
  '6/9': 9,
  '6/6': 10,
};

function distanceVisionScore(value) {
  if (value == null || value === '' || value === '-') return null;
  const key = String(value).trim();
  if (Object.prototype.hasOwnProperty.call(DISTANCE_VISION_SCORE, key)) {
    return DISTANCE_VISION_SCORE[key];
  }
  return null;
}

/** Near acuity N1–N12: invert so higher chart score = better near vision. */
function nearVisionScore(value) {
  const n = toNumber(value);
  if (n == null || n < 1 || n > 12) return null;
  return 13 - n;
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
  { key: 'contrastRight', label: 'Contrast improvement R', aliases: [] },
  { key: 'contrastLeft', label: 'Contrast improvement L', aliases: [] },
  { key: 'colorVision', label: 'Color vision', aliases: ['colorVision'] },
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
        pushPoint(series.colorVision, {
          date: fuDate,
          value: color,
          eye: fuEye,
          source: formType,
          kind: 'followup',
        });
      }
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
 * Extract screening-visit chart series: VA, contrast, near, color, IOP R/L.
 */
export function extractVisitScreeningMetrics(visits) {
  const visionRight = [];
  const visionLeft = [];
  const contrastRight = [];
  const contrastLeft = [];
  const nearRight = [];
  const nearLeft = [];
  const colorVision = [];
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

    const cr = toNumber(contrast.rEye);
    const cl = toNumber(contrast.lEye);
    if (cr != null) pushPoint(contrastRight, { date, value: cr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (cl != null) pushPoint(contrastLeft, { date, value: cl, eye: 'Left', source: 'visit', kind: 'visit' });

    const nr = nearVisionScore(near.rEye);
    const nl = nearVisionScore(near.lEye);
    if (nr != null) pushPoint(nearRight, { date, value: nr, eye: 'Right', source: 'visit', kind: 'visit' });
    if (nl != null) pushPoint(nearLeft, { date, value: nl, eye: 'Left', source: 'visit', kind: 'visit' });

    const color = toNumber(v.color_vision ?? v.colorVision);
    if (color != null) {
      pushPoint(colorVision, { date, value: color, source: 'visit', kind: 'visit' });
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
    contrastRight: sortPts(contrastRight),
    contrastLeft: sortPts(contrastLeft),
    nearRight: sortPts(nearRight),
    nearLeft: sortPts(nearLeft),
    colorVision: sortPts(colorVision),
    iopRight: sortPts(iopRight),
    iopLeft: sortPts(iopLeft),
    iopCombined: sortPts(iopCombined),
  };
}

export function buildMonthlyActivity({ attendance = [], assessments, progress }) {
  const map = new Map();

  function bump(dateValue, field) {
    const m = monthKey(dateValue);
    if (!m) return;
    if (!map.has(m)) map.set(m, { month: m, attendance: 0, assessments: 0, progress: 0 });
    map.get(m)[field] += 1;
  }

  for (const row of attendance) bump(row.visit_date || row.visitDate, 'attendance');
  for (const a of assessments) bump(a.assessment_date || a.assessmentDate, 'assessments');
  for (const p of progress) bump(p.log_date || p.logDate, 'progress');

  return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

export function ageBand(age) {
  if (age == null || Number.isNaN(Number(age))) return 'Unknown';
  const n = Number(age);
  if (n < 18) return '0–17';
  if (n < 30) return '18–29';
  if (n < 45) return '30–44';
  if (n < 60) return '45–59';
  if (n < 75) return '60–74';
  return '75+';
}

export { parseJson, toNumber, toSortableDate, monthKey, METRIC_KEYS };
