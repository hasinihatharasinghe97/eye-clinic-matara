import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cx } from '@/lib/cx';

type FieldShellProps = {
  label: ReactNode;
  /** Extra help shown under the control. */
  hint?: ReactNode;
  /** Validation message; also marks the control as invalid for screen readers. */
  error?: ReactNode;
  className?: string;
  /** Receives the generated ids so the control is linked to its label and messages. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

/**
 * Label + control + hint/error, correctly linked for accessibility.
 * Prefer the ready-made TextField / SelectField / TextAreaField below.
 */
export function Field({ label, hint, error, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('field', className)}>
      <label htmlFor={id}>{label}</label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="field-hint muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Shared = { label: ReactNode; hint?: ReactNode; error?: ReactNode; fieldClassName?: string };

export type TextFieldProps = Shared & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>;

/** A labelled text input (also for password, number, email, tel…). */
export function TextField({ label, hint, error, fieldClassName, ...input }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...input}
        />
      )}
    </Field>
  );
}

export type SelectFieldProps = Shared &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
    options: ReadonlyArray<{ value: string; label: ReactNode }>;
  };

/** A labelled dropdown. */
export function SelectField({
  label,
  hint,
  error,
  fieldClassName,
  options,
  ...select
}: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...select}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export type TextAreaFieldProps = Shared & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>;

/** A labelled multi-line text box. */
export function TextAreaField({
  label,
  hint,
  error,
  fieldClassName,
  ...textarea
}: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          {...textarea}
        />
      )}
    </Field>
  );
}
