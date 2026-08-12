"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  confirmBasicMedicalSession,
  cancelBasicMedicalRegistration,
} from "@/app/basic-medical/registrations/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Trash2 } from "@/components/icons";
import { formatBasicMedicalRegistrationCode } from "@/lib/basic-medical-registration-code";
import {
  activeSessionConfirmation,
  type BasicMedicalRegistrationListItem,
  type BasicMedicalRegistrationSessionItem,
  type BasicMedicalRoomInventoryItem,
} from "@/lib/basic-medical-equipment";

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value?: string) {
  return value ? value.split("-").reverse().join("/") : "—";
}

function formatTime(value?: string) {
  return value?.slice(0, 5) ?? "—";
}

function earliestConfirmationDate(
  session: BasicMedicalRegistrationSessionItem,
) {
  const schedule = session.class_schedules;
  if (!schedule) return null;
  const end = new Date(
    `${schedule.schedule_date}T${schedule.end_time.slice(0, 8)}+07:00`,
  );
  return new Date(end.getTime() - 60 * 60 * 1000);
}

type DamageDraft = Record<string, number>;

function BasicMedicalConfirmationModal({
  registration,
  session,
  inventories,
  onClose,
  onConfirmed,
}: {
  registration: BasicMedicalRegistrationListItem;
  session: BasicMedicalRegistrationSessionItem;
  inventories: BasicMedicalRoomInventoryItem[];
  onClose: () => void;
  onConfirmed: (confirmation: { id: string; signed_at: string }) => void;
}) {
  const [stage, setStage] = useState<"condition" | "signature">("condition");
  const [damageByInventory, setDamageByInventory] = useState<DamageDraft>({});
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPending, onClose]);

  useEffect(() => {
    if (stage !== "signature") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.max(Math.round(rect.width * ratio), 1);
    canvas.height = Math.max(Math.round(rect.height * ratio), 1);
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.5;
      context.strokeStyle = "#173f6b";
    }
  }, [stage]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  function validateAndContinue() {
    const invalid = inventories.find((inventory) => {
      const damaged = damageByInventory[inventory.id] ?? 0;
      return (
        !Number.isInteger(damaged) ||
        damaged < 0 ||
        damaged > inventory.good_quantity
      );
    });
    if (invalid) {
      setNotice({
        ok: false,
        message: `Số lượng hư mới của ${invalid.catalog?.item_name ?? "thiết bị"} phải từ 0 đến ${invalid.good_quantity}.`,
      });
      return;
    }
    setNotice(null);
    setStage("signature");
  }

  function submitConfirmation(signatureData: string) {
    startTransition(async () => {
      const result = await confirmBasicMedicalSession({
        sessionId: session.id,
        signatureData,
        checks: inventories.map((inventory) => ({
          inventoryId: inventory.id,
          newlyDamagedQuantity: damageByInventory[inventory.id] ?? 0,
          expectedCatalogItemId: inventory.catalog_item_id,
          expectedTotalQuantity: inventory.total_quantity,
          expectedGoodQuantity: inventory.good_quantity,
          expectedDamagedQuantity: inventory.damaged_quantity,
          expectedItemName: inventory.catalog?.item_name ?? "",
          expectedCommercialName: inventory.catalog?.commercial_name ?? null,
          expectedUnit: inventory.catalog?.unit ?? "",
        })),
      });
      if (!result.ok || !result.confirmationId || !result.signedAt) {
        setNotice({ ok: false, message: result.message });
        return;
      }
      onConfirmed({ id: result.confirmationId, signed_at: result.signedAt });
      onClose();
    });
  }

  const room = registration.rooms;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="equipment-modal-layer signature-modal-layer"
      role="presentation"
    >
      <button
        type="button"
        className="equipment-modal-backdrop"
        aria-label="Đóng cửa sổ xác nhận"
        onClick={() => !isPending && onClose()}
      />
      <section
        className="equipment-modal basic-medical-confirmation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="basic-medical-confirmation-title"
      >
        <header className="equipment-modal-header">
          <div>
            <span>Xác nhận buổi học Y cơ sở</span>
            <h2 id="basic-medical-confirmation-title">
              {registration.courses?.course_code} · {session.lesson_title}
            </h2>
            <p>
              {formatDate(session.class_schedules?.schedule_date)} ·{" "}
              {formatTime(session.class_schedules?.start_time)}–
              {formatTime(session.class_schedules?.end_time)} ·{" "}
              {room?.room_code}.{room?.building_code}
            </p>
          </div>
          <button
            type="button"
            className="equipment-modal-close"
            disabled={isPending}
            aria-label="Đóng cửa sổ xác nhận"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="equipment-modal-body">
          {notice ? (
            <p
              className={notice.ok ? "form-success" : "form-error"}
              role="status"
            >
              {notice.message}
            </p>
          ) : null}
          {stage === "condition" ? (
            <>
              <div className="basic-medical-condition-heading">
                <div>
                  <strong>Thay đổi tình trạng thiết bị phòng</strong>
                  <p>Số lượng Hư là số hư mới phát hiện trong buổi học này.</p>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={validateAndContinue}
                >
                  Lưu tình trạng
                </button>
              </div>
              <div className="responsive-table">
                <table className="data-table basic-medical-condition-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Tên thiết bị và vật tư</th>
                      <th>Tên thương mại</th>
                      <th>ĐVT</th>
                      <th>Hiện có</th>
                      <th>Tình trạng</th>
                      <th>Số lượng hư mới</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventories.map((inventory, index) => {
                      const damaged = damageByInventory[inventory.id] ?? 0;
                      const isDamaged = damaged > 0;
                      return (
                        <tr key={inventory.id}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{inventory.catalog?.item_name}</strong>
                          </td>
                          <td>{inventory.catalog?.commercial_name || "—"}</td>
                          <td>{inventory.catalog?.unit || "—"}</td>
                          <td>
                            {inventory.good_quantity} Tốt ·{" "}
                            {inventory.damaged_quantity} Hư
                          </td>
                          <td>
                            <label className="inline-choice">
                              <input
                                type="radio"
                                name={`condition-${inventory.id}`}
                                checked={!isDamaged}
                                onChange={() =>
                                  setDamageByInventory((current) => ({
                                    ...current,
                                    [inventory.id]: 0,
                                  }))
                                }
                              />
                              Tốt
                            </label>
                            <label className="inline-choice">
                              <input
                                type="radio"
                                name={`condition-${inventory.id}`}
                                checked={isDamaged}
                                onChange={() =>
                                  setDamageByInventory((current) => ({
                                    ...current,
                                    [inventory.id]: 1,
                                  }))
                                }
                              />
                              Hư
                            </label>
                          </td>
                          <td>
                            {isDamaged ? (
                              <input
                                aria-label={`Số lượng hư mới của ${inventory.catalog?.item_name ?? "thiết bị"}`}
                                type="number"
                                min="1"
                                max={inventory.good_quantity}
                                value={damaged}
                                onChange={(event) =>
                                  setDamageByInventory((current) => ({
                                    ...current,
                                    [inventory.id]: Number(event.target.value),
                                  }))
                                }
                              />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!inventories.length ? (
                <p className="panel-empty">
                  Phòng chưa có thiết bị trong danh mục. Bạn vẫn có thể tiếp tục
                  ký xác nhận.
                </p>
              ) : null}
              <div className="signature-modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={onClose}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={validateAndContinue}
                >
                  Lưu tình trạng và tiếp tục ký
                </button>
              </div>
            </>
          ) : (
            <div className="signature-modal-body basic-medical-signature-step">
              <p>
                Ký trong khung để xác nhận buổi học và tình trạng thiết bị
                phòng.
              </p>
              <button
                type="button"
                className="button button-secondary basic-medical-condition-trigger"
                disabled={isPending}
                onClick={() => setStage("condition")}
              >
                Thay đổi tình trạng thiết bị phòng
              </button>
              <canvas
                ref={canvasRef}
                className="signature-canvas"
                aria-label="Khung vẽ chữ ký"
                onPointerDown={(event) => {
                  event.preventDefault();
                  drawingRef.current = true;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const point = pointFromEvent(event);
                  const context = event.currentTarget.getContext("2d");
                  context?.beginPath();
                  context?.moveTo(point.x, point.y);
                }}
                onPointerMove={(event) => {
                  if (!drawingRef.current) return;
                  event.preventDefault();
                  const point = pointFromEvent(event);
                  const context = event.currentTarget.getContext("2d");
                  context?.lineTo(point.x, point.y);
                  context?.stroke();
                  setHasInk(true);
                }}
                onPointerUp={(event) => {
                  drawingRef.current = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  drawingRef.current = false;
                }}
              />
              <div className="signature-modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={isPending}
                  onClick={onClose}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={isPending || !hasInk}
                  onClick={clearSignature}
                >
                  Ký lại
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={isPending || !hasInk}
                  onClick={() => {
                    const signature = canvasRef.current?.toDataURL("image/png");
                    if (signature) submitConfirmation(signature);
                  }}
                >
                  {isPending ? "Đang lưu…" : "Ký và xác nhận"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SessionStatus({
  session,
  confirmation,
  evidenceEnabled,
  viewerId,
  onOpen,
}: {
  session: BasicMedicalRegistrationSessionItem;
  confirmation?: { id: string; signed_at: string };
  evidenceEnabled: boolean;
  viewerId: string;
  onOpen: () => void;
}) {
  const [renderedAt] = useState(() => Date.now());
  if (confirmation) {
    return (
      <div className="basic-medical-session-status">
        <span className="request-status request-status-green">Xác nhận</span>
        <small>
          {dateTimeFormatter.format(new Date(confirmation.signed_at))}
        </small>
        {evidenceEnabled ? (
          <Link
            className="button button-secondary basic-medical-confirm-button"
            href={`/basic-medical/registrations/confirmations/${confirmation.id}`}
          >
            Xem bằng chứng
          </Link>
        ) : null}
      </div>
    );
  }
  const isTeachingLecturer = session.teaching_lecturer_id === viewerId;
  const earliest = earliestConfirmationDate(session);
  const tooEarly = earliest ? renderedAt < earliest.getTime() : true;
  if (!isTeachingLecturer) {
    return (
      <span className="request-status request-status-red">Chưa xác nhận</span>
    );
  }
  return (
    <div className="basic-medical-session-status">
      <button
        type="button"
        className="button button-secondary basic-medical-confirm-button"
        disabled={tooEarly}
        onClick={onOpen}
      >
        Xác nhận
      </button>
      {tooEarly && earliest ? (
        <small>Từ {dateTimeFormatter.format(earliest)}</small>
      ) : null}
    </div>
  );
}

export function BasicMedicalRegistrationList({
  registrations,
  inventories,
  viewerId,
  canDelete,
  evidenceEnabled,
}: {
  registrations: BasicMedicalRegistrationListItem[];
  inventories: BasicMedicalRoomInventoryItem[];
  viewerId: string;
  canDelete: boolean;
  evidenceEnabled: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [confirmationBySession, setConfirmationBySession] = useState(() => {
    const entries = registrations.flatMap((registration) =>
      registration.basic_medical_registration_sessions.flatMap((session) => {
        const confirmation = activeSessionConfirmation(session);
        return confirmation ? [[session.id, confirmation] as const] : [];
      }),
    );
    return new Map(entries);
  });
  const [active, setActive] = useState<{
    registration: BasicMedicalRegistrationListItem;
    session: BasicMedicalRegistrationSessionItem;
  } | null>(null);
  const inventoriesByRoom = useMemo(() => {
    const map = new Map<string, BasicMedicalRoomInventoryItem[]>();
    for (const inventory of inventories) {
      map.set(inventory.room_id, [
        ...(map.get(inventory.room_id) ?? []),
        inventory,
      ]);
    }
    return map;
  }, [inventories]);

  return (
    <>
      <div className="equipment-request-list-panel data-panel basic-medical-registration-panel">
        <div className="responsive-table">
          <table className="data-table equipment-request-table basic-medical-registration-table">
            <thead>
              <tr>
                <th>Môn học</th>
                <th>Thời gian đăng ký</th>
                <th>Phòng</th>
                <th>Số buổi</th>
                <th>Trạng thái</th>
                <th aria-label="Mở chi tiết" />
              </tr>
            </thead>
            {registrations.map((registration) => {
              const sessions = [
                ...registration.basic_medical_registration_sessions,
              ].sort((a, b) => a.session_number - b.session_number);
              const isCompleted =
                sessions.length > 0 &&
                sessions.every((session) =>
                  confirmationBySession.has(session.id),
                );
              const isCancelled = Boolean(registration.cancelled_at);
              const isOpen = expanded.has(registration.id);
              return (
                <tbody key={registration.id}>
                  <tr className="equipment-request-table-row">
                    <td>
                      <button
                        type="button"
                        className="equipment-request-course-button"
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(registration.id))
                              next.delete(registration.id);
                            else next.add(registration.id);
                            return next;
                          })
                        }
                      >
                        <strong>{registration.courses?.course_code}</strong>
                        <span>{registration.courses?.course_name}</span>
                      </button>
                    </td>
                    <td className="equipment-request-date-cell">
                      <strong>
                        {formatDate(registration.start_date)}–
                        {formatDate(registration.end_date)}
                      </strong>
                      <span>
                        {registration.semester} · {registration.academic_year}
                      </span>
                    </td>
                    <td className="equipment-request-room-cell">
                      <strong>
                        {registration.rooms?.room_code}.
                        {registration.rooms?.building_code}
                      </strong>
                      <span>{registration.rooms?.room_name || "—"}</span>
                    </td>
                    <td>{sessions.length}</td>
                    <td>
                      <span
                        className={`request-status request-status-${isCancelled ? "gray" : isCompleted ? "green" : "red"}`}
                      >
                        {isCancelled
                          ? "Đã hủy"
                          : isCompleted
                            ? "Hoàn thành"
                            : "Chưa hoàn thành"}
                      </span>
                    </td>
                    <td className="equipment-request-toggle-cell">
                      <button
                        type="button"
                        className={`equipment-request-chevron${isOpen ? " is-open" : ""}`}
                        aria-label={isOpen ? "Thu gọn phiếu" : "Mở phiếu"}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(registration.id))
                              next.delete(registration.id);
                            else next.add(registration.id);
                            return next;
                          })
                        }
                      >
                        ⌄
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="equipment-request-detail-row">
                      <td colSpan={6}>
                        <div className="equipment-request-details">
                          <div className="equipment-request-detail-grid">
                            <div>
                              <span>Mã phiếu</span>
                              <strong className="mono">
                                {formatBasicMedicalRegistrationCode(
                                  registration.registration_code,
                                )}
                              </strong>
                            </div>
                            <div>
                              <span>Người đăng ký</span>
                              <strong>
                                {registration.registrant?.full_name}
                              </strong>
                            </div>
                            <div>
                              <span>Giảng viên phụ trách</span>
                              <strong>
                                {registration.responsible?.full_name}
                              </strong>
                            </div>
                            <div>
                              <span>Số sinh viên</span>
                              <strong>{registration.student_count}</strong>
                            </div>
                            <div>
                              <span>Ghi chú</span>
                              <strong>
                                {registration.note || "Không có ghi chú"}
                              </strong>
                            </div>
                            {isCancelled ? (
                              <>
                                <div>
                                  <span>Thời điểm hủy</span>
                                  <strong>
                                    {dateTimeFormatter.format(
                                      new Date(registration.cancelled_at ?? ""),
                                    )}
                                  </strong>
                                </div>
                                <div>
                                  <span>Lý do hủy</span>
                                  <strong>
                                    {registration.cancel_reason ||
                                      "Không có lý do"}
                                  </strong>
                                </div>
                              </>
                            ) : null}
                            {canDelete && !isCancelled ? (
                              <form action={cancelBasicMedicalRegistration}>
                                <input
                                  type="hidden"
                                  name="id"
                                  value={registration.id}
                                />
                                <ConfirmSubmitButton
                                  className="button button-danger"
                                  message={`Hủy phiếu ${registration.courses?.course_code ?? "Y cơ sở"}? Các lịch tương lai sẽ chuyển sang Đã hủy. Dữ liệu và lịch sử đã có được giữ lại.`}
                                >
                                  <Trash2 size={17} aria-hidden="true" /> Hủy
                                  phiếu
                                </ConfirmSubmitButton>
                              </form>
                            ) : null}
                          </div>
                          <div className="responsive-table">
                            <table className="data-table basic-medical-session-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Ngày</th>
                                  <th>Thời gian</th>
                                  <th>Tên bài TN-TH</th>
                                  <th>Giảng viên giảng dạy/hướng dẫn</th>
                                  <th>Trạng thái</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sessions.map((session) => {
                                  const confirmation =
                                    confirmationBySession.get(session.id);
                                  return (
                                    <tr key={session.id}>
                                      <td>{session.session_number}</td>
                                      <td>
                                        {formatDate(
                                          session.class_schedules
                                            ?.schedule_date,
                                        )}
                                      </td>
                                      <td>
                                        {formatTime(
                                          session.class_schedules?.start_time,
                                        )}
                                        –
                                        {formatTime(
                                          session.class_schedules?.end_time,
                                        )}
                                      </td>
                                      <td>{session.lesson_title}</td>
                                      <td>{session.teaching?.full_name}</td>
                                      <td>
                                        <SessionStatus
                                          session={session}
                                          confirmation={confirmation}
                                          evidenceEnabled={evidenceEnabled}
                                          viewerId={viewerId}
                                          onOpen={() =>
                                            setActive({ registration, session })
                                          }
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
        {!registrations.length ? (
          <p className="panel-empty">
            Không có phiếu phù hợp với bộ lọc hiện tại.
          </p>
        ) : null}
      </div>
      {active ? (
        <BasicMedicalConfirmationModal
          registration={active.registration}
          session={active.session}
          inventories={
            inventoriesByRoom.get(active.registration.rooms?.id ?? "") ?? []
          }
          onClose={() => setActive(null)}
          onConfirmed={(confirmation) => {
            setConfirmationBySession((current) =>
              new Map(current).set(active.session.id, {
                ...confirmation,
                signer_id: viewerId,
                invalidated_at: null,
                signer: null,
              }),
            );
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
