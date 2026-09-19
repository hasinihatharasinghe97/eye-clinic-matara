import { useEffect, useState } from 'react';
import {
  api,
  localClinicDate,
  type CataractData,
  type ExamExternal,
  type InspectionData,
  type SlitLampData,
  type Visit,
  type VisionData,
  type VisualFieldData,
} from '../api';
import { emptyVisualField, VisualFieldMarker } from '../components/VisualFieldMarker';

type Props = {
  patientId: string;
  visitId?: string;
  patientName?: string | null;
  onDone: () => void;
  onCancel: () => void;
};

const DISTANCE_OPTIONS = [
  'CFS',
  'HM',
  'PL',
  '6/60',
  '6/36',
  '6/24',
  '6/18',
  '6/12',
  '6/9',
  '6/6',
];

const NEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const COLOR_VISION_OPTIONS = Array.from({ length: 30 }, (_, i) => String(i + 1));
const CONTRAST_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));

function parseVisualField(raw: Visit['visualField']): VisualFieldData {
  if (!raw) return emptyVisualField();
  if (typeof raw === 'object') {
    return {
      r: { tl: false, tr: false, bl: false, br: false, ...raw.r },
      l: { tl: false, tr: false, bl: false, br: false, ...raw.l },
      notes: raw.notes || '',
    };
  }
  try {
    const parsed = JSON.parse(raw) as VisualFieldData;
    if (parsed && typeof parsed === 'object' && (parsed.r || parsed.l)) {
      return {
        r: { tl: false, tr: false, bl: false, br: false, ...parsed.r },
        l: { tl: false, tr: false, bl: false, br: false, ...parsed.l },
        notes: parsed.notes || '',
      };
    }
  } catch {
    /* legacy free-text */
  }
  return { ...emptyVisualField(), notes: String(raw) };
}

function parseIop(raw: Visit['iop']): { r: string; l: string } {
  if (!raw) return { r: '', l: '' };
  if (typeof raw === 'object') {
    return { r: String(raw.r ?? ''), l: String(raw.l ?? '') };
  }
  try {
    const parsed = JSON.parse(raw) as { r?: string; l?: string };
    if (parsed && typeof parsed === 'object' && ('r' in parsed || 'l' in parsed)) {
      return { r: String(parsed.r ?? ''), l: String(parsed.l ?? '') };
    }
  } catch {
    /* legacy single IOP string */
  }
  return { r: String(raw), l: '' };
}

type FormState = {
  visitDate: string;
  coComplaints: string;
  ocOther: string;
  familyHistory: string;
  examExternal: ExamExternal;
  vision: VisionData;
  inspection: InspectionData;
  slitLamp: SlitLampData;
  cataract: CataractData;
  ixHistory: string;
  diagnosis: string;
  iop: { r: string; l: string };
  colorVision: string;
  visualField: VisualFieldData;
  notes: string;
};

const blank = (): FormState => ({
  visitDate: localClinicDate(),
  coComplaints: '',
  ocOther: '',
  familyHistory: '',
  examExternal: {},
  vision: { distance: {}, near: {}, contrast: {} },
  inspection: {},
  slitLamp: {},
  cataract: {},
  ixHistory: '',
  diagnosis: '',
  iop: { r: '', l: '' },
  colorVision: '',
  visualField: emptyVisualField(),
  notes: '',
});

