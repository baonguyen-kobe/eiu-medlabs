"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

type LifecycleAuditEntry = {
  created_at: string;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  old_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown>;
};

const actionLabels: Record<string, string> = {
  "equipment_request.cancelled": "Phiếu đã được hủy",
  "equipment_request.hard_deleted": "Phiếu đã được xóa",
  "equipment_request.status_changed": "Điều chỉnh trạng thái phiếu",
  "equipment_request.handover_staff_confirmed": "Kho xác nhận giao",
  "equipment_request.handover_recipient_signed": "Người nhận ký xác nhận giao",
  "equipment_request.return_staff_confirmed": "Kho xác nhận trả",
  "equipment_request.return_recipient_signed": "Người nhận ký xác nhận trả",
};

const statusLabels: Record<string, string> = {
  new: "Mới",
  preparing: "Đã soạn",
  handed_over: "Đã giao",
  returned: "Đã trả",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function displayTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function EquipmentRequestLifecycleHistory({
  requestId,
}: {
  requestId: string;
}) {
  const [entries, setEntries] = useState<LifecycleAuditEntry[]>([]);
  const [state, setState] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadHistory() {
      setState("loading");
      const { data, error } = await supabase.rpc(
        "list_equipment_request_lifecycle_audit",
        {
          target_request_id: requestId,
        },
      );
      if (!active) return;
      if (error) {
        setEntries([]);
        setState("error");
        return;
      }
      setEntries((data ?? []) as LifecycleAuditEntry[]);
      setState("success");
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [requestId, retryKey]);

  return (
    <section className="equipment-lifecycle-history" aria-label="Lịch sử xử lý">
      <h3>Lịch sử xử lý</h3>
      {state === "loading" ? <p role="status">Đang tải lịch sử…</p> : null}
      {state === "error" ? (
        <div className="equipment-lifecycle-error" role="alert">
          <p>Không thể tải lịch sử xử lý. Vui lòng thử lại.</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {state === "success" && !entries.length ? (
        <p>Chưa có thao tác xử lý.</p>
      ) : null}
      {state === "success" && entries.length ? (
        <ol>
          {entries.map((entry, index) => {
            const transition =
              entry.old_status && entry.new_status
                ? `${statusLabels[entry.old_status] ?? entry.old_status} → ${statusLabels[entry.new_status] ?? entry.new_status}`
                : null;
            return (
              <li key={`${entry.created_at}-${entry.action}-${index}`}>
                <strong>{actionLabels[entry.action] ?? entry.action}</strong>
                {transition ? <span>{transition}</span> : null}
                <small>
                  {displayTime(entry.created_at)}
                  {entry.actor_name ? ` · ${entry.actor_name}` : ""}
                </small>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
