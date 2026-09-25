import type { ChangeEvent, ReactNode } from 'react';
import type { FollowupColumn, FormDataMap, FormField, InputKind } from './types';
import {
  htmlInputType,
  inferInputKind,
  nowDate,
  nowDateTimeLocal,
  toDateTimeLocalValue,
  toDateValue,
} from './helpers';
import { DateInput, DateTimeLocalInput } from '../components/DateInput';

type Props = {
  fields: FormField[];
  data: FormDataMap;
  onChange: (next: FormDataMap) => void;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asRows(value: unknown): Array<Record<string, string>> {
  return Array.isArray(value) ? (value as Array<Record<string, string>>) : [];
}

function columnKind(col: FollowupColumn): InputKind {
  return col.inputType || inferInputKind(col.key, col.label);
}

function displayValue(kind: InputKind, value: unknown): string {
  if (kind === 'datetime') return toDateTimeLocalValue(value);
  if (kind === 'date') return toDateValue(value);
  return String(value ?? '');
}

function FieldShell({
  label,
  unit,
  wide,
  children,
}: {
  label: string;
  unit?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${wide ? ' wide' : ''}`}>
      <label>
        {label}
        {unit ? <span className="field-unit"> ({unit})</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Soft example hint when a field has no explicit placeholder. */
function examplePlaceholder(label: string, kind: 'text' | 'number' | 'textarea'): string {
  const l = label.toLowerCase();
  if (kind === 'number') {
    if (l.includes('iop') || l.includes('pressure')) return 'e.g. 14';
    if (l.includes('cmt')) return 'e.g. 250';
    if (l.includes('hba1c')) return 'e.g. 7.2';
    if (l.includes('srf')) return 'e.g. 80';
    if (l.includes('age')) return 'e.g. 55';
    return 'e.g. 0';
  }
  if (kind === 'textarea') return 'e.g. Additional notes…';
  if (l.includes('bcva') || l.includes('ucva') || l === 'va' || l.includes('vision')) return 'e.g. 6/18';
  if (l.includes('phone')) return 'e.g. 0771234567';
  if (l.includes('name')) return 'e.g. Kamala Silva';
  return `e.g. ${label}`;
}

export function FormFields({ fields, data, onChange }: Props) {
  function setKey(key: string, value: unknown) {
    onChange({ ...data, [key]: value });
  }

  function toggleCheck(key: string, option: string) {
    const current = asStringArray(data[key]);
    const next = current.includes(option)
      ? current.filter((x) => x !== option)
      : [...current, option];
    setKey(key, next);
  }

  return (
    <>
      {fields.map((field, idx) => {
        if (field.type === 'section') {
          return (
            <h3 className="section-title" key={`sec-${idx}`}>
              {field.title}
            </h3>
          );
        }

        if (field.type === 'text') {
          return (
            <FieldShell key={field.key} label={field.label} unit={field.unit}>
              <input
                type={field.inputType || 'text'}
                value={String(data[field.key] ?? '')}
                placeholder={field.placeholder || examplePlaceholder(field.label, 'text')}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </FieldShell>
          );
        }

        if (field.type === 'date') {
          return (
            <FieldShell key={field.key} label={field.label}>
              <DateInput
                value={toDateValue(data[field.key])}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </FieldShell>
          );
        }

        if (field.type === 'datetime') {
          return (
            <FieldShell key={field.key} label={field.label}>
              <DateTimeLocalInput
                value={toDateTimeLocalValue(data[field.key])}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </FieldShell>
          );
        }

        if (field.type === 'number') {
          return (
            <FieldShell key={field.key} label={field.label} unit={field.unit}>
              <input
                type="number"
                inputMode="decimal"
                value={data[field.key] == null || data[field.key] === '' ? '' : String(data[field.key])}
                placeholder={field.placeholder || examplePlaceholder(field.label, 'number')}
                step={field.step ?? 'any'}
                min={field.min}
                max={field.max}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </FieldShell>
          );
        }

        if (field.type === 'textarea') {
          return (
            <FieldShell key={field.key} label={field.label} wide>
              <textarea
                rows={field.rows || 3}
                value={String(data[field.key] ?? '')}
                placeholder={examplePlaceholder(field.label, 'textarea')}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </FieldShell>
          );
        }

        if (field.type === 'select') {
          return (
            <FieldShell key={field.key} label={field.label}>
              <select
                value={String(data[field.key] ?? '')}
                onChange={(e) => setKey(field.key, e.target.value)}
              >
                {field.allowEmpty !== false && <option value="">—</option>}
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </FieldShell>
          );
        }

        if (field.type === 'checkboxes') {
          const selected = asStringArray(data[field.key]);
          return (
            <FieldShell key={field.key} label={field.label} wide>
              <div className="check-grid">
                {field.options.map((opt) => (
                  <label key={opt} className="check-item">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() => toggleCheck(field.key, opt)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </FieldShell>
          );
        }

        if (field.type === 'radio') {
          const value = String(data[field.key] ?? '');
          return (
            <FieldShell key={field.key} label={field.label} wide>
              <div className="check-row">
                {field.options.map((opt) => (
                  <label key={opt}>
                    <input
                      type="radio"
                      name={field.key}
                      checked={value === opt}
                      onChange={() => setKey(field.key, opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </FieldShell>
          );
        }

        if (field.type === 'score') {
          const value = data[field.key];
          return (
            <FieldShell key={field.key} label={field.label} wide>
              <div className="check-grid">
                {field.options.map((opt) => (
                  <label key={opt.value} className="check-item">
                    <input
                      type="radio"
                      name={field.key}
                      checked={Number(value) === opt.value}
                      onChange={() => setKey(field.key, opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </FieldShell>
          );
        }

        if (field.type === 'followup') {
          const rows = asRows(data[field.key]);
          return (
            <div className="field wide" key={field.key}>
              <label>{field.label}</label>
              <div className="table-wrap">
                <table className="table followup-table">
                  <thead>
                    <tr>
                      {field.columns.map((col) => (
                        <th key={col.key}>
                          {col.label}
                          {col.unit ? ` (${col.unit})` : ''}
                        </th>
                      ))}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={field.columns.length + 1} className="muted">
                          No follow-up rows yet.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, rowIdx) => (
                        <tr key={rowIdx}>
                          {field.columns.map((col) => {
                            const kind = columnKind(col);
                            const common = {
                              className: `followup-input followup-input--${kind}`,
                              value: displayValue(kind, row[col.key]),
                              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                                const next = rows.map((r, i) =>
                                  i === rowIdx ? { ...r, [col.key]: e.target.value } : r
                                );
                                setKey(field.key, next);
                              },
                            };
                            return (
                              <td key={col.key}>
                                {kind === 'date' ? (
                                  <DateInput {...common} />
                                ) : kind === 'datetime' ? (
                                  <DateTimeLocalInput {...common} />
                                ) : (
                                  <input
                                    {...common}
                                    type={htmlInputType(kind)}
                                    inputMode={kind === 'number' ? 'decimal' : undefined}
                                    step={kind === 'number' ? col.step ?? 'any' : undefined}
                                    min={kind === 'number' ? col.min : undefined}
                                    max={kind === 'number' ? col.max : undefined}
                                    placeholder={
                                      col.placeholder ||
                                      (kind === 'number'
                                        ? examplePlaceholder(col.label, 'number')
                                        : kind === 'text' || kind === 'tel'
                                          ? examplePlaceholder(col.label, 'text')
                                          : undefined)
                                    }
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td>
                            <button
                              type="button"
                              className="btn danger"
                              onClick={() =>
                                setKey(
                                  field.key,
                                  rows.filter((_, i) => i !== rowIdx)
                                )
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn secondary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => {
                  const blank: Record<string, string> = {};
                  for (const col of field.columns) {
                    const kind = columnKind(col);
                    if (kind === 'datetime') blank[col.key] = nowDateTimeLocal();
                    else if (kind === 'date') blank[col.key] = nowDate();
                    else blank[col.key] = '';
                  }
                  setKey(field.key, [...rows, blank]);
                }}
              >
                Add follow-up row
              </button>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}
