import type { InputHTMLAttributes } from 'react';

type DateProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

function openPicker(el: HTMLInputElement) {
  try {
    el.showPicker?.();
  } catch {
    /* Already open, or browser blocked non-gesture call */
  }
}

const supportCache: Record<string, boolean> = {};

/** True when the browser has a native picker for this input type (older Safari/Firefox may not). */
function supportsInputType(type: 'date' | 'datetime-local') {
  if (supportCache[type] === undefined) {
    try {
      const el = document.createElement('input');
      el.setAttribute('type', type);
      el.value = 'not-a-date';
      // Unsupported types fall back to "text" and keep the junk value.
      supportCache[type] = el.type === type && el.value === '';
    } catch {
      supportCache[type] = false;
    }
  }
  return supportCache[type];
}

/**
 * `<input type="date">` that opens the calendar when clicking anywhere on the field.
 * Browsers without a date picker get a text box that takes YYYY-MM-DD, the same
 * value format the native picker produces.
 */
export function DateInput({ className, onClick, ...props }: DateProps) {
  const cls = ['date-field-input', className].filter(Boolean).join(' ');
  if (!supportsInputType('date')) {
    return (
      <input
        {...props}
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        pattern="\d{4}-\d{2}-\d{2}"
        maxLength={10}
        title="Date as YYYY-MM-DD, e.g. 2026-10-23"
        className={cls}
        onClick={onClick}
      />
    );
  }
  return (
    <input
      {...props}
      type="date"
      className={cls}
      onClick={(e) => {
        onClick?.(e);
        openPicker(e.currentTarget);
      }}
    />
  );
}

/** `<input type="datetime-local">` with the same full-field picker behavior and text fallback. */
export function DateTimeLocalInput({ className, onClick, ...props }: DateProps) {
  const cls = ['date-field-input', className].filter(Boolean).join(' ');
  if (!supportsInputType('datetime-local')) {
    return (
      <input
        {...props}
        type="text"
        placeholder="YYYY-MM-DDTHH:MM"
        pattern="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"
        maxLength={16}
        title="Date and time as YYYY-MM-DDTHH:MM, e.g. 2026-10-23T09:30"
        className={cls}
        onClick={onClick}
      />
    );
  }
  return (
    <input
      {...props}
      type="datetime-local"
      className={cls}
      onClick={(e) => {
        onClick?.(e);
        openPicker(e.currentTarget);
      }}
    />
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type MonthInputProps = {
  /** "YYYY-MM" */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable month, "YYYY-MM" (later months are disabled). */
  max?: string;
  /** Earliest year offered (default: 15 years before `max`). */
  minYear?: number;
  disabled?: boolean;
};

/**
 * Month + year picker built from two dropdowns, so it looks and works the same in
 * every browser (`<input type="month">` is missing in desktop Firefox and Safari).
 */
export function MonthInput({ value, onChange, max, minYear, disabled }: MonthInputProps) {
  const [year, month] = value.split('-').map(Number);
  const [maxYear, maxMonth] = (max || '9999-12').split('-').map(Number);
  const lastYear = max ? maxYear : new Date().getFullYear();
  const firstYear = Math.min(minYear ?? lastYear - 15, year || lastYear);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);

  const emit = (y: number, m: number) => {
    // Keep within max: picking the latest year snaps a future month back to max.
    const capped = max && (y > maxYear || (y === maxYear && m > maxMonth)) ? maxMonth : m;
    onChange(`${y}-${String(capped).padStart(2, '0')}`);
  };

  return (
    <span className="month-input">
      <select
        aria-label="Month"
        value={month || ''}
        disabled={disabled}
        onChange={(e) => emit(year, Number(e.target.value))}
      >
        {MONTH_NAMES.map((name, i) => (
          <option
            key={name}
            value={i + 1}
            disabled={Boolean(max) && year === maxYear && i + 1 > maxMonth}
          >
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={year || ''}
        disabled={disabled}
        onChange={(e) => emit(Number(e.target.value), month)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  );
}