function SelectField({
  label,
  value,
  options,
  onChange,
  allowEmpty,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty !== false && <option value="">-</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export function VisitForm({ patientId, visitId, patientName, onDone, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visitId) return;
    api.getVisit(patientId, visitId).then((v: Visit) => {
      setForm({
        visitDate: v.visitDate,
        coComplaints: v.coComplaints || '',
        ocOther: v.ocOther || '',
        familyHistory: v.familyHistory || '',
        examExternal: v.examExternal || {},
        vision: {
          distance: v.vision?.distance || {},
          near: v.vision?.near || {},
          contrast: v.vision?.contrast || {},
        },
        inspection: v.inspection || {},
        slitLamp: v.slitLamp || {},
        cataract: v.cataract || {},
        ixHistory: v.ixHistory || '',
        diagnosis: v.diagnosis || '',
        iop: parseIop(v.iop),
        colorVision: v.colorVision || '',
        visualField: parseVisualField(v.visualField),
        notes: v.notes || '',
      });
    }).catch((err) => setError(err.message));
  }, [patientId, visitId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        iop: JSON.stringify(form.iop),
        visualField: JSON.stringify(form.visualField),
      };
      if (visitId) await api.updateVisit(patientId, visitId, payload);
      else await api.createVisit(patientId, payload);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{visitId ? 'Edit visit' : 'New eye screening visit'}</h2>
      {patientName && (
        <p className="muted" style={{ marginTop: '-0.35rem' }}>
          Patient: <strong>{patientName}</strong>
        </p>
      )}

      <div className="grid-2">
        <div className="field">
          <label>Visit date</label>
          <input
            type="date"
            value={form.visitDate}
            onChange={(e) => setForm((f) => ({ ...f, visitDate: e.target.value }))}
            required
          />
        </div>
        <div className="field">
          <label>Diagnosis</label>
          <input
            value={form.diagnosis}
            onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
            placeholder="e.g. Cataract OU"
          />
        </div>
        <div className="field wide">
          <label>C/O (Complaints)</label>
          <textarea
            value={form.coComplaints}
            onChange={(e) => setForm((f) => ({ ...f, coComplaints: e.target.value }))}
            placeholder="e.g. Blurred vision for 3 months"
          />
        </div>
        <div className="field wide">
          <label>O.C (Other complaints / observations)</label>
          <textarea
            value={form.ocOther}
            onChange={(e) => setForm((f) => ({ ...f, ocOther: e.target.value }))}
            placeholder="e.g. Mild photophobia"
          />
        </div>
        <div className="field wide">
          <label>Family history</label>
          <input
            value={form.familyHistory}
            onChange={(e) => setForm((f) => ({ ...f, familyHistory: e.target.value }))}
            placeholder="e.g. Mother - cataract"
          />
        </div>
      </div>

      <h3 className="section-title">External examination</h3>
      <div className="grid-2">
        {(
          [
            ['headPosture', 'Head posture'],
            ['foreheadFacialSymmetry', 'Forehead and facial symmetry'],
            ['eyebrows', 'Eyebrows'],
            ['eyelids', 'Eyelids'],
            ['palpebralAperture', 'Palpebral aperture'],
            ['lacrimalApparatus', 'Lacrimal apparatus'],
            ['eyeball', 'Eyeball'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input
              value={form.examExternal[key] || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  examExternal: { ...f.examExternal, [key]: e.target.value },
                }))
              }
            />
          </div>
        ))}
      </div>

      <h3 className="section-title">Distance vision</h3>
      <div className="grid-4">
        {(
          [
            ['rEye', 'R-Eye'],
            ['rPh', 'R ph'],
            ['lEye', 'L-Eye'],
            ['lPh', 'L ph'],
          ] as const
        ).map(([key, label]) => (
          <SelectField
            key={key}
            label={label}
            value={form.vision.distance?.[key] || ''}
            options={DISTANCE_OPTIONS}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vision: {
                  ...f.vision,
                  distance: { ...f.vision.distance, [key]: v },
                },
              }))
            }
          />
        ))}
      </div>

      <h3 className="section-title">Near vision</h3>
      <div className="grid-4">
        {(
          [
            ['rEye', 'R-Eye'],
            ['rPh', 'R ph'],
            ['lEye', 'L-Eye'],
            ['lPh', 'L ph'],
          ] as const
        ).map(([key, label]) => (
          <SelectField
            key={key}
            label={label}
            value={form.vision.near?.[key] || ''}
            options={NEAR_OPTIONS}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vision: {
                  ...f.vision,
                  near: { ...f.vision.near, [key]: v },
                },
              }))
            }
          />
        ))}
      </div>

      <h3 className="section-title">Visual field</h3>
      <VisualFieldMarker
        value={form.visualField}
        onChange={(visualField) => setForm((f) => ({ ...f, visualField }))}
      />

      <div className="grid-2" style={{ marginTop: '0.75rem' }}>
        <SelectField
          label="Color vision"
          value={form.colorVision}
          options={COLOR_VISION_OPTIONS}
          onChange={(colorVision) => setForm((f) => ({ ...f, colorVision }))}
        />
      </div>

      <h3 className="section-title">Contrast sensitivity</h3>
      <div className="grid-2">
        {(
          [
            ['rEye', 'R-Eye (1-10)'],
            ['lEye', 'L-Eye (1-10)'],
          ] as const
        ).map(([key, label]) => (
          <SelectField
            key={key}
            label={label}
            value={form.vision.contrast?.[key] || ''}
            options={CONTRAST_OPTIONS}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                vision: {
                  ...f.vision,
                  contrast: { ...f.vision.contrast, [key]: v },
                },
              }))
            }
          />
        ))}
      </div>

      <h3 className="section-title">Inspection</h3>
      <div className="grid-2">
        {(
          [
            ['sclera', 'Sclera (White / Erythemia)'],
            ['pupilSize', 'Pupil size'],
            ['pupilShape', 'Pupil shape'],
            ['pupillaryLightReflex', 'Pupillary light reflex'],
            ['eyelidPtosis', 'Eyelid ptosis (Yes/No)'],
            ['nystagmus', 'Nystagmus (Yes/No)'],
            ['conjunctiva', 'Conjunctiva (Red / Anemic)'],
            ['ocularMovements', 'Ocular movements (CN III, IV, VI)'],
            ['cornealSensation', 'Corneal sensation'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input
              value={form.inspection[key] || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  inspection: { ...f.inspection, [key]: e.target.value },
                }))
              }
            />
          </div>
        ))}
      </div>

      <h3 className="section-title">Slit lamp / IOP</h3>
      <div className="grid-2">
        <div className="field">
          <label>Anterior segment</label>
          <input
            value={form.slitLamp.anteriorSegment || ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                slitLamp: { ...f.slitLamp, anteriorSegment: e.target.value },
              }))
            }
          />
        </div>
        <div className="field">
          <label>IOP - Right eye (mmHg)</label>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 14"
            value={form.iop.r}
            onChange={(e) => setForm((f) => ({ ...f, iop: { ...f.iop, r: e.target.value } }))}
          />
        </div>
        <div className="field">
          <label>IOP - Left eye (mmHg)</label>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 16"
            value={form.iop.l}
            onChange={(e) => setForm((f) => ({ ...f, iop: { ...f.iop, l: e.target.value } }))}
          />
        </div>
        <div className="field">
          <label>Optic nerve head (disc / cup)</label>
          <input
            value={form.slitLamp.opticNerveHead || ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                slitLamp: { ...f.slitLamp, opticNerveHead: e.target.value },
              }))
            }
          />
        </div>
        <div className="field">
          <label>Ophthalmoscopy - lens</label>
          <input
            value={form.slitLamp.ophthalmoscopyLens || ''}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                slitLamp: { ...f.slitLamp, ophthalmoscopyLens: e.target.value },
              }))
            }
          />
        </div>
      </div>

      <h3 className="section-title">Cataract assessment</h3>
      <div className="check-row">
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.cataract.rightEye)}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, rightEye: e.target.checked } }))
            }
          />
          R eye
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.cataract.leftEye)}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, leftEye: e.target.checked } }))
            }
          />
          L eye
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.cataract.psc)}
            onChange={(e) => setForm((f) => ({ ...f, cataract: { ...f.cataract, psc: e.target.checked } }))}
          />
          PSC
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.cataract.psx)}
            onChange={(e) => setForm((f) => ({ ...f, cataract: { ...f.cataract, psx: e.target.checked } }))}
          />
          PSX
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(form.cataract.subluxed)}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, subluxed: e.target.checked } }))
            }
          />
          Sub luxed / disloc
        </label>
      </div>
      <div className="grid-3">
        <div className="field">
          <label>NS grade</label>
          <select
            value={form.cataract.nsGrade || ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, nsGrade: e.target.value } }))
            }
          >
            <option value="">-</option>
            <option value="NS I">NS I</option>
            <option value="NS II">NS II</option>
            <option value="NS III">NS III</option>
            <option value="NS IV">NS IV</option>
          </select>
        </div>
        <div className="field">
          <label>K1</label>
          <input
            value={form.cataract.k1 || ''}
            onChange={(e) => setForm((f) => ({ ...f, cataract: { ...f.cataract, k1: e.target.value } }))}
          />
        </div>
        <div className="field">
          <label>K2</label>
          <input
            value={form.cataract.k2 || ''}
            onChange={(e) => setForm((f) => ({ ...f, cataract: { ...f.cataract, k2: e.target.value } }))}
          />
        </div>
        <div className="field">
          <label>Cyl</label>
          <input
            value={form.cataract.cyl || ''}
            onChange={(e) => setForm((f) => ({ ...f, cataract: { ...f.cataract, cyl: e.target.value } }))}
          />
        </div>
        <div className="field">
          <label>Cyl axis @</label>
          <input
            value={form.cataract.cylAxis || ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, cylAxis: e.target.value } }))
            }
          />
        </div>
        <div className="field">
          <label>Axial (mm)</label>
          <input
            value={form.cataract.axialMm || ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, axialMm: e.target.value } }))
            }
          />
        </div>
        <div className="field">
          <label>Diopter</label>
          <input
            value={form.cataract.diopter || ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, cataract: { ...f.cataract, diopter: e.target.value } }))
            }
          />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: '0.75rem' }}>
        <div className="field wide">
          <label>Ix / Investigations</label>
          <textarea value={form.ixHistory} onChange={(e) => setForm((f) => ({ ...f, ixHistory: e.target.value }))} />
        </div>
        <div className="field wide">
          <label>Additional notes</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save visit'}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          {'\u2190'} Back without saving
        </button>
      </div>
    </form>
  );
}
