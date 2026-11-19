import { useEffect, useState } from 'react';
import { clearLeaveGuard, useLeaveGuard } from '@/hooks/useLeaveGuard';
import { api, type DiseaseAssessment } from '@/lib/api';
import { useDiseaseForm } from './DiseaseFormsContext';
import { FormFields } from './FormFields';
import { nowDate, toDateValue } from './helpers';
import type { FormDataMap } from './types';
import { useToast } from '@/components/Toast';
import { DateInput } from '@/components/DateInput';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui';

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
  const toast = useToast();
  const def = useDiseaseForm(formType);
  const [assessmentDate, setAssessmentDate] = useState(nowDate);
  const [eye, setEye] = useState('Both');
  const [notes, setNotes] = useState('');
  const [data, setData] = useState<FormDataMap>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty);

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
      .catch((err) => toast.error(errorMessage(err, 'Failed to load assessment')));
  }, [patientId, assessmentId, toast]);

  if (!def) {
    return (
      <div className="card">
        <p className="muted">Unknown disease form.</p>
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
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
      clearLeaveGuard();
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'Save failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={submit}
      onChange={() => setDirty(true)}
      onClick={(e) => {
        if ((e.target as Element).closest('svg, [data-marks-dirty]')) setDirty(true);
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>{def.title}</h2>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {assessmentId ? 'Edit assessment' : 'New assessment'}
            {patientName ? ` - ${patientName}` : ''}
          </p>
        </div>
      </div>

      <div className="grid-3">
        <div className="field">
          <label>Assessment date</label>
          <DateInput
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

      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save assessment'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          ← Back without saving
        </Button>
      </div>
    </form>
  );
}
