import { api, type Visit, type VisualFieldData } from './api';
import { PAGE_SIZE_OPTIONS } from './components/Pagination';

const FETCH_PAGE_SIZE = PAGE_SIZE_OPTIONS[PAGE_SIZE_OPTIONS.length - 1];

type Page<T> = { total: number } & Record<string, unknown> & { items: T[] };

/** Load every page of a paginated list endpoint. */
export async function fetchAll<T>(load: (page: number, pageSize: number) => Promise<Page<T>>) {
  const first = await load(1, FETCH_PAGE_SIZE);
  const all = [...first.items];
  const pages = Math.max(1, Math.ceil(first.total / FETCH_PAGE_SIZE));
  for (let p = 2; p <= pages; p++) all.push(...(await load(p, FETCH_PAGE_SIZE)).items);
  return all;
}

/** Every screening visit for a patient, oldest first. */
export async function fetchAllVisits(patientId: string) {
  const visits = await fetchAll<Visit>(async (p, s) => {
    const r = await api.listVisits(patientId, p, s);
    return { ...r, items: r.visits };
  });
  return visits.sort((a, b) =>
    a.visitDate < b.visitDate ? -1 : a.visitDate > b.visitDate ? 1 : a.createdAt < b.createdAt ? -1 : 1
  );
}

export function hasValue(value: unknown) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

export function parseRL(raw: unknown): { r: string; l: string } | null {
  if (!hasValue(raw)) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { r: raw, l: '' };
    }
  }
  if (obj && typeof obj === 'object') {
    const o = obj as { r?: unknown; l?: unknown };
    return { r: String(o.r ?? ''), l: String(o.l ?? '') };
  }
  return { r: String(obj), l: '' };
}

export function rlText(raw: unknown) {
  const rl = parseRL(raw);
  if (!rl || (!rl.r.trim() && !rl.l.trim())) return '';
  return `R ${rl.r.trim() || '-'} / L ${rl.l.trim() || '-'}`;
}

/** Distance / near vision value; "-" means blind. */
export function visionText(value: string | undefined) {
  if (!value) return '';
  return value === '-' ? '- (blind)' : value;
}

/** Glare / halo test result: "+" = positive, "-" = negative. */
export function plusMinusLabel(value: string | undefined) {
  if (value === '+') return '+ (positive)';
  if (value === '-') return '- (negative)';
  return value || '';
}

export function visualFieldText(raw: Visit['visualField']) {
  if (!hasValue(raw)) return '';
  let vf: VisualFieldData | null = null;
  if (typeof raw === 'object') vf = raw as VisualFieldData;
  else {
    try {
      vf = JSON.parse(String(raw)) as VisualFieldData;
    } catch {
      return String(raw);
    }
  }
  if (!vf || typeof vf !== 'object') return String(raw);
  const names: Record<string, string> = {
    tl: 'upper-left',
    tr: 'upper-right',
    bl: 'lower-left',
    br: 'lower-right',
  };
  const eye = (e?: Record<string, boolean | undefined>) => {
    const marked = Object.entries(e || {})
      .filter(([, v]) => v)
      .map(([k]) => names[k] || k);
    return marked.length ? marked.join(', ') : 'no defect marked';
  };
  const parts = [`R: ${eye(vf.r)}`, `L: ${eye(vf.l)}`];
  if (vf.notes) parts.push(`Notes: ${vf.notes}`);
  return parts.join('\n');
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => hasValue(v))
      .map(([k, v]) => `${k}: ${formatValue(v)}`)
      .join('; ');
  }
  return value == null ? '' : String(value);
}

export type VisitRow = { label: string; get: (v: Visit) => string };
export type VisitSection = { title: string; rows: VisitRow[] };

const str = (value: unknown) => (value == null ? '' : String(value).trim());
const rl = (raw: unknown, side: 'r' | 'l') => str(parseRL(raw)?.[side]);

