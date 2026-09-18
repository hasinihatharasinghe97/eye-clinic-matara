import { useEffect, useMemo, useState } from 'react';
import { api, type Attachment, type Patient } from '../api';
import {
  defaultMedicineMessage,
  downloadFile,
  openWhatsAppChat,
  sharePdfToWhatsApp,
  toWhatsAppNumber,
} from '../whatsapp';

const MEDICINE_MAX = 200;

type Props = {
  patient: Patient;
  attachments: Attachment[];
  busy?: boolean;
  onPatientUpdated?: (patient: Patient) => void;
};

/** Extract medicine number 1–200 from filenames like "45.pdf", "Medicine 12.pdf". */
export function parseMedicineNumber(filename: string): number | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const matches = [...base.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]));
  for (let i = matches.length - 1; i >= 0; i--) {
    const n = matches[i];
    if (n >= 1 && n <= MEDICINE_MAX) return n;
  }
  return null;
}

function sortedUnique(nums: number[]): number[] {
  return [...new Set(nums.filter((n) => Number.isInteger(n) && n >= 1 && n <= MEDICINE_MAX))].sort(
    (a, b) => a - b
  );
}

function findPdfForMedicine(pdfs: Attachment[], medicineNo: number): Attachment | undefined {
  return pdfs.find((a) => parseMedicineNumber(a.originalName) === medicineNo);
}

