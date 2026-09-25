export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type Props = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
};

function pageItems(current: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (current >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', totalPages];
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const items = pageItems(current, totalPages);

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <span className="pagination-count">Count: {total}</span>

      <div className="pagination-pages">
        <button
          type="button"
          className="pagination-btn"
          aria-label="Previous page"
          disabled={disabled || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          ‹
        </button>
        {items.map((item, i) =>
          item === 'ellipsis' ? (
            <span key={`e-${i}`} className="pagination-ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`pagination-btn pagination-num${item === current ? ' active' : ''}`}
              aria-label={`Page ${item}`}
              aria-current={item === current ? 'page' : undefined}
              disabled={disabled}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="pagination-btn"
          aria-label="Next page"
          disabled={disabled || current >= totalPages}
          onClick={() => onPageChange(current + 1)}
        >
          ›
        </button>
      </div>

      <label className="pagination-size">
        <span className="sr-only">Rows per page</span>
        <select
          value={pageSize}
          disabled={disabled}
          aria-label="Rows per page"
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
