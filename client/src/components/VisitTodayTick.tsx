type Props = {
  checked: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (next: boolean) => void | Promise<void>;
};

/** Tick to mark that the patient attended the clinic today (not a full screening form). */
export function VisitTodayTick({ checked, disabled, label = 'Visited today', onChange }: Props) {
  return (
    <label
      className={`visit-tick${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          void onChange(e.target.checked);
        }}
      />
      <span className="visit-tick-box" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="visit-tick-label">{label}</span>
    </label>
  );
}
