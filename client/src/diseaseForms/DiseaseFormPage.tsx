import { useEffect, useState } from 'react';
import { api, type DiseaseAssessment } from '../api';
import { useDiseaseForm } from './DiseaseFormsContext';
import { FormFields } from './FormFields';
import { nowDate, toDateValue } from './helpers';
import type { FormDataMap } from './types';

type Props = {
  patientId: string;
  formType: string;
  assessmentId?: string;
  patientName?: string | null;
  onDone: () => void;
  onCancel: () => void;
};

export function DiseaseFormPage({
  patientId,
  formType,
  assessmentId,
  patientName,
  onDone,
  onCancel,
}: Props) {
  const def = useDiseaseForm(formType);
  const [assessmentDate, setAssessmentDate] = useState(nowDate);
  const [eye, setEye] = useState('Both');
  const [notes, setNotes] = useState('');
  const [data, setData] = useState<FormDataMap>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!assessmentId) return;
    api
      .getDiseaseAssessment(patientId, assessmentId)
      .then((a: DiseaseAssessment) => {
        setAssessmentDate(toDateValue(a.assessmentDate) || nowDate());
        setEye(a.eye || 'Both');
        setNotes(a.notes || '');
        setData(a.data || {});
      })
      .catch((err) => setError(err.message));
  }, [patientId, assessmentId]);

  if (!def) {
    return (
      <div className="card">
        <p className="error">Unknown disease form.</p>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        formType,
        assessmentDate: toDateValue(assessmentDate) || nowDate(),
        eye,
        data,
        notes,
      };
      if (assessmentId) {
        await api.updateDiseaseAssessment(patientId, assessmentId, payload);
      } else {
        await api.createDiseaseAssessment(patientId, payload);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{def.title}</h2>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {assessmentId ? 'Edit assessment' : 'New assessment'}
            {patientName ? ` — ${patientName}` : ''}
          </p>
        </div>
      </div>

      <div className="grid-3">
        <div className="field">
          <label>Assessment date</label>
          <input
            type="date"
            value={assessmentDate}
            onChange={(e) => setAssessmentDate(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Eye</label>
          <select value={eye} onChange={(e) => setEye(e.target.value)}>
            <option>Right (OD)</option>
            <option>Left (OS)</option>
            <option>Both</option>
            <option>OD</option>
            <option>OS</option>
          </select>
        </div>
      </div>

      <div className="disease-form-fields" style={{ marginTop: '0.75rem' }}>
        <FormFields fields={def.fields} data={data} onChange={setData} />
        <div className="field wide">
          <label>Extra notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save assessment'}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          ← Back without saving
        </button>
      </div>
    </form>
  );
}
