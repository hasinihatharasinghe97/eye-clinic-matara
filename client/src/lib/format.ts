/** Human-readable file size: 512 B, 3.4 KB, 1.2 MB. Empty for unknown sizes. */
export function formatSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A stored value as a Date. "YYYY-MM-DD" is read as a local calendar day (new Date() would
 * read it as UTC midnight and can show the previous day).
 */
function toDate(value: string | number | Date): Date {
  if (typeof value === 'string') {
    const m = DAY_ONLY.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(value);
}

/**
 * Readable calendar date for tables and headings: "15 Nov 2026"
 * (or "Sun, 15 Nov 2026" with { weekday: true }). Day before month avoids the
 * 11/12 vs 12/11 confusion of numeric dates.
 */
export function formatDate(
  value?: string | number | Date | null,
  { weekday = false, fallback = '-' }: { weekday?: boolean; fallback?: string } = {}
): string {
  if (value == null || value === '') return fallback;
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : fallback;
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return weekday ? `${WEEKDAYS[d.getDay()]}, ${day}` : day;
}

// Fixed three-letter names: browsers differ ("Sep" vs "Sept"), and the PDF fonts are ASCII.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Month heading: "November 2026". Accepts "YYYY-MM" or any date. */
export function formatMonth(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : toDate(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** Local date and time for display, or a fallback when missing / invalid. */
export function formatDateTime(value?: string | number | Date | null, fallback = 'Never'): string {
  if (value == null || value === '') return fallback;
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return fallback;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(d)}, ${time}`;
}
