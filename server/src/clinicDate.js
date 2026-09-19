/** Clinic calendar timezone (Nethraloka — Matara, Sri Lanka). */
export const CLINIC_TZ = 'Asia/Colombo';
export const CLINIC_OFFSET = '+05:30';

/**
 * Storage formats (use these everywhere — do not mix UTC / local / bare strings):
 * - Calendar day:  YYYY-MM-DD
 * - Date-time:     YYYY-MM-DDTHH:mm:ss+05:30
 */

/**
 * Calendar day YYYY-MM-DD in the clinic timezone.
 * Never use Date#toISOString().slice(0, 10) for this — that is UTC and is wrong
 * for ~5.5 hours each night in Sri Lanka (midnight–05:29).
 */
export function clinicCalendarDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** YYYY-MM month key in the clinic timezone. */
export function clinicMonthKey(d = new Date()) {
  return clinicCalendarDate(d).slice(0, 7);
}

function colomboParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Parts of "now" in Asia/Colombo (for schedulers that must not use server local/UTC).
 */
export function clinicClock(now = new Date()) {
  const p = colomboParts(now);
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    monthKey: `${p.year}-${p.month}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/**
 * Instant timestamp for created_at / updated_at / backup stamps.
 * Always: YYYY-MM-DDTHH:mm:ss+05:30
 */
export function clinicTimestamp(d = new Date()) {
  const p = colomboParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${CLINIC_OFFSET}`;
}

/** Alias used by routes instead of new Date().toISOString(). */
export function nowClinic() {
  return clinicTimestamp();
}

function hasExplicitOffset(s) {
  return /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
}

/**
 * Store a calendar day as YYYY-MM-DD (clinic terms).
 * - Bare YYYY-MM-DD kept as-is
 * - Naive datetime-local (no Z/offset) → date prefix (wall-clock day from the form)
 * - Instant timestamps (ISO with Z/offset) → Asia/Colombo calendar day
 */
export function normalizeClinicDate(raw, fallbackDate = new Date()) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return clinicCalendarDate(raw);
  }
  const s = String(raw ?? '').trim();
  if (!s) return clinicCalendarDate(fallbackDate);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // datetime-local / MySQL DATETIME without zone → trust the written calendar day
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !hasExplicitOffset(s)) {
    return s.slice(0, 10);
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return clinicCalendarDate(d);

  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return clinicCalendarDate(fallbackDate);
}

/**
 * Store a date-time as YYYY-MM-DDTHH:mm:ss+05:30.
 * Naive form values (datetime-local) are treated as Asia/Colombo wall clock.
 */
export function normalizeClinicDateTime(raw, fallbackDate = new Date()) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return clinicTimestamp(raw);
  }
  const s = String(raw ?? '').trim();
  if (!s) return clinicTimestamp(fallbackDate);

  // Already in canonical clinic offset form
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+05:30$/.test(s)) {
    const [datePart, timePart] = s.split('T');
    const [hh, mm, ss = '00'] = timePart.replace(/\+05:30$/, '').split(':');
    return `${datePart}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${String(ss).padStart(2, '0')}+05:30`;
  }

  // Naive wall clock from <input type="datetime-local">
  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive && !hasExplicitOffset(s)) {
    const sec = naive[4] || '00';
    return `${naive[1]}T${naive[2]}:${naive[3]}:${sec}+05:30`;
  }

  // Date-only → midnight Colombo
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T00:00:00+05:30`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return clinicTimestamp(d);
  return clinicTimestamp(fallbackDate);
}

/**
 * Sortable calendar day for analytics. Same rules as normalizeClinicDate,
 * but returns null for empty/invalid instead of inventing "today".
 */
export function toClinicSortableDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return clinicCalendarDate(value);
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !hasExplicitOffset(s)) {
    return s.slice(0, 10);
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return clinicCalendarDate(d);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Walk form JSON and coerce date-like strings into the canonical storage formats.
 * - YYYY-MM-DD stays date
 * - anything with time becomes YYYY-MM-DDTHH:mm:ss+05:30
 */
export function normalizeFormDataDates(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFormDataDates(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeFormDataDates(v);
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) || hasExplicitOffset(s)) {
    return normalizeClinicDateTime(s);
  }
  return value;
}
