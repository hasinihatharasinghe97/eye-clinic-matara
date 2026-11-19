import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'link';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual style. `primary` is the main action on a screen; use it once per area. */
  variant?: ButtonVariant;
  /** Shows `busyLabel` and disables the button while an action runs. */
  busy?: boolean;
  busyLabel?: ReactNode;
  /** Stretch to the full width of the container. */
  block?: boolean;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn',
  secondary: 'btn secondary',
  danger: 'btn danger',
  'danger-outline': 'btn danger-outline',
  link: 'linkish',
};

/**
 * The app's one button. Defaults to `type="button"` so it never submits a form by
 * accident; pass `type="submit"` for form buttons.
 */
export function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  block = false,
  type = 'button',
  disabled,
  className,
  children,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(VARIANT_CLASS[variant], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={block ? { width: '100%', ...style } : style}
      {...rest}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
