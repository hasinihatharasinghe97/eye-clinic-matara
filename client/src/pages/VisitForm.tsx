import { useEffect, useState } from 'react';
import {
  api,
  type CataractData,
  type ExamExternal,
  type InspectionData,
  type SlitLampData,
  type Visit,
  type VisionData,
} from '../api';

type Props = {
  patientId: string;
  visitId?: string;
  onDone: () => void;
  onCancel: () => void;
};

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
  iop: string;
  colorVision: string;
  visualField: string;
  notes: string;
};

const blank = (): FormState => ({
  visitDate: new Date().toISOString().slice(0, 10),
  coComplaints: '',
  ocOther: '',
  familyHistory: '',
  examExternal: {},
  vision: { distance: {}, near: {} },
  inspection: {},
  slitLamp: {},
  cataract: {},
  ixHistory: '',
  diagnosis: '',
  iop: '',
  colorVision: '',
  visualField: '',
  notes: '',
});

export function VisitForm({ patientId, visitId, onDone, onCancel }: Props) {
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
        },
        inspection: v.inspection || {},
        slitLamp: v.slitLamp || {},
        cataract: v.cataract || {},
        ixHistory: v.ixHistory || '',
        diagnosis: v.diagnosis || '',
        iop: v.iop || '',
        colorVision: v.colorVision || '',
        visualField: v.visualField || '',
        notes: v.notes || '',
      });
    }).catch((err) => setError(err.message));
  }, [patientId, visitId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (visitId) await api.updateVisit(patientId, visitId, form);
      else await api.createVisit(patientId, form);
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
          <input value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} />
        </div>
        <div className="field wide">
          <label>C/O (Complaints)</label>
          <textarea value={form.coComplaints} onChange={(e) => setForm((f) => ({ ...f, coComplaints: e.target.value }))} />
        </div>
        <div className="field wide">
          <label>O.C (Other complaints / observations)</label>
          <textarea value={form.ocOther} onChange={(e) => setForm((f) => ({ ...f, ocOther: e.target.value }))} />
        </div>
        <div className="field wide">
          <label>Family history</label>
          <input value={form.familyHistory} onChange={(e) => setForm((f) => ({ ...f, familyHistory: e.target.value }))} />
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
            ['cfs', 'CFS'],
            ['hm', 'HM'],
            ['pl', 'PL'],
          ] as const
        ).map(([key, label]) => (
          <div className="field" key={key}>
            <label>{label}</label>
            <input
              value={form.vision.distance?.[key] || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vision: {
                    ...f.vision,
                    distance: { ...f.vision.distance, [key]: e.target.value },
                  },
                }))
              }
            />
          </div>
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
          <div className="field" key={key}>
            <label>{label}</label>
            <input
              value={form.vision.near?.[key] || ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vision: {
                    ...f.vision,
                    near: { ...f.vision.near, [key]: e.target.value },
                  },
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: '0.75rem' }}>
        <div className="field">
          <label>Visual field</label>
          <input value={form.visualField} onChange={(e) => setForm((f) => ({ ...f, visualField: e.target.value }))} />
        </div>
        <div className="field">
          <label>Color vision</label>
          <input value={form.colorVision} onChange={(e) => setForm((f) => ({ ...f, colorVision: e.target.value }))} />
        </div>
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
          <label>IOP</label>
          <input value={form.iop} onChange={(e) => setForm((f) => ({ ...f, iop: e.target.value }))} />
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
          <label>Ophthalmoscopy — lens</label>
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
            <option value="">—</option>
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
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save visit'}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
