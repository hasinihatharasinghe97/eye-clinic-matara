import { useEffect, useState } from 'react';
import { api, type Patient } from '../api';

type Props = {
  patientId?: string;
  onDone: (id: string) => void;
  onCancel: () => void;
};

const empty: Partial<Patient> & { name: string } = {
  name: '',
  age: null,
  gender: '',
  registrationDate: new Date().toISOString().slice(0, 10),
  opdAdNo: '',
  occupation: '',
  idNumber: '',
  address: '',
  phone: '',
};

export function PatientForm({ patientId, onDone, onCancel }: Props) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(patientId);

  useEffect(() => {
    if (!patientId) return;
    api.getPatient(patientId).then((p) => {
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
      });
    }).catch((err) => setError(err.message));
  }, [patientId]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        age: form.age == null || Number.isNaN(Number(form.age)) ? null : Number(form.age),
        name: form.name.trim(),
      };
      const saved = editing && patientId
        ? await api.updatePatient(patientId, payload)
        : await api.createPatient(payload);
      onDone(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'Edit patient' : 'New patient'}</h2>
      <div className="grid-2">
        <div className="field wide">
          <label>Name *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </div>
        <div className="field">
          <label>Age</label>
          <input
            type="number"
            min={0}
            value={form.age ?? ''}
            onChange={(e) => set('age', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Gender</label>
          <select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <input
            type="date"
            value={form.registrationDate || ''}
            onChange={(e) => set('registrationDate', e.target.value)}
          />
        </div>
        <div className="field">
          <label>OPD AD NO</label>
          <input value={form.opdAdNo || ''} onChange={(e) => set('opdAdNo', e.target.value)} />
        </div>
        <div className="field">
          <label>Occupation</label>
          <input value={form.occupation || ''} onChange={(e) => set('occupation', e.target.value)} />
        </div>
        <div className="field">
          <label>ID number</label>
          <input value={form.idNumber || ''} onChange={(e) => set('idNumber', e.target.value)} />
        </div>
        <div className="field">
          <label>WhatsApp / Telephone</label>
          <input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="field wide">
          <label>Address</label>
          <textarea value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save patient'}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
