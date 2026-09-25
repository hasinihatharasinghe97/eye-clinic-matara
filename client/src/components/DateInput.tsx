import type { InputHTMLAttributes } from 'react';

type DateProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

function openPicker(el: HTMLInputElement) {
  try {
    el.showPicker?.();
  } catch {
    /* Already open, or browser blocked non-gesture call */
  }
}

/** `<input type="date">` that opens the calendar when clicking anywhere on the field. */
export function DateInput({ className, onClick, ...props }: DateProps) {
  return (
    <input
      {...props}
      type="date"
      className={['date-field-input', className].filter(Boolean).join(' ')}
      onClick={(e) => {
        onClick?.(e);
        openPicker(e.currentTarget);
      }}
    />
  );
}

/** `<input type="datetime-local">` with the same full-field picker behavior. */
export function DateTimeLocalInput({ className, onClick, ...props }: DateProps) {
  return (
    <input
      {...props}
      type="datetime-local"
      className={['date-field-input', className].filter(Boolean).join(' ')}
      onClick={(e) => {
        onClick?.(e);
        openPicker(e.currentTarget);
      }}
    />
  );
}
