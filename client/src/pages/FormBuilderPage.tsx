import { useState } from 'react';
import { api } from '../api';
import { useDiseaseForms } from '../diseaseForms/DiseaseFormsContext';
import { BUILTIN_DISEASE_FORMS } from '../diseaseForms/catalog';
import type { FormField } from '../diseaseForms/types';
import { LoadingBlock } from '../components/PageNav';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const MAX_QUESTIONS = 15;

type QuestionKind = 'text' | 'number' | 'date' | 'notes' | 'checklist' | 'yesno';

type Question = {
  id: string;
  kind: QuestionKind;
  label: string;
  /** Comma-separated choices for checklist */
  choices: string;
};

type Props = {
  onNavigate: (to: string) => void;
};

const KIND_OPTIONS: Array<{ value: QuestionKind; label: string }> = [
  { value: 'text', label: 'Short answer' },
  { value: 'notes', label: 'Long notes' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'yesno', label: 'Yes / No' },
  { value: 'checklist', label: 'Checklist' },
];

const LABEL_PLACEHOLDER: Record<QuestionKind, string> = {
  text: 'e.g. BCVA',
  notes: 'e.g. Clinical notes',
  number: 'e.g. IOP',
  date: 'e.g. Onset date',
  yesno: 'e.g. Pain present?',
  checklist: 'e.g. Symptoms',
};

function uid() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Empty question row — labels stay blank; hints go in placeholders. */
function blankQuestion(kind: QuestionKind = 'text'): Question {
  return {
    id: uid(),
    kind,
    label: '',
    choices: '',
  };
}

/** Standard follow-up table — always included, no setup needed. */
function followUpField(): FormField {
  return {
    type: 'followup',
    key: 'followUps',
    label: 'Follow-up visits',
    columns: [
      { key: 'date', label: 'Date', inputType: 'date' },
      { key: 'va', label: 'VA', inputType: 'text', placeholder: 'e.g. 6/18' },
      { key: 'iop', label: 'IOP', inputType: 'number', placeholder: 'e.g. 14' },
      { key: 'remarks', label: 'Remarks', inputType: 'text', placeholder: 'e.g. Improving' },
    ],
  };
}

function questionsToFields(questions: Question[]): FormField[] {
  const fields: FormField[] = [{ type: 'section', title: 'Findings' }];
  const used = new Set<string>();

  for (const q of questions) {
    const label = q.label.trim();
    if (!label) continue;
    let key = slugify(label) || `field_${fields.length}`;
    if (used.has(key)) key = `${key}_${fields.length}`;
    used.add(key);

    if (q.kind === 'text') {
      fields.push({ type: 'text', key, label, placeholder: `e.g. ${label}` });
    } else if (q.kind === 'notes') {
      fields.push({ type: 'textarea', key, label, rows: 3 });
    } else if (q.kind === 'number') {
      const chartKey =
        /iop/i.test(label) ? 'iop'
        : /\bcmt\b/i.test(label) ? 'cmt'
        : /hba1c|hb\s*a1c/i.test(label) ? 'hba1c'
        : /srf/i.test(label) ? 'srfHeight'
        : key;
      fields.push({
        type: 'number',
        key: chartKey,
        label,
        step: 'any',
        placeholder: 'e.g. 14',
      });
    } else if (q.kind === 'date') {
      fields.push({ type: 'date', key, label });
    } else if (q.kind === 'yesno') {
      fields.push({ type: 'radio', key, label, options: ['Yes', 'No'] });
    } else if (q.kind === 'checklist') {
      const options = q.choices
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length === 0) continue;
      fields.push({ type: 'checkboxes', key, label, options });
    }
  }

  fields.push({ type: 'section', title: 'Follow-up' });
  fields.push(followUpField());
  return fields;
}

function fieldsToQuestions(fields: FormField[]): Question[] {
  const out: Question[] = [];
  for (const f of fields) {
    if (f.type === 'section' || f.type === 'followup') continue;
    if (f.type === 'text') {
      out.push({ id: uid(), kind: 'text', label: f.label, choices: '' });
    } else if (f.type === 'textarea') {
      out.push({ id: uid(), kind: 'notes', label: f.label, choices: '' });
    } else if (f.type === 'number') {
      out.push({ id: uid(), kind: 'number', label: f.label, choices: '' });
    } else if (f.type === 'date' || f.type === 'datetime') {
      out.push({ id: uid(), kind: 'date', label: f.label, choices: '' });
    } else if (f.type === 'radio') {
      const opts = (f.options || []).map((o) => o.toLowerCase());
      const isYesNo = opts.includes('yes') && opts.includes('no') && opts.length <= 3;
      out.push({
        id: uid(),
        kind: isYesNo ? 'yesno' : 'checklist',
        label: f.label,
        choices: isYesNo ? '' : (f.options || []).join(', '),
      });
    } else if (f.type === 'checkboxes' || f.type === 'select') {
      out.push({
        id: uid(),
        kind: 'checklist',
        label: f.label,
        choices: (f.options || []).join(', '),
      });
    }
  }
  return out.length ? out : [blankQuestion('text')];
}

