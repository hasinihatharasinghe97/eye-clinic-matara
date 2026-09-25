/** Allowed page sizes for list endpoints — keep in sync with client PAGE_SIZE_OPTIONS. */
export const PAGE_SIZES = [10, 25, 50, 100];

const PAGE_SIZE_SET = new Set(PAGE_SIZES);
const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/**
 * Parse and sanitize page / pageSize from a request query.
 * pageSize must be one of PAGE_SIZES; never an arbitrary hard-capped LIMIT.
 */
export function parsePagination(query = {}) {
  const pageSizeRaw = Number(query.pageSize);
  const pageSize = PAGE_SIZE_SET.has(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function paginationMeta(page, pageSize, total) {
  return {
    page,
    pageSize,
    total: Number(total) || 0,
  };
}
