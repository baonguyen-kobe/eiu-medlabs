export const TABLE_PAGE_SIZE = 50;
export const MAX_VISIBLE_PAGE_NUMBERS = 5;

export function normalizePage(value: string | number | null | undefined) {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function paginationRange(page: number, pageSize = TABLE_PAGE_SIZE) {
  const normalizedPage = normalizePage(page);
  const from = (normalizedPage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPagesFor(totalItems: number, pageSize = TABLE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function visiblePageNumbers(
  currentPage: number,
  totalPages: number,
  maximum = MAX_VISIBLE_PAGE_NUMBERS,
) {
  const count = Math.min(maximum, totalPages);
  const half = Math.floor(count / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
