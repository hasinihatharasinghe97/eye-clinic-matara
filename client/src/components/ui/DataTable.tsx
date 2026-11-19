import type { Key, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export type Column<T> = {
  /** Unique id for the column. */
  key: string;
  header: ReactNode;
  /** Cell content for one row. */
  render: (row: T) => ReactNode;
  className?: string;
  /**
   * Clicks inside this cell don't trigger onRowClick (for checkboxes, buttons, links).
   */
  stopRowClick?: boolean;
};

type DataTableProps<T> = {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => Key;
  /** Makes rows clickable (whole row highlights on hover). */
  onRowClick?: (row: T) => void;
  /** Accessible name for the table. */
  caption?: string;
  className?: string;
};

/**
 * A typed table: describe the columns once, pass the rows.
 * Scrolls sideways on small screens instead of squashing the columns.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  caption,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cx('table-wrap', className)}>
      <table className="table">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'clickable-row' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.className}
                  onClick={c.stopRowClick ? (e) => e.stopPropagation() : undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
