import type { ReactNode } from 'react';

export type TabItem<K extends string> = { key: K; label: ReactNode };

type TabsProps<K extends string> = {
  items: ReadonlyArray<TabItem<K>>;
  active: K;
  onChange: (key: K) => void;
  /** Accessible name, e.g. "Patient sections". */
  label: string;
};

/** Row of pill tabs; scrolls sideways on phones. */
export function Tabs<K extends string>({ items, active, onChange, label }: TabsProps<K>) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          className={t.key === active ? 'active' : ''}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