export function SendMedicineWhatsApp({ patient, attachments, busy, onPatientUpdated }: Props) {
  const pdfAttachments = useMemo(
    () =>
      attachments.filter(
        (a) =>
          a.mimeType === 'application/pdf' ||
          a.originalName.toLowerCase().endsWith('.pdf')
      ),
    [attachments]
  );

  const [phone, setPhone] = useState(patient.phone || '');
  const [message, setMessage] = useState(() => defaultMedicineMessage(patient.name));
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState('');
  const [medicineNo, setMedicineNo] = useState<number | ''>('');
  const [sent, setSent] = useState<number[]>(() => sortedUnique(patient.medicinesSent || []));
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);

  useEffect(() => {
    setPhone(patient.phone || '');
    setMessage(defaultMedicineMessage(patient.name));
    setSent(sortedUnique(patient.medicinesSent || []));
    setPickedFile(null);
    setMedicineNo('');
    setSelectedAttachmentId('');
  }, [patient.id, patient.name, patient.phone, patient.medicinesSent]);

  // When attachments load, auto-pick the only PDF (if any)
  useEffect(() => {
    if (pickedFile || selectedAttachmentId) return;
    if (pdfAttachments.length !== 1) return;
    setSelectedAttachmentId(pdfAttachments[0].id);
    const n = parseMedicineNumber(pdfAttachments[0].originalName);
    if (n != null) setMedicineNo(n);
  }, [pdfAttachments, pickedFile, selectedAttachmentId]);

  useEffect(() => {
    if (medicineNo === '') return;
    setMessage(defaultMedicineMessage(patient.name, undefined, medicineNo));
    if (pickedFile) return;
    const match = findPdfForMedicine(pdfAttachments, medicineNo);
    if (match) setSelectedAttachmentId(match.id);
  }, [medicineNo, patient.name, pdfAttachments, pickedFile]);

  const waNumber = toWhatsAppNumber(phone);
  const sentSet = useMemo(() => new Set(sent), [sent]);
  const alreadySent = medicineNo !== '' && sentSet.has(medicineNo);

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

  async function resolvePdfFile(): Promise<File | null> {
    if (pickedFile) return pickedFile;
    if (!selectedAttachmentId) return null;
    const att = pdfAttachments.find((a) => a.id === selectedAttachmentId);
    if (!att) return null;
    const res = await fetch(att.url);
    if (!res.ok) throw new Error('Could not load the saved PDF');
    const blob = await res.blob();
    return new File([blob], att.originalName || 'medicine.pdf', {
      type: 'application/pdf',
    });
  }

  function applyFileNameHint(name: string) {
    const n = parseMedicineNumber(name);
    if (n != null) setMedicineNo(n);
  }

  async function send() {
    setError('');
    setStatus('');
    if (!waNumber) {
      setError('Enter a valid WhatsApp number (e.g. 0771234567 or +94 77 123 4567).');
      return;
    }
    if (medicineNo === '') {
      setError('Select the medicine PDF number (1–200) before sending.');
      return;
    }
    if (alreadySent) {
      const ok = window.confirm(
        `Medicine #${medicineNo} was already marked as sent to this patient. Send again anyway?`
      );
      if (!ok) return;
    }

    const msg = message.trim() || defaultMedicineMessage(patient.name, undefined, medicineNo);
    const title = `Medicine #${medicineNo} — ${patient.name}`;

    setSending(true);
    try {
      const file = await resolvePdfFile();
      if (!file) {
        setError(
          'Select a medicine PDF from this device, or choose one already on file for this patient.'
        );
        return;
      }

      // Preferred (phones): system share sheet with the PDF → pick WhatsApp
      const shareResult = await sharePdfToWhatsApp({
        file,
        message: msg,
        title,
        phoneHint: waNumber,
      });
      if (shareResult === 'aborted') {
        setStatus('Share cancelled — medicine not marked.');
        return;
      }
      if (shareResult === 'shared') {
        await persistSent([...sent, medicineNo]);
        setStatus(
          `PDF ready in share — tap WhatsApp, then ${patient.name} (+${waNumber}). Medicine #${medicineNo} marked as sent.`
        );
        return;
      }

      // Fallback (computers / no file-share): open chat + download PDF to attach
      downloadFile(file);
      openWhatsAppChat(waNumber, msg);
      await persistSent([...sent, medicineNo]);
      setStatus(
        `WhatsApp opened for +${waNumber}. Attach the downloaded PDF with the paperclip.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare WhatsApp send');
    } finally {
      setSending(false);
    }
  }

  function openChatOnly() {
    setError('');
    if (!waNumber) {
      setError('Enter a valid WhatsApp number (e.g. 0771234567).');
      return;
    }
    openWhatsAppChat(waNumber, message);
    setStatus(`WhatsApp chat opened for +${waNumber}.`);
  }

  const numbers = useMemo(() => Array.from({ length: MEDICINE_MAX }, (_, i) => i + 1), []);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Send medicine PDF on WhatsApp</h3>
      <p className="muted">
        Tap a medicine number, then <strong>Send PDF via WhatsApp</strong>. On your phone this opens
        the share sheet with the PDF — choose <strong>WhatsApp</strong> and the patient. (The number
        shown above is filled from their record so you can pick the right chat.)
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
              ? `Will open WhatsApp for +${waNumber}`
              : patient.phone
                ? 'Number on file could not be read — edit it here'
                : 'No phone on patient record — type the WhatsApp number'}
          </span>
        </div>

        <div className="field">
          <label>Medicine number (1–200)</label>
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
            placeholder="e.g. 45"
          />
          {alreadySent && (
            <span className="error" style={{ fontSize: '0.82rem' }}>
              Medicine #{medicineNo} already marked as sent for this patient.
            </span>
          )}
        </div>

        <div className="field wide">
          <label>Message</label>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>

        <div className="field wide">
          <label>Medicine PDF from phone / laptop</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={sending || busy}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setPickedFile(f);
              if (f) {
                setSelectedAttachmentId('');
                applyFileNameHint(f.name);
              }
            }}
          />
          {pickedFile && (
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              Selected: {pickedFile.name}
            </span>
          )}
        </div>

        {pdfAttachments.length > 0 && (
          <div className="field wide">
            <label>Or use a PDF already on file for this patient</label>
            <select
              value={selectedAttachmentId}
              disabled={sending || busy || Boolean(pickedFile)}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedAttachmentId(id);
                if (id) {
                  setPickedFile(null);
                  const att = pdfAttachments.find((a) => a.id === id);
                  if (att) applyFileNameHint(att.originalName);
                }
              }}
            >
              <option value="">—</option>
              {pdfAttachments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                  {parseMedicineNumber(a.originalName) != null
                    ? ` (#${parseMedicineNumber(a.originalName)})`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {status && <p className="success">{status}</p>}

      <div className="row" style={{ marginTop: '0.85rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={sending || busy || !waNumber || medicineNo === ''}
          onClick={() => void send()}
        >
          {sending ? 'Preparing…' : 'Send PDF via WhatsApp'}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={sending || busy || !waNumber}
          onClick={openChatOnly}
        >
          Open WhatsApp chat only
        </button>
        {medicineNo !== '' && (
          <>
            <button
              className="btn secondary"
              type="button"
              disabled={sending || busy || savingGrid || alreadySent}
              onClick={() => void setMarked(medicineNo, true)}
            >
              Mark #{medicineNo} sent
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
          Filled cells = already sent. Tap a number to select it (auto-picks matching PDF on file if
          the filename contains that number).
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
