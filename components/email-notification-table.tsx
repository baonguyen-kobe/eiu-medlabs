"use client";

import { Fragment, useMemo, useState } from "react";
import {
  deleteSelectedEmailNotifications,
  retryFailedEmail,
} from "@/app/email-notifications/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ChevronDown, Trash2 } from "@/components/icons";

type EmailNotificationRow = {
  id: string;
  notification_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const statusLabels: Record<string, string> = {
  pending: "Chờ gửi",
  processing: "Đang gửi",
  sent: "Đã gửi",
  sent_unconfirmed: "Đã gửi · Chờ đối soát DB",
  failed: "Thất bại",
  simulated: "Kiểm thử",
  suppressed: "Đã tắt gửi",
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getStatusLabel(item: EmailNotificationRow) {
  if (item.status === "simulated" && item.sent_at) {
    return "Đã gửi kiểm thử";
  }
  if (item.status === "simulated") {
    return "Kiểm thử – chưa gửi";
  }
  return statusLabels[item.status] ?? item.status;
}

export function EmailNotificationTable({
  notifications,
  isAdmin,
  canRetry,
  deliveryMode,
}: {
  notifications: EmailNotificationRow[];
  isAdmin: boolean;
  canRetry: boolean;
  deliveryMode: "off" | "test" | "live";
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const allIds = useMemo(
    () => notifications.map((notification) => notification.id),
    [notifications],
  );
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(allIds) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <>
      {isAdmin ? (
        <form
          action={deleteSelectedEmailNotifications}
          className="email-notification-bulk-actions"
        >
          {[...selectedIds].map((id) => (
            <input key={id} type="hidden" name="notification_ids" value={id} />
          ))}
          <div className="email-notification-bulk-left">
            <label className="email-mobile-select-all">
              <input
                type="checkbox"
                aria-label="Chọn tất cả email trên trang"
                checked={allSelected}
                onChange={(event) => toggleAll(event.target.checked)}
              />
              <span>Chọn tất cả</span>
            </label>
            <span className="email-notification-selected-count">
              Đã chọn {selectedIds.size} email
            </span>
          </div>
          <ConfirmSubmitButton
            className="button button-danger email-notification-delete-btn"
            disabled={!selectedIds.size}
            message={`Xóa vĩnh viễn ${selectedIds.size} email thông báo đã chọn?`}
          >
            <Trash2 size={16} />
            Xóa đã chọn
          </ConfirmSubmitButton>
        </form>
      ) : null}
      <div
        className="responsive-table"
        role="region"
        aria-label="Nhật ký email thông báo"
        tabIndex={0}
      >
        <table className="data-table catalog-data-table email-notification-table">
          <colgroup>
            {isAdmin ? <col className="email-notification-col-select" /> : null}
            <col className="email-notification-col-time" />
            <col className="email-notification-col-recipient" />
            <col className="email-notification-col-content" />
            <col className="email-notification-col-status" />
            <col className="email-notification-col-attempts" />
            <col className="email-notification-col-error" />
            <col className="email-notification-col-action" />
          </colgroup>
          <thead>
            <tr>
              {isAdmin ? (
                <th className="email-notification-select-column">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả email trên trang"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                  />
                </th>
              ) : null}
              <th>Thời gian</th>
              <th>Người nhận</th>
              <th>Nội dung</th>
              <th>Trạng thái</th>
              <th>Lần gửi</th>
              <th>Lỗi gần nhất</th>
              <th>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((item) => {
              const isExpanded = expandedId === item.id;
              const formattedTime = formatDateTime(item.created_at);
              const statusText = getStatusLabel(item);

              return (
                <Fragment key={item.id}>
                  {/* Desktop Table Row (active > 920px) */}
                  <tr className="email-notification-desktop-row">
                    {isAdmin ? (
                      <td className="email-notification-select-column">
                        <input
                          type="checkbox"
                          aria-label={`Chọn email ${item.subject}`}
                          checked={selectedIds.has(item.id)}
                          onChange={(event) =>
                            toggleOne(item.id, event.target.checked)
                          }
                        />
                      </td>
                    ) : null}
                    <td>{formattedTime}</td>
                    <td>{item.recipient_email}</td>
                    <td>
                      <strong>{item.subject}</strong>
                      <small>{item.notification_type}</small>
                    </td>
                    <td>
                      <span className="status-pill">{statusText}</span>
                    </td>
                    <td>{item.attempts}</td>
                    <td>
                      <small>{item.last_error ?? "—"}</small>
                    </td>
                    <td className="table-action">
                      {item.status === "failed" &&
                      deliveryMode !== "off" &&
                      canRetry ? (
                        <form action={retryFailedEmail}>
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            className="button button-primary row-action-button"
                            type="submit"
                          >
                            Gửi lại
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>

                  {/* Mobile Strategy D Card Row (active <= 920px) */}
                  <tr className="email-notification-mobile-row">
                    <td
                      colSpan={isAdmin ? 8 : 7}
                      className="email-notification-mobile-cell"
                    >
                      <article className="email-notification-card">
                        <div
                          className="email-notification-card-summary"
                          onClick={() => toggleExpand(item.id)}
                        >
                          <div className="email-notification-card-top">
                            <div className="email-notification-card-identity">
                              {isAdmin ? (
                                <input
                                  type="checkbox"
                                  className="email-notification-card-checkbox"
                                  aria-label={`Chọn email ${item.subject}`}
                                  checked={selectedIds.has(item.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) =>
                                    toggleOne(item.id, event.target.checked)
                                  }
                                />
                              ) : null}
                              <time className="email-notification-card-time">
                                {formattedTime}
                              </time>
                            </div>
                            <span className="status-pill email-notification-card-status">
                              {statusText}
                            </span>
                          </div>

                          <div className="email-notification-card-subject">
                            {item.subject}
                          </div>

                          <div className="email-notification-card-bottom">
                            <div className="email-notification-card-recipient">
                              {item.recipient_email}
                            </div>
                            <button
                              type="button"
                              className="email-notification-chevron-button"
                              aria-label={
                                isExpanded
                                  ? `Thu gọn chi tiết email ${item.subject}`
                                  : `Mở chi tiết email ${item.subject}`
                              }
                              aria-expanded={isExpanded}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpand(item.id);
                              }}
                            >
                              <ChevronDown
                                size={18}
                                className={`email-notification-chevron-icon ${
                                  isExpanded ? "is-expanded" : ""
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Secondary Detail */}
                        {isExpanded ? (
                          <div className="email-notification-card-detail">
                            <dl className="email-notification-detail-grid">
                              <div className="email-notification-detail-row">
                                <dt>Loại thông báo</dt>
                                <dd>{item.notification_type}</dd>
                              </div>
                              <div className="email-notification-detail-row">
                                <dt>Lần gửi</dt>
                                <dd>{item.attempts}</dd>
                              </div>
                              <div className="email-notification-detail-row">
                                <dt>Lỗi gần nhất</dt>
                                <dd className="email-notification-error-text">
                                  {item.last_error ?? "—"}
                                </dd>
                              </div>
                              {item.sent_at ? (
                                <div className="email-notification-detail-row">
                                  <dt>Thời gian gửi</dt>
                                  <dd>{formatDateTime(item.sent_at)}</dd>
                                </div>
                              ) : null}
                            </dl>

                            {item.status === "failed" &&
                            deliveryMode !== "off" &&
                            canRetry ? (
                              <div className="email-notification-card-action">
                                <form action={retryFailedEmail}>
                                  <input
                                    type="hidden"
                                    name="id"
                                    value={item.id}
                                  />
                                  <button
                                    className="button button-primary row-action-button"
                                    type="submit"
                                  >
                                    Gửi lại
                                  </button>
                                </form>
                              </div>
                            ) : null}
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
    </>
  );
}
