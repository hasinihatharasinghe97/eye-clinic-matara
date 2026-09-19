import type { FollowupColumn, FormField, InputKind } from './types';

export const section = (title: string): FormField => ({ type: 'section', title });

export const text = (
  key: string,
  label: string,
  placeholder?: string,
  opts?: { inputType?: 'text' | 'tel'; unit?: string }
): FormField => ({
  type: 'text',
  key,
  label,
  placeholder,
  inputType: opts?.inputType || 'text',
  unit: opts?.unit,
});

export const date = (key: string, label: string): FormField => ({
  type: 'date',
  key,
  label,
});

export const datetime = (key: string, label: string): FormField => ({
  type: 'datetime',
  key,
  label,
});

export const num = (
  key: string,
  label: string,
  opts?: { placeholder?: string; step?: string | number; min?: number; max?: number; unit?: string }
): FormField => ({
  type: 'number',
  key,
  label,
  placeholder: opts?.placeholder,
  step: opts?.step ?? 'any',
  min: opts?.min,
  max: opts?.max,
  unit: opts?.unit,
});

export const area = (key: string, label: string, rows = 3): FormField => ({
  type: 'textarea',
  key,
  label,
  rows,
});

export const select = (
  key: string,
  label: string,
  options: string[],
  allowEmpty = true
): FormField => ({
  type: 'select',
  key,
  label,
  options,
  allowEmpty,
});

export const checks = (key: string, label: string, options: string[]): FormField => ({
  type: 'checkboxes',
  key,
  label,
  options,
});

export const radio = (key: string, label: string, options: string[]): FormField => ({
  type: 'radio',
  key,
  label,
  options,
});

export const score = (
  key: string,
  label: string,
  options: Array<{ value: number; label: string }>
): FormField => ({ type: 'score', key, label, options });

export const followup = (
  key: string,
  label: string,
  columns: FollowupColumn[]
): FormField => ({ type: 'followup', key, label, columns });

export const eyeField = radio('eyeDetail', 'Eye laterality detail', [
  'Right (OD)',
  'Left (OS)',
  'Both',
]);

/** Infer a sensible input for follow-up / unlabeled columns. */
export function inferInputKind(key: string, label = ''): InputKind {
  const k = key.toLowerCase();
  const l = label.toLowerCase();
  const blob = `${k} ${l}`;

  if (
    blob.includes('datetime') ||
    blob.includes('date time') ||
    blob.includes('date/time') ||
    k.includes('timestamp') ||
    l.includes('date & time')
  ) {
    return 'datetime';
  }
  if (
    k === 'date' ||
    k === 'dob' ||
    k.endsWith('date') ||
    k.startsWith('date') ||
    l === 'date' ||
    l.includes('date') ||
    l.includes('dob')
  ) {
    return 'date';
  }
  if (
    ['cmt', 'iop', 'hba1c', 'pma', 'srf', 'srfheight', 'csgs', 'csgsTotal', 'clockhours', 'choroidalthickness', 'htnduration'].includes(
      k
    ) ||
    l.includes('(µm)') ||
    l.includes('µm') ||
    l.includes('mmhg') ||
    l.includes('mm hg') ||
    (l.includes('thickness') && !l.includes('va')) ||
    l.includes('hba1c') ||
    l.includes('pma') ||
    l.includes('clock hour') ||
    l.includes('score (0') ||
    l.includes('duration (years)') ||
    l.includes('duration (year')
  ) {
    return 'number';
  }
  if (k.includes('phone') || l.includes('phone') || l.includes('telephone')) {
    return 'tel';
  }
  return 'text';
}

export function htmlInputType(kind: InputKind): string {
  if (kind === 'datetime') return 'datetime-local';
  return kind;
}

export function nowDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function colomboParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
  };
}

export function nowDateTimeLocal(): string {
  const p = colomboParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Normalize stored values into what <input type="datetime-local"> expects. */
export function toDateTimeLocalValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Canonical clinic storage: YYYY-MM-DDTHH:mm:ss+05:30
  const clinic = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?\+05:30$/);
  if (clinic) return `${clinic[1]}T${clinic[2]}:${clinic[3]}`;
  // Already a naive wall-clock value from the form — keep as-is
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    return raw.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const p = colomboParts(parsed);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  return '';
}

export function toDateValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Canonical clinic datetime or naive datetime → calendar day
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}
