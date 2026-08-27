"use client";

import { Fragment, useState } from "react";
import { ChevronDown, FileClock } from "@/components/icons";

export type ImportBatchRow = {
  id: string;
  original_file_name: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  imported_rows: number;
  duplicate_rows: number;
  conflict_rows: number;
  created_at: string;
  completed_at: string | null;
  room_types: { name: string } | null | unknown;
};

const importStatusLabels: Record<string, string> = {
  uploaded: "Đã tải lên",
  validating: "Đang kiểm tra",
  ready: "Sẵn sàng import",
  validated: "Đã kiểm tra",
  importing: "Đang tạo lịch",
  completed: "Hoàn tất",
  completed_with_errors: "Hoàn tất · Có lỗi",
  failed: "Thất bại",
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ImportHistoryTable({ batches }: { batches: ImportBatchRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div
      className="responsive-table"
      role="region"
      aria-label="Lịch sử import; vuốt ngang để xem đầy đủ"
      tabIndex={0}
    >
      <table className="data-table import-history-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Thời điểm</th>
            <th>Trạng thái</th>
            <th>Phạm vi</th>
            <th>Tổng</th>
            <th>Đã tạo</th>
            <th>Cảnh báo</th>
            <th>Lỗi</th>
            <th>Trùng</th>
            <th>Xung đột</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const isExpanded = expandedId === batch.id;
            const formattedTime = formatDateTime(batch.created_at);
            const statusText = importStatusLabels[batch.status] ?? batch.status;
            const scopeName =
              (batch.room_types as { name: string } | null)?.name ??
              "Kỹ năng Điều dưỡng";

            return (
              <Fragment key={batch.id}>
                {/* Desktop Table Row (active > 920px) */}
                <tr className="import-history-desktop-row">
                  <td>
                    <strong>
                      <FileClock size={15} /> {batch.original_file_name}
                    </strong>
                    <small className="mono">{batch.id}</small>
                  </td>
                  <td>{formattedTime}</td>
                  <td>
                    <span className="status-pill">{statusText}</span>
                  </td>
                  <td>
                    <strong>{scopeName}</strong>
                  </td>
                  <td>{batch.total_rows}</td>
                  <td>{batch.imported_rows}</td>
                  <td>{batch.warning_rows}</td>
                  <td>{batch.error_rows}</td>
                  <td>{batch.duplicate_rows}</td>
                  <td>{batch.conflict_rows}</td>
                </tr>

                {/* Mobile Strategy D Card Row (active <= 920px) */}
                <tr className="import-history-mobile-row">
                  <td colSpan={10} className="import-history-mobile-cell">
                    <article className="import-history-card">
                      <div
                        className="import-history-card-summary"
                        onClick={() => toggleExpand(batch.id)}
                      >
                        <div className="import-history-card-top">
                          <span className="import-history-card-time">
                            {formattedTime}
                          </span>
                          <span className="status-pill import-history-card-status">
                            {statusText}
                          </span>
                        </div>

                        <div className="import-history-card-file">
                          <FileClock size={16} />
                          <strong className="import-history-file-name">
                            {batch.original_file_name}
                          </strong>
                        </div>

                        <div className="import-history-card-bottom">
                          <span className="import-history-card-scope">
                            {scopeName}
                          </span>
                          <button
                            type="button"
                            className="import-history-chevron-button"
                            aria-label={
                              isExpanded
                                ? `Thu gọn chi tiết import ${batch.original_file_name}`
                                : `Mở chi tiết import ${batch.original_file_name}`
                            }
                            aria-expanded={isExpanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpand(batch.id);
                            }}
                          >
                            <ChevronDown
                              size={18}
                              className={`import-history-chevron-icon ${
                                isExpanded ? "is-expanded" : ""
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Secondary Detail */}
                      {isExpanded ? (
                        <div className="import-history-card-detail">
                          <dl className="import-history-detail-grid">
                            <div className="import-history-detail-row">
                              <dt>Tổng số dòng</dt>
                              <dd>{batch.total_rows}</dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Đã tạo thành công</dt>
                              <dd className="import-stat-success">
                                {batch.imported_rows}
                              </dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Cảnh báo</dt>
                              <dd>{batch.warning_rows}</dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Lỗi</dt>
                              <dd
                                className={
                                  batch.error_rows > 0
                                    ? "import-stat-error"
                                    : ""
                                }
                              >
                                {batch.error_rows}
                              </dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Dữ liệu trùng</dt>
                              <dd>{batch.duplicate_rows}</dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Xung đột lịch</dt>
                              <dd
                                className={
                                  batch.conflict_rows > 0
                                    ? "import-stat-error"
                                    : ""
                                }
                              >
                                {batch.conflict_rows}
                              </dd>
                            </div>
                            <div className="import-history-detail-row">
                              <dt>Mã phiên</dt>
                              <dd className="mono import-batch-id">
                                {batch.id}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ) : null}
                    </article>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
