"use client";

import { useMemo, useState } from "react";
import {
  deleteSelectedEmailNotifications,
  retryFailedEmail,
} from "@/app/email-notifications/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Trash2 } from "@/components/icons";

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
          <span>Đã chọn {selectedIds.size} email</span>
          <ConfirmSubmitButton
            className="button button-danger"
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
            {notifications.map((item) => (
              <tr key={item.id}>
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
                <td>
                  {new Intl.DateTimeFormat("vi-VN", {
                    dateStyle: "short",
                    timeStyle: "medium",
                    timeZone: "Asia/Ho_Chi_Minh",
                  }).format(new Date(item.created_at))}
                </td>
                <td>{item.recipient_email}</td>
                <td>
                  <strong>{item.subject}</strong>
                  <small>{item.notification_type}</small>
                </td>
                <td>
                  <span className="status-pill">
                    {item.status === "simulated" && item.sent_at
                      ? "Đã gửi kiểm thử"
                      : item.status === "simulated"
                        ? "Kiểm thử – chưa gửi"
                        : (statusLabels[item.status] ?? item.status)}
                  </span>
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
