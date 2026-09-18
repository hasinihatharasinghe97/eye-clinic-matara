import { useEffect, useMemo, useState } from 'react';
import { api, type Patient } from '../api';
import { openWhatsAppChat, toWhatsAppNumber } from '../whatsapp';

const MEDICINE_MAX = 200;

type Props = {
  patient: Patient;
  busy?: boolean;
  onPatientUpdated?: (patient: Patient) => void;
};

function sortedUnique(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isInteger(n) && n >= 1 && n <= MEDICINE_MAX))].sort(
    (a, b) => a - b
  );
}

export function SendMedicineWhatsApp({ patient, busy, onPatientUpdated }: Props) {
  const [phone, setPhone] = useState(patient.phone || '');
  const [medicineNo, setMedicineNo] = useState<number | ''>('');
  const [sent, setSent] = useState<number[]>(() => sortedUnique(patient.medicinesSent || []));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);

  useEffect(() => {
    setPhone(patient.phone || '');
    setSent(sortedUnique(patient.medicinesSent || []));
    setMedicineNo('');
    setStatus('');
    setError('');
  }, [patient.id, patient.phone, patient.medicinesSent]);

  const waNumber = toWhatsAppNumber(phone);
  const sentSet = useMemo(() => new Set(sent), [sent]);
  const alreadySent = medicineNo !== '' && sentSet.has(medicineNo);
  const numbers = useMemo(() => Array.from({ length: MEDICINE_MAX }, (_, i) => i + 1), []);

  async function persistSent(next: number[]) {
    const normalized = sortedUnique(next);
    setSavingGrid(true);
    try {
      const updated = await api.updateMedicinesSent(patient.id, normalized);
      setSent(updated.medicinesSent || normalized);
      onPatientUpdated?.(updated);
      return updated;
    } finally {
      setSavingGrid(false);
    }
  }

  async function setMarked(n: number, marked: boolean) {
    setError('');
    const next = marked ? [...sent, n] : sent.filter((x) => x !== n);
    try {
      await persistSent(next);
      setStatus(marked ? `Marked medicine #${n} as sent.` : `Cleared mark for medicine #${n}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update medicine marks');
    }
  }

  async function openChatAndMarkSent() {
    setError('');
    setStatus('');
    if (!waNumber) {
      setError('Enter a valid WhatsApp number (e.g. 0771234567).');
      return;
    }
    if (medicineNo === '') {
      setError('Tap the medicine number (1–200) you will send, then open WhatsApp.');
      return;
    }
    if (alreadySent) {
      const ok = window.confirm(
        `Medicine #${medicineNo} was already marked as sent. Open WhatsApp again anyway?`
      );
      if (!ok) return;
    }

    setSending(true);
    try {
      // Open this patient's chat (no pre-filled message). Attach the PDF inside WhatsApp.
      openWhatsAppChat(waNumber, '');
      await persistSent([...sent, medicineNo]);
      setStatus(
        `WhatsApp opened for +${waNumber}. Attach medicine PDF #${medicineNo} in the chat (paperclip). That number is marked as sent.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open WhatsApp');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Send medicine on WhatsApp</h3>
      <p className="muted">
        1) Tap the medicine number you will send (1–200). 2) Tap{' '}
        <strong>Open WhatsApp &amp; mark sent</strong>. 3) In the chat, attach that PDF with the
        paperclip. The number is marked sent when you open WhatsApp (we cannot see which file you
        attach inside WhatsApp).
      </p>

      <div className="grid-2">
        <div className="field">
          <label>Patient WhatsApp number</label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0771234567"
          />
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {waNumber
              ? `Will open chat +${waNumber}`
              : patient.phone
                ? 'Number on file could not be read — edit it here'
                : 'No phone on patient record — type the WhatsApp number'}
          </span>
        </div>

        <div className="field">
          <label>Medicine number to send (1–200)</label>
          <input
            type="number"
            min={1}
            max={MEDICINE_MAX}
            value={medicineNo}
            disabled={sending || busy}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setMedicineNo('');
                return;
              }
              const n = Number(v);
              if (Number.isInteger(n) && n >= 1 && n <= MEDICINE_MAX) setMedicineNo(n);
            }}
            placeholder="Tap grid below, or type e.g. 45"
          />
          {alreadySent && (
            <span className="error" style={{ fontSize: '0.82rem' }}>
              Medicine #{medicineNo} already marked as sent for this patient.
            </span>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}

      <div className="row" style={{ marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={sending || busy || !waNumber || medicineNo === ''}
          onClick={() => void openChatAndMarkSent()}
        >
          {sending ? 'Opening…' : 'Open WhatsApp & mark sent'}
        </button>
        {medicineNo !== '' && (
          <>
            <button
              className="btn secondary"
              type="button"
              disabled={sending || busy || savingGrid || alreadySent}
              onClick={() => void setMarked(medicineNo, true)}
            >
              Mark #{medicineNo} sent only
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={sending || busy || savingGrid || !alreadySent}
              onClick={() => void setMarked(medicineNo, false)}
            >
              Clear #{medicineNo}
            </button>
          </>
        )}
      </div>

      <div className="medicine-sent-block">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h4 style={{ margin: '1.1rem 0 0.35rem' }}>Medicines sent (1–{MEDICINE_MAX})</h4>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            {sent.length} marked
            {savingGrid ? ' · saving…' : ''}
          </span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.82rem' }}>
          Filled = already sent. Tap a number to select it, then open WhatsApp.
        </p>
        <div className="medicine-grid" role="group" aria-label="Medicine numbers 1 to 200">
          {numbers.map((n) => {
            const marked = sentSet.has(n);
            const selected = medicineNo === n;
            return (
              <button
                key={n}
                type="button"
                className={`medicine-cell${marked ? ' sent' : ''}${selected ? ' selected' : ''}`}
                title={
                  marked
                    ? `Medicine #${n} already sent — tap to select`
                    : `Select medicine #${n}`
                }
                disabled={sending || busy}
                onClick={() => setMedicineNo(n)}
                onDoubleClick={() => void setMarked(n, !marked)}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
