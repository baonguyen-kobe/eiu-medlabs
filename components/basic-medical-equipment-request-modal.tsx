"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createBasicMedicalEquipmentRequest,
  type BasicMedicalEquipmentRequestActionState,
} from "@/app/basic-medical/registrations/actions";
import {
  equipmentHandoffTimes,
  equipmentLeadTime,
  equipmentReceiveAt,
  lateEquipmentWarning,
} from "@/lib/equipment-lead-time";
import { formatEquipmentRequestCode } from "@/lib/equipment-request-code";
import {
  equipmentLateApprovalStatuses,
  equipmentStatusMeta,
  type EquipmentRequestListItem,
} from "@/lib/equipment-requests";
import type {
  BasicMedicalEquipmentCatalogItem,
  BasicMedicalRegistrationListItem,
  BasicMedicalRegistrationSessionItem,
} from "@/lib/basic-medical-equipment";

type DraftItem = {
  key: number;
  catalogItemId: string;
  quantity: number;
  note: string;
};

const initialState: BasicMedicalEquipmentRequestActionState = {
  ok: false,
  message: "",
};

function formatDate(value?: string) {
  return value ? value.split("-").reverse().join("/") : "—";
}

function formatTime(value?: string) {
  return value?.slice(0, 5) ?? "—";
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function SourceDetails({
  registration,
  session,
}: {
  registration: BasicMedicalRegistrationListItem;
  session: BasicMedicalRegistrationSessionItem;
}) {
  const schedule = session.class_schedules;
  const room = registration.rooms;
  return (
    <dl className="basic-medical-equipment-source-grid">
      <div>
        <dt>Môn học</dt>
        <dd>
          {registration.courses?.course_code ?? "—"} ·{" "}
          {registration.courses?.course_name ?? "—"}
        </dd>
      </div>
      <div>
        <dt>Học kỳ</dt>
        <dd>{registration.semester}</dd>
      </div>
      <div>
        <dt>Buổi học</dt>
        <dd>Buổi {session.session_number}</dd>
      </div>
      <div>
        <dt>Tên bài TN-TH</dt>
        <dd>{session.lesson_title}</dd>
      </div>
      <div>
        <dt>Ngày / thời gian</dt>
        <dd>
          {formatDate(schedule?.schedule_date)} ·{" "}
          {formatTime(schedule?.start_time)}–{formatTime(schedule?.end_time)}
        </dd>
      </div>
      <div>
        <dt>Phòng</dt>
        <dd>
          {room?.room_code ?? "—"}.{room?.building_code ?? "—"}
          {room?.room_name ? ` · ${room.room_name}` : ""}
        </dd>
      </div>
      <div>
        <dt>Giảng viên giảng dạy/hướng dẫn</dt>
        <dd>{session.teaching?.full_name ?? "—"}</dd>
      </div>
      <div>
        <dt>Người đăng ký</dt>
        <dd>{registration.registrant?.full_name ?? "—"}</dd>
      </div>
      <div>
        <dt>Email</dt>
        <dd>{registration.registrant?.email ?? "—"}</dd>
      </div>
      <div>
        <dt>Số điện thoại</dt>
        <dd>{registration.registrant?.phone ?? "—"}</dd>
      </div>
    </dl>
  );
}

function RequestDetail({
  request,
  registration,
  session,
}: {
  request: EquipmentRequestListItem;
  registration: BasicMedicalRegistrationListItem;
  session: BasicMedicalRegistrationSessionItem;
}) {
  const status = equipmentStatusMeta(request.status);
  const lateApprovalLabel =
    equipmentLateApprovalStatuses.find(
      (item) => item.value === request.late_approval_status,
    )?.label ?? request.late_approval_status;
  return (
    <div className="basic-medical-equipment-detail">
      <div className="basic-medical-equipment-detail-summary">
        <div>
          <span>Mã phiếu</span>
          <strong>{formatEquipmentRequestCode(request.created_at)}</strong>
        </div>
        <div>
          <span>Trạng thái</span>
          <strong className={`request-status request-status-${status.color}`}>
            {status.label}
          </strong>
        </div>
        <div>
          <span>Người đăng ký</span>
          <strong>
            {request.profiles?.full_name ??
              registration.registrant?.full_name ??
              "—"}
          </strong>
        </div>
        <div>
          <span>Giảng viên phụ trách</span>
          <strong>
            {request.responsible?.full_name ??
              session.teaching?.full_name ??
              "—"}
          </strong>
        </div>
        <div>
          <span>Nhận thiết bị</span>
          <strong>{formatDateTime(request.receive_at)}</strong>
        </div>
        <div>
          <span>Trả thiết bị</span>
          <strong>{formatDateTime(request.return_at)}</strong>
        </div>
        <div>
          <span>Duyệt đăng ký trễ</span>
          <strong>{lateApprovalLabel}</strong>
        </div>
        <div>
          <span>Ghi chú</span>
          <strong>{request.note || "Không có ghi chú"}</strong>
        </div>
      </div>
      <section>
        <h3>Nguồn buổi học</h3>
        <SourceDetails registration={registration} session={session} />
      </section>
      <section>
        <h3>Thiết bị Y cơ sở</h3>
        <div className="responsive-table">
          <table className="data-table equipment-detail-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên thiết bị và vật tư</th>
                <th>Tên thương mại</th>
                <th>ĐVT</th>
                <th>Số lượng</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {request.equipment_request_items.map((item, index) => {
                const catalog = item.basic_medical_equipment_catalog;
                return (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>
                        {catalog?.item_name ||
                          "Danh mục thiết bị không còn khả dụng"}
                      </strong>
                    </td>
                    <td>{catalog?.commercial_name || "—"}</td>
                    <td>{catalog?.unit || "—"}</td>
                    <td>{item.quantity}</td>
                    <td>{item.note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function BasicMedicalEquipmentRequestModal({
  registration,
  session,
  catalog,
  today,
  request,
  onClose,
  onCreated,
}: {
  registration: BasicMedicalRegistrationListItem;
  session: BasicMedicalRegistrationSessionItem;
  catalog: BasicMedicalEquipmentCatalogItem[];
  today: string;
  request?: EquipmentRequestListItem;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    createBasicMedicalEquipmentRequest,
    initialState,
  );
  const nextKey = useRef(2);
  const [items, setItems] = useState<DraftItem[]>([
    { key: 1, catalogItemId: "", quantity: 1, note: "" },
  ]);
  const [receiveDate, setReceiveDate] = useState(today);
  const [receiveTime, setReceiveTime] =
    useState<(typeof equipmentHandoffTimes)[number]>("09:00");
  const [returnDate, setReturnDate] = useState(
    session.class_schedules?.schedule_date ?? today,
  );
  const [returnTime, setReturnTime] =
    useState<(typeof equipmentHandoffTimes)[number]>("16:00");
  const [clientError, setClientError] = useState("");
  const scheduleDate = session.class_schedules?.schedule_date ?? today;
  const receiveAt = useMemo(
    () => equipmentReceiveAt(receiveDate, receiveTime),
    [receiveDate, receiveTime],
  );
  const leadTime = receiveAt ? equipmentLeadTime(receiveAt) : null;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, pending]);

  useEffect(() => {
    if (state.ok) onCreated?.();
  }, [onCreated, state.ok]);

  function updateItem(key: number, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function submitCheck(event: React.FormEvent<HTMLFormElement>) {
    if (
      !items.length ||
      items.some((item) => !item.catalogItemId || item.quantity < 1) ||
      receiveDate < today ||
      receiveDate > scheduleDate ||
      returnDate < scheduleDate ||
      (returnDate === receiveDate && returnTime < receiveTime) ||
      leadTime?.isExpired
    ) {
      event.preventDefault();
      setClientError(
        "Vui lòng kiểm tra ngày giờ và ít nhất một thiết bị hợp lệ.",
      );
      return;
    }
    if (
      leadTime?.requiresLateApproval &&
      !String(
        new FormData(event.currentTarget).get("late_registration_reason") ?? "",
      ).trim()
    ) {
      event.preventDefault();
      setClientError("Vui lòng nhập Lý do đăng ký trễ.");
      return;
    }
    setClientError("");
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="equipment-modal-layer" role="presentation">
      <button
        type="button"
        className="equipment-modal-backdrop"
        aria-label="Đóng phiếu thiết bị Y cơ sở"
        disabled={pending}
        onClick={onClose}
      />
      <section
        className="equipment-modal basic-medical-equipment-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="basic-medical-equipment-request-title"
      >
        <header className="equipment-modal-header">
          <div>
            <span>
              {request ? "Phiếu thiết bị Y cơ sở" : "Đăng ký thiết bị Y cơ sở"}
            </span>
            <h2 id="basic-medical-equipment-request-title">
              {registration.courses?.course_code} · Buổi{" "}
              {session.session_number}
            </h2>
            <p>{session.lesson_title}</p>
          </div>
          <button
            type="button"
            className="equipment-modal-close"
            aria-label="Đóng phiếu thiết bị Y cơ sở"
            disabled={pending}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="equipment-modal-body">
          {request ? (
            <RequestDetail
              request={request}
              registration={registration}
              session={session}
            />
          ) : (
            <form
              className="basic-medical-equipment-request-form"
              action={formAction}
              onSubmit={submitCheck}
            >
              <input type="hidden" name="session_id" value={session.id} />
              <input
                type="hidden"
                name="items"
                value={JSON.stringify(
                  items.map(({ catalogItemId, quantity, note }) => ({
                    catalogItemId,
                    quantity,
                    note,
                  })),
                )}
              />
              <section>
                <h3>Nguồn buổi học (chỉ xem)</h3>
                <SourceDetails registration={registration} session={session} />
              </section>
              <section>
                <h3>Thời gian nhận / trả</h3>
                <div className="basic-medical-equipment-request-time-grid">
                  <label>
                    Ngày nhận
                    <input
                      name="receive_date"
                      type="date"
                      min={today}
                      max={scheduleDate}
                      value={receiveDate}
                      onChange={(event) => setReceiveDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Giờ nhận
                    <select
                      name="receive_time"
                      value={receiveTime}
                      onChange={(event) =>
                        setReceiveTime(event.target.value as typeof receiveTime)
                      }
                    >
                      {equipmentHandoffTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ngày trả
                    <input
                      name="return_date"
                      type="date"
                      min={scheduleDate}
                      value={returnDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Giờ trả
                    <select
                      name="return_time"
                      value={returnTime}
                      onChange={(event) =>
                        setReturnTime(event.target.value as typeof returnTime)
                      }
                    >
                      {equipmentHandoffTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {leadTime?.requiresLateApproval ? (
                  <label className="basic-medical-equipment-late-reason">
                    Lý do đăng ký trễ
                    <textarea name="late_registration_reason" required />
                  </label>
                ) : null}
                {leadTime?.requiresLateApproval ? (
                  <p className="request-late-approval request-late-approval-pending">
                    {lateEquipmentWarning(leadTime.remainingMs)}
                  </p>
                ) : null}
              </section>
              <section>
                <div className="basic-medical-equipment-request-section-heading">
                  <h3>Thiết bị Y cơ sở</h3>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={pending}
                    onClick={() =>
                      setItems((current) => [
                        ...current,
                        {
                          key: nextKey.current++,
                          catalogItemId: "",
                          quantity: 1,
                          note: "",
                        },
                      ])
                    }
                  >
                    + Thêm dòng
                  </button>
                </div>
                <div className="responsive-table">
                  <table className="data-table basic-medical-equipment-request-items">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Thiết bị từ Danh mục Y cơ sở</th>
                        <th>Số lượng</th>
                        <th>Ghi chú</th>
                        <th>
                          <span className="sr-only">Xóa</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={item.key}>
                          <td>{index + 1}</td>
                          <td>
                            <select
                              value={item.catalogItemId}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  catalogItemId: event.target.value,
                                })
                              }
                              required
                            >
                              <option value="">Chọn thiết bị…</option>
                              {catalog.map((catalogItem) => (
                                <option
                                  key={catalogItem.id}
                                  value={catalogItem.id}
                                >
                                  {catalogItem.item_name}
                                  {catalogItem.commercial_name
                                    ? ` — ${catalogItem.commercial_name}`
                                    : ""}{" "}
                                  · {catalogItem.unit}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label={`Số lượng thiết bị dòng ${index + 1}`}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  quantity: Number(event.target.value),
                                })
                              }
                              required
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Ghi chú thiết bị dòng ${index + 1}`}
                              value={item.note}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  note: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button button-danger"
                              disabled={pending || items.length === 1}
                              onClick={() =>
                                setItems((current) =>
                                  current.filter(
                                    (candidate) => candidate.key !== item.key,
                                  ),
                                )
                              }
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <label>
                Ghi chú phiếu
                <textarea name="note" />
              </label>
              {clientError ? (
                <p className="form-error" role="alert">
                  {clientError}
                </p>
              ) : null}
              {state.message ? (
                <p
                  className={state.ok ? "form-success" : "form-error"}
                  role="status"
                >
                  {state.message}
                </p>
              ) : null}
              <div className="equipment-modal-add-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={pending}
                  onClick={onClose}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={pending || !catalog.length}
                >
                  {pending ? "Đang tạo…" : "Tạo phiếu thiết bị"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