export function FormBuilderPage({ onNavigate }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { customForms, ready, reload } = useDiseaseForms();
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([blankQuestion('text')]);
  const [trackIop, setTrackIop] = useState(true);
  const [trackCmt, setTrackCmt] = useState(false);
  const [busy, setBusy] = useState(false);

  const isNew = mode === 'edit' && !editingId;
  const atLimit = questions.length >= MAX_QUESTIONS;

  function startNew() {
    setEditingId(null);
    setName('');
    setQuestions([blankQuestion('text')]);
    setTrackIop(true);
    setTrackCmt(false);
    setMode('edit');
  }

  function startEdit(id: string) {
    const form = customForms.find((f) => f.id === id);
    if (!form) return;
    setEditingId(form.id);
    setName(form.shortTitle || form.title);
    const qs = fieldsToQuestions(form.fields || []);
    const labels = qs.map((q) => q.label.toLowerCase());
    setTrackIop(labels.some((l) => l.includes('iop')));
    setTrackCmt(labels.some((l) => /\bcmt\b/.test(l)));
    setQuestions(
      qs
        .filter((q) => {
          const l = q.label.toLowerCase();
          if (q.kind === 'number' && (l === 'iop' || l.includes('iop ('))) return false;
          if (q.kind === 'number' && (l === 'cmt' || l.includes('cmt ('))) return false;
          return true;
        })
        .slice(0, MAX_QUESTIONS)
    );
    setMode('edit');
  }

  function addQuestion(kind: QuestionKind) {
    setQuestions((list) => {
      if (list.length >= MAX_QUESTIONS) return list;
      return [...list, blankQuestion(kind)];
    });
  }

  function buildFields(): FormField[] {
    const qs = [...questions];
    if (trackIop && !qs.some((q) => /iop/i.test(q.label))) {
      qs.push({ id: uid(), kind: 'number', label: 'IOP (mmHg)', choices: '' });
    }
    if (trackCmt && !qs.some((q) => /\bcmt\b/i.test(q.label))) {
      qs.push({ id: uid(), kind: 'number', label: 'CMT (µm)', choices: '' });
    }
    return questionsToFields(qs);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const title = name.trim();
      if (!title) throw new Error('Enter the disease name');
      const fields = buildFields();
      const filled = fields.filter((f) => f.type !== 'section' && f.type !== 'followup');
      if (filled.length === 0) throw new Error('Add at least one question with a name');

      const payload = { title, shortTitle: title, fields };
      if (editingId) {
        const updated = await api.updateCustomDiseaseForm(editingId, payload);
        setEditingId(updated.id);
        setName(updated.shortTitle || updated.title);
        toast.success('Saved.');
      } else {
        const created = await api.createCustomDiseaseForm(payload);
        setEditingId(created.id);
        setName(created.shortTitle || created.title);
        toast.success('Form created. Select it on a patient to start using it.');
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save form');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, force = false) {
    const form = customForms.find((f) => f.id === id);
    if (!form) return;
    if (!force) {
      const ok = await confirm({
        title: 'Delete form?',
        message: `Delete “${form.shortTitle}”?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.deleteCustomDiseaseForm(id, force);
      await reload();
      toast.success(`Deleted “${form.shortTitle}”.`);
      if (editingId === id) setMode('list');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete form';
      if (/assessment/i.test(msg)) {
        const ok = await confirm({
          title: 'Delete anyway?',
          message: `${msg}\n\nDelete the form anyway?`,
          confirmLabel: 'Delete anyway',
          danger: true,
        });
        if (ok) await remove(id, true);
        else toast.error(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <LoadingBlock label="Loading…" />;

  if (mode === 'edit') {
    return (
      <form className="card simple-form-builder" onSubmit={save}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>{isNew ? 'New disease form' : 'Edit disease form'}</h2>
          <button className="btn secondary" type="button" onClick={() => setMode('list')}>
            ← Back
          </button>
        </div>

        <div className="field">
          <label>Disease name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Glaucoma"
            required
            autoFocus
          />
        </div>

        <h3 className="section-title">
          Questions to ask ({questions.length}/{MAX_QUESTIONS})
        </h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Type a question name in each row (up to {MAX_QUESTIONS}). A follow-up table is included
          automatically.
        </p>

        <div className="simple-q-list">
          {questions.map((q, index) => (
            <div key={q.id} className="simple-q-row">
              <span className="simple-q-num">{index + 1}</span>
              <input
                className="simple-q-label"
                value={q.label}
                onChange={(e) =>
                  setQuestions((list) =>
                    list.map((item) => (item.id === q.id ? { ...item, label: e.target.value } : item))
                  )
                }
                placeholder={LABEL_PLACEHOLDER[q.kind]}
                aria-label={`Question ${index + 1}`}
              />
              <select
                value={q.kind}
                onChange={(e) =>
                  setQuestions((list) =>
                    list.map((item) =>
                      item.id === q.id
                        ? { ...item, kind: e.target.value as QuestionKind }
                        : item
                    )
                  )
                }
                aria-label="Answer type"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                className="btn danger"
                type="button"
                title="Remove"
                disabled={questions.length <= 1}
                onClick={() => setQuestions((list) => list.filter((item) => item.id !== q.id))}
              >
                ×
              </button>
              {q.kind === 'checklist' && (
                <input
                  className="simple-q-choices"
                  value={q.choices}
                  onChange={(e) =>
                    setQuestions((list) =>
                      list.map((item) =>
                        item.id === q.id ? { ...item, choices: e.target.value } : item
                      )
                    )
                  }
                  placeholder="e.g. Blurring, Pain, Redness"
                  aria-label="Checklist choices"
                />
              )}
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          {(
            [
              ['text', '+ Short answer'],
              ['number', '+ Number'],
              ['yesno', '+ Yes / No'],
              ['checklist', '+ Checklist'],
              ['notes', '+ Notes'],
              ['date', '+ Date'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              className="btn secondary"
              type="button"
              disabled={atLimit}
              onClick={() => addQuestion(kind)}
            >
              {label}
            </button>
          ))}
        </div>
        {atLimit && (
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
            Maximum of {MAX_QUESTIONS} questions reached.
          </p>
        )}

        <h3 className="section-title">Also track on charts</h3>
        <div className="row" style={{ gap: '1.25rem' }}>
          <label className="check-item">
            <input
              type="checkbox"
              checked={trackIop}
              onChange={(e) => setTrackIop(e.target.checked)}
            />
            <span>Eye pressure (IOP)</span>
          </label>
          <label className="check-item">
            <input
              type="checkbox"
              checked={trackCmt}
              onChange={(e) => setTrackCmt(e.target.checked)}
            />
            <span>Macular thickness (CMT)</span>
          </label>
        </div>

        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create form' : 'Save'}
          </button>
          <button className="btn secondary" type="button" onClick={() => setMode('list')}>
            Cancel
          </button>
          {editingId && (
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={() => void remove(editingId)}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Disease forms</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Add a form for a new disease in a few steps. The 12 clinic PDF forms stay unchanged.
            </p>
          </div>
          <button className="btn" type="button" onClick={startNew}>
            New disease form
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Your forms</h3>
        {customForms.length === 0 ? (
          <p className="empty">
            None yet. Click <strong>New disease form</strong> (e.g. Glaucoma).
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Questions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customForms.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.shortTitle}</strong>
                    </td>
                    <td>
                      {(f.fields || []).filter((x) => x.type !== 'section' && x.type !== 'followup')
                        .length}
                    </td>
                    <td className="row">
                      <button className="btn secondary" type="button" onClick={() => startEdit(f.id)}>
                        Edit
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(f.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <details>
          <summary className="muted">Built-in forms ({BUILTIN_DISEASE_FORMS.length}) — view only</summary>
          <ul className="builtin-form-list" style={{ marginTop: '0.75rem' }}>
            {BUILTIN_DISEASE_FORMS.map((f) => (
              <li key={f.id}>{f.shortTitle}</li>
            ))}
          </ul>
        </details>
        <div style={{ marginTop: '0.85rem' }}>
          <button className="btn secondary" type="button" onClick={() => onNavigate('/')}>
            ← Patients
          </button>
        </div>
      </div>
    </>
  );
}
