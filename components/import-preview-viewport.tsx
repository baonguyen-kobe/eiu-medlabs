import type { ReactNode } from "react";
import { PaginationControls } from "@/components/pagination-controls";

type ImportPreviewViewportProps = {
  children: ReactNode;
  currentPage: number;
  label: string;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function ImportPreviewViewport({
  children,
  currentPage,
  label,
  totalItems,
  onPageChange,
}: ImportPreviewViewportProps) {
  return (
    <>
      <div
        className="preview-table-wrap"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
      <PaginationControls
        currentPage={currentPage}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </>
  );
}
