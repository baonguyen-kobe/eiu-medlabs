"use client";

import {
  TABLE_PAGE_SIZE,
  totalPagesFor,
  visiblePageNumbers,
} from "@/lib/pagination";

export function PaginationControls({
  currentPage,
  totalItems,
  onPageChange,
  pageSize = TABLE_PAGE_SIZE,
}: {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  const totalPages = totalPagesFor(totalItems, pageSize);
  const page = Math.min(Math.max(currentPage, 1), totalPages);
  if (totalPages <= 1) return null;

  const goTo = (nextPage: number) => {
    onPageChange(Math.min(Math.max(nextPage, 1), totalPages));
  };

  return (
    <nav className="table-pagination" aria-label="Phân trang">
      <button
        type="button"
        aria-label="Trang đầu"
        disabled={page === 1}
        onClick={() => goTo(1)}
      >
        &lt;&lt;
      </button>
      <button
        type="button"
        aria-label="Trang trước"
        disabled={page === 1}
        onClick={() => goTo(page - 1)}
      >
        &lt;
      </button>
      {visiblePageNumbers(page, totalPages).map((pageNumber) => (
        <button
          type="button"
          className={pageNumber === page ? "is-current" : undefined}
          aria-current={pageNumber === page ? "page" : undefined}
          key={pageNumber}
          onClick={() => goTo(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        aria-label="Trang tiếp theo"
        disabled={page === totalPages}
        onClick={() => goTo(page + 1)}
      >
        &gt;
      </button>
      <button
        type="button"
        aria-label="Trang cuối"
        disabled={page === totalPages}
        onClick={() => goTo(totalPages)}
      >
        &gt;&gt;
      </button>
    </nav>
  );
}