/** Every field of the eye screening form, in form order, as display text. */
export const VISIT_SECTIONS: VisitSection[] = [
  {
    title: 'General',
    rows: [
      { label: 'Diagnosis', get: (v) => str(v.diagnosis) },
      { label: 'C/O (Complaints)', get: (v) => str(v.coComplaints) },
      { label: 'O.C (Other complaints)', get: (v) => str(v.ocOther) },
      { label: 'Family history', get: (v) => str(v.familyHistory) },
    ],
  },
  {
    title: 'External examination',
    rows: (
      [
        ['headPosture', 'Head posture'],
        ['foreheadFacialSymmetry', 'Forehead and facial symmetry'],
        ['eyebrows', 'Eyebrows'],
        ['eyelids', 'Eyelids'],
        ['palpebralAperture', 'Palpebral aperture'],
        ['lacrimalApparatus', 'Lacrimal apparatus'],
        ['eyeball', 'Eyeball'],
      ] as const
    ).map(([key, label]) => ({ label, get: (v: Visit) => str(v.examExternal?.[key]) })),
  },
  {
    title: 'Distance vision',
    rows: (
      [
        ['rEye', 'R-Eye'],
        ['rPh', 'R ph'],
        ['lEye', 'L-Eye'],
        ['lPh', 'L ph'],
      ] as const
    ).map(([key, label]) => ({ label, get: (v: Visit) => visionText(v.vision?.distance?.[key]) })),
  },
  {
    title: 'Near vision',
    rows: (
      [
        ['rEye', 'R-Eye'],
        ['rPh', 'R ph'],
        ['lEye', 'L-Eye'],
        ['lPh', 'L ph'],
      ] as const
    ).map(([key, label]) => ({ label, get: (v: Visit) => visionText(v.vision?.near?.[key]) })),
  },
  {
    title: 'Visual field',
    rows: [{ label: 'Visual field', get: (v) => visualFieldText(v.visualField) }],
  },
  {
    title: 'Color vision',
    rows: [
      { label: 'R-Eye (1-30)', get: (v) => rl(v.colorVision, 'r') },
      { label: 'L-Eye (1-30)', get: (v) => rl(v.colorVision, 'l') },
    ],
  },
  {
    title: 'Contrast sensitivity',
    rows: [
      { label: 'R-Eye (1-10)', get: (v) => str(v.vision?.contrast?.rEye) },
      { label: 'L-Eye (1-10)', get: (v) => str(v.vision?.contrast?.lEye) },
    ],
  },
  {
    title: 'Glare and halo tests',
    rows: [
      { label: 'Glare - R-Eye', get: (v) => plusMinusLabel(v.vision?.glare?.rEye) },
      { label: 'Glare - L-Eye', get: (v) => plusMinusLabel(v.vision?.glare?.lEye) },
      { label: 'Halo - R-Eye', get: (v) => plusMinusLabel(v.vision?.halo?.rEye) },
      { label: 'Halo - L-Eye', get: (v) => plusMinusLabel(v.vision?.halo?.lEye) },
    ],
  },
  {
    title: 'Inspection',
    rows: (
      [
        ['sclera', 'Sclera'],
        ['pupilSize', 'Pupil size'],
        ['pupilShape', 'Pupil shape'],
        ['pupillaryLightReflex', 'Pupillary light reflex'],
        ['eyelidPtosis', 'Eyelid ptosis'],
        ['nystagmus', 'Nystagmus'],
        ['conjunctiva', 'Conjunctiva'],
        ['ocularMovements', 'Ocular movements'],
        ['cornealSensation', 'Corneal sensation'],
      ] as const
    ).map(([key, label]) => ({ label, get: (v: Visit) => str(v.inspection?.[key]) })),
  },
  {
    title: 'Slit lamp / IOP',
    rows: [
      { label: 'Anterior segment', get: (v) => str(v.slitLamp?.anteriorSegment) },
      { label: 'IOP - Right (mmHg)', get: (v) => rl(v.iop, 'r') },
      { label: 'IOP - Left (mmHg)', get: (v) => rl(v.iop, 'l') },
      { label: 'Optic nerve head', get: (v) => str(v.slitLamp?.opticNerveHead) },
      { label: 'Ophthalmoscopy - lens', get: (v) => str(v.slitLamp?.ophthalmoscopyLens) },
    ],
  },
  {
    title: 'Cataract assessment',
    rows: [
      {
        label: 'Findings',
        get: (v) => {
          const c = v.cataract || {};
          return [
            c.rightEye && 'R eye',
            c.leftEye && 'L eye',
            c.psc && 'PSC',
            c.psx && 'PSX',
            c.subluxed && 'Sub luxed / disloc',
          ]
            .filter(Boolean)
            .join(', ');
        },
      },
      ...(
        [
          ['nsGrade', 'NS grade'],
          ['k1', 'K1'],
          ['k2', 'K2'],
          ['cyl', 'Cyl'],
          ['cylAxis', 'Cyl axis @'],
          ['axialMm', 'Axial (mm)'],
          ['diopter', 'Diopter'],
        ] as const
      ).map(([key, label]) => ({ label, get: (v: Visit) => str(v.cataract?.[key]) })),
    ],
  },
  {
    title: 'Investigations and notes',
    rows: [
      { label: 'Ix / Investigations', get: (v) => str(v.ixHistory) },
      { label: 'Additional notes', get: (v) => str(v.notes) },
    ],
  },
];
