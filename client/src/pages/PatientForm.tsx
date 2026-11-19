import { useEffect, useState } from 'react';
import { clearLeaveGuard, useLeaveGuard } from '@/hooks/useLeaveGuard';
import { api, localClinicDate, type Patient } from '@/lib/api';
import { useDiseaseForms } from '@/diseaseForms/DiseaseFormsContext';
import { useToast } from '@/components/Toast';
import { DateInput } from '@/components/DateInput';
import { errorMessage } from '@/lib/errors';
import { Button, Field, SelectField, TextAreaField, TextField } from '@/components/ui';

const GENDER_OPTIONS = [
  { value: '', label: '-' },
  { value: 'M', label: 'M' },
  { value: 'F', label: 'F' },
] as const;

type Props = {
  patientId?: string;
  onDone: (id: string) => void;
  onCancel: () => void;
};

const emptyBase: Partial<Patient> & { name: string; conditions: string[] } = {
  name: '',
  age: null,
  gender: '',
  opdAdNo: '',
  occupation: '',
  idNumber: '',
  address: '',
  phone: '',
  conditions: [],
};

function emptyForm() {
  return { ...emptyBase, registrationDate: localClinicDate() };
}

export function PatientForm({ patientId, onDone, onCancel }: Props) {
  const toast = useToast();
  const { forms: DISEASE_FORMS } = useDiseaseForms();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty);
  const editing = Boolean(patientId);

  useEffect(() => {
    if (!patientId) return;
    api
      .getPatient(patientId)
      .then((p) => {
        setForm({
          name: p.name,
          age: p.age,
          gender: p.gender || '',
          registrationDate: p.registrationDate || '',
          opdAdNo: p.opdAdNo || '',
          occupation: p.occupation || '',
          idNumber: p.idNumber || '',
          address: p.address || '',
          phone: p.phone || '',
          conditions: p.conditions || [],
        });
      })
      .catch((err) => toast.error(errorMessage(err, 'Failed to load patient')));
  }, [patientId, toast]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCondition(id: string) {
    setForm((f) => {
      const current = f.conditions || [];
      return {
        ...f,
        conditions: current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
      };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const opdAdNo = String(form.opdAdNo || '').trim();
      if (!opdAdNo) {
        toast.error('OPD AD NO is required');
        setBusy(false);
        return;
      }
      const payload = {
        ...form,
        age: form.age == null || Number.isNaN(Number(form.age)) ? null : Number(form.age),
        name: form.name.trim(),
        opdAdNo,
        conditions: form.conditions || [],
      };
      const saved =
        editing && patientId
          ? await api.updatePatient(patientId, payload)
          : await api.createPatient(payload);
      toast.success(editing ? 'Patient updated.' : 'Patient registered.');
      clearLeaveGuard();
      onDone(saved.id);
    } catch (err) {
      toast.error(errorMessage(err, 'Save failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} onChange={() => setDirty(true)}>
      <h2>{editing ? 'Edit patient' : 'New patient'}</h2>
      <p className="muted" style={{ marginTop: '-0.35rem' }}>
        {editing
          ? 'Update registration details and monitored conditions.'
          : 'Register a new clinic patient.'}
      </p>
      <div className="grid-2">
        <TextField
          fieldClassName="wide"
          label="Name *"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Kamala Silva"
          autoFocus={!editing}
          required
        />
        <TextField
          label="Age"
          type="number"
          min={0}
          value={form.age ?? ''}
          placeholder="e.g. 55"
          onChange={(e) => set('age', e.target.value === '' ? null : Number(e.target.value))}
        />
        <SelectField
          label="Gender"
          value={form.gender || ''}
          onChange={(e) => set('gender', e.target.value)}
          options={GENDER_OPTIONS}
        />
        <Field label="Date">
          {({ id }) => (
            <DateInput
              id={id}
              value={form.registrationDate || ''}
              onChange={(e) => set('registrationDate', e.target.value)}
            />
          )}
        </Field>
        <TextField
          label="OPD AD NO *"
          value={form.opdAdNo || ''}
          onChange={(e) => set('opdAdNo', e.target.value)}
          placeholder="e.g. OPD-1024"
          required
        />
        <TextField
          label="Occupation"
          value={form.occupation || ''}
          onChange={(e) => set('occupation', e.target.value)}
          placeholder="e.g. Teacher"
        />
        <TextField
          label="ID number"
          value={form.idNumber || ''}
          onChange={(e) => set('idNumber', e.target.value)}
          placeholder="e.g. 197512345678"
        />
        <TextField
          label="WhatsApp / Telephone"
          type="tel"
          value={form.phone || ''}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="e.g. 0771234567"
        />
        <TextAreaField
          fieldClassName="wide"
          label="Address"
          value={form.address || ''}
          onChange={(e) => set('address', e.target.value)}
          placeholder="e.g. town or village"
        />
      </div>

      <h3 className="section-title">Disease forms to monitor</h3>
      <p className="muted">
        Select the conditions this patient needs. Matching monitoring forms will appear under
        Disease forms.
      </p>
      <div className="check-grid">
        {DISEASE_FORMS.map((f) => (
          <label key={f.id} className="check-item">
            <input
              type="checkbox"
              checked={(form.conditions || []).includes(f.id)}
              onChange={() => toggleCondition(f.id)}
            />
            <span>{f.shortTitle}</span>
          </label>
        ))}
      </div>

      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save patient'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          ← Back without saving
        </Button>
      </div>
    </form>
  );
}
