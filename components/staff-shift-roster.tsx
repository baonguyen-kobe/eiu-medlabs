"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  adminCreateShift,
  adminReassignShift,
  deleteShiftPattern,
  registerOwnShiftPattern,
} from "@/app/dashboard/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Trash2, X } from "@/components/icons";
import { PaginationControls } from "@/components/pagination-controls";
import { businessTodayString, formatBusinessDate } from "@/lib/business-time";
import { TABLE_PAGE_SIZE, totalPagesFor } from "@/lib/pagination";
import { useScheduleRealtime } from "@/lib/use-schedule-realtime";

type Shift = {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  status: string;
  staffName: string;
};

type Pattern = {
  id: string;
  staff_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  shift_type: string;
  effective_from: string;
  effective_to: string | null;
  staffName: string;
};

type Assignee = { id: string; fullName: string };
type ShiftView = "week" | "month";
type ShiftTab = "patterns" | "manage";
type ShiftSlot = "MORNING" | "AFTERNOON";
type Editor = {
  kind: "create" | "edit";
  date: string;
  slot: ShiftSlot;
  shift?: Shift;
};

const weekdayLabels = [
  "",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ nhật",
];
const shortWeekdayLabels = [
  "CN",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
];
const shiftLabels: Record<string, string> = {
  MORNING: "Sáng",
  AFTERNOON: "Chiều",
  ALL_DAY: "Cả ngày",
};

function slotOf(shift: Shift): ShiftSlot {
  return shift.start_time < "12:00" ? "MORNING" : "AFTERNOON";
}

export function StaffShiftRoster({
  shifts,
  patterns,
  assignees,
  userId,
  days,
  anchorDate,
  previousDate,
  nextDate,
  periodLabel,
  view,
  tab,
  canSelfRegister,
  canManage,
}: {
  shifts: Shift[];
  patterns: Pattern[];
  assignees: Assignee[];
  userId: string;
  days: string[];
  anchorDate: string;
  previousDate: string;
  nextDate: string;
  periodLabel: string;
  view: ShiftView;
  tab: ShiftTab;
  canSelfRegister: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  useScheduleRealtime();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [patternToDelete, setPatternToDelete] = useState<Pattern | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [patternPage, setPatternPage] = useState(1);
  const safePatternPage = Math.min(
    patternPage,
    totalPagesFor(patterns.length, TABLE_PAGE_SIZE),
  );
  const pagePatterns = patterns.slice(
    (safePatternPage - 1) * TABLE_PAGE_SIZE,
    safePatternPage * TABLE_PAGE_SIZE,
  );

  useEffect(() => {
    if (!editor) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEditor(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  const shiftsBySlot = useMemo(() => {
    const result = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (shift.status === "cancelled") continue;
      const key = `${shift.shift_date}:${slotOf(shift)}`;
      result.set(key, [...(result.get(key) ?? []), shift]);
    }
    return result;
  }, [shifts]);

  const weeks = useMemo(() => {
    const result: string[][] = [];
    for (let index = 0; index < days.length; index += 7)
      result.push(days.slice(index, index + 7));
    return result;
  }, [days]);

  function href(next: { date?: string; view?: ShiftView; tab?: ShiftTab }) {
    const params = new URLSearchParams({
      date: next.date ?? anchorDate,
      view: next.view ?? view,
      tab: next.tab ?? tab,
    });
    return `/staff-shifts?${params.toString()}`;
  }

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setEditor(null);
        router.refresh();
      }
    });
  }

  function openEditor(nextEditor: Editor) {
    if (!canManage) return;
    setEditor(nextEditor);
    setAssigneeId(nextEditor.shift?.staff_id ?? assignees[0]?.id ?? "");
  }

  return (
    <div className="shift-page">
      <div className="shift-nav">
        <nav aria-label="Nội dung lịch trực">
          <Link
            scroll={false}
            className={tab === "patterns" ? "active" : ""}
            href={href({ tab: "patterns" })}
          >
            Lịch cố định
          </Link>
          <Link
            scroll={false}
            className={tab === "manage" ? "active" : ""}
            href={href({ tab: "manage" })}
          >
            Đổi lịch trực
          </Link>
        </nav>
        <div className="shift-view-switcher" aria-label="Chế độ xem">
          <Link
            scroll={false}
            className={view === "week" ? "active" : ""}
            href={href({ view: "week" })}
          >
            Tuần
          </Link>
          <Link
            scroll={false}
            className={view === "month" ? "active" : ""}
            href={href({ view: "month" })}
          >
            Tháng
          </Link>
        </div>
        <div className="period-switcher">
          <Link
            scroll={false}
            aria-label="Kỳ trước"
            href={href({ date: previousDate })}
          >
            ←
          </Link>
          <Link
            scroll={false}
            className="current-period-button"
            href={href({ date: businessTodayString() })}
          >
            {view === "month" ? "Tháng này" : "Tuần này"}
          </Link>
          <strong>{periodLabel}</strong>
          <Link
            scroll={false}
            aria-label="Kỳ sau"
            href={href({ date: nextDate })}
          >
            →
          </Link>
        </div>
      </div>

      {message ? (
        <p
          className={`action-feedback ${message.ok ? "success" : "error"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {tab === "patterns" ? (
        <>
          <section className="data-panel">
            <div
              className="responsive-table"
              role="region"
              aria-label="Lịch trực cố định; vuốt ngang để xem đầy đủ"
              tabIndex={0}
            >
              <table className="data-table shift-pattern-table">
                <thead>
                  <tr>
                    <th>Người trực</th>
                    <th>Thứ</th>
                    <th>Loại ca</th>
                    <th>Thời gian</th>
                    <th>Hiệu lực</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagePatterns.map((pattern) => {
                    const canDelete = pattern.staff_id === userId || canManage;
                    return (
                      <tr key={pattern.id}>
                        <td>
                          <strong>{pattern.staffName}</strong>
                        </td>
                        <td>{weekdayLabels[pattern.weekday]}</td>
                        <td>
                          {shiftLabels[pattern.shift_type] ?? "Tùy chỉnh"}
                        </td>
                        <td className="mono">
                          {pattern.start_time.slice(0, 5)}–
                          {pattern.end_time.slice(0, 5)}
                        </td>
                        <td>
                          {formatBusinessDate(pattern.effective_from)}
                          {pattern.effective_to
                            ? ` – ${formatBusinessDate(pattern.effective_to)}`
                            : " trở đi"}
                        </td>
                        <td className="table-action-cell">
                          {canDelete ? (
                            <button
                              type="button"
                              className="table-action delete-action"
                              onClick={() => setPatternToDelete(pattern)}
                            >
                              <Trash2 size={16} /> Xóa
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!patterns.length ? (
              <p className="panel-empty">
                Chưa có lịch trực cố định trong kỳ này.
              </p>
            ) : null}
            <PaginationControls
              currentPage={safePatternPage}
              totalItems={patterns.length}
              onPageChange={setPatternPage}
            />
          </section>

          {canSelfRegister ? (
            <section className="shift-register-card">
              <div>
                <h2>Đăng ký ca</h2>
                <p>
                  Lịch cố định được đăng ký cho chính tài khoản đang đăng nhập.
                </p>
              </div>
              <form
                action={(formData) =>
                  run(() => registerOwnShiftPattern(formData))
                }
              >
                <label>
                  Thứ
                  <select name="weekday" required defaultValue="1">
                    {weekdayLabels.slice(1).map((label, index) => (
                      <option value={index + 1} key={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Loại ca
                  <select name="shift_type" required defaultValue="MORNING">
                    <option value="MORNING">Sáng</option>
                    <option value="AFTERNOON">Chiều</option>
                    <option value="ALL_DAY">Cả ngày</option>
                  </select>
                </label>
                <label>
                  Ngày hiệu lực bắt đầu
                  <input
                    name="effective_from"
                    type="date"
                    required
                    defaultValue={businessTodayString()}
                  />
                </label>
                <label>
                  Ngày kết thúc <small>Để trống: hiệu lực 3 tháng</small>
                  <input name="effective_to" type="date" />
                </label>
                <label className="shift-note">
                  Ghi chú
                  <input name="note" placeholder="Không bắt buộc" />
                </label>
                <button
                  className="button button-primary"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "Đang đăng ký…" : "Đăng ký ca"}
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "manage" ? (
        <section
          className="shift-calendar-stack"
          aria-label="Bảng đổi lịch trực"
        >
          {weeks.map((week) => (
            <div
              className="period-calendar"
              key={week[0]}
              role="region"
              aria-label="Lịch trực theo tuần; vuốt ngang để xem thêm ngày"
              tabIndex={0}
            >
              <div className="period-grid period-grid-shifts">
                <div className="period-corner">BUỔI</div>
                {week.map((date) => {
                  const isToday = date === businessTodayString();
                  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
                  return (
                    <div
                      className={`period-day-heading ${isToday ? "is-today" : ""}`}
                      key={date}
                    >
                      <span>{shortWeekdayLabels[weekday]}</span>
                      <strong>{date.slice(-2)}</strong>
                    </div>
                  );
                })}
                {(
                  [
                    ["MORNING", "Sáng"],
                    ["AFTERNOON", "Chiều"],
                  ] as const
                ).map(([slot, label]) => (
                  <div className="period-row-fragment" key={slot}>
                    <div className="period-label period-label-shift">
                      <span>Lịch trực</span>
                      <strong>{label}</strong>
                    </div>
                    {week.map((date) => {
                      const slotShifts =
                        shiftsBySlot.get(`${date}:${slot}`) ?? [];
                      const isToday = date === businessTodayString();
                      return (
                        <div
                          className={`period-cell period-cell-shift ${isToday ? "is-today" : ""}`}
                          key={date}
                        >
                          {slotShifts.map((shift) => (
                            <button
                              type="button"
                              className="calendar-event shift-event"
                              disabled={!canManage}
                              onClick={() =>
                                openEditor({ kind: "edit", date, slot, shift })
                              }
                              key={shift.id}
                            >
                              <small>
                                {shift.start_time.slice(0, 5)}–
                                {shift.end_time.slice(0, 5)}
                              </small>
                              <strong>{shift.staffName}</strong>
                              <span>Ca {label.toLocaleLowerCase("vi")}</span>
                            </button>
                          ))}
                          {!slotShifts.length && canManage ? (
                            <button
                              type="button"
                              className="empty-shift-action"
                              onClick={() =>
                                openEditor({ kind: "create", date, slot })
                              }
                            >
                              <Plus size={18} />
                              <span>Tạo lịch trực</span>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {editor ? (
        <div className="shift-editor-layer" role="presentation">
          <button
            className="shift-editor-backdrop"
            aria-label="Đóng"
            onClick={() => setEditor(null)}
          />
          <section
            className="shift-editor"
            role="dialog"
            aria-modal="true"
            aria-label={
              editor.kind === "create" ? "Tạo lịch trực" : "Đổi lịch trực"
            }
          >
            <button
              className="icon-button shift-editor-close"
              aria-label="Đóng"
              onClick={() => setEditor(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              {editor.kind === "create" ? "Tạo lịch trực" : "Đổi lịch trực"}
            </span>
            <h2>
              {formatBusinessDate(editor.date)} · {shiftLabels[editor.slot]}
            </h2>
            <label>
              Người trực
              <select
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                {assignees.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.fullName}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              disabled={pending || !assigneeId}
              onClick={() =>
                run(() =>
                  editor.kind === "create"
                    ? adminCreateShift(editor.date, editor.slot, assigneeId)
                    : adminReassignShift(editor.shift!.id, assigneeId),
                )
              }
            >
              {pending
                ? "Đang lưu…"
                : editor.kind === "create"
                  ? "Tạo lịch trực"
                  : "Lưu người trực"}
            </button>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(patternToDelete)}
        title="Xóa lịch cố định?"
        description={
          patternToDelete
            ? `${patternToDelete.staffName} sẽ không còn lịch ${weekdayLabels[patternToDelete.weekday]} này.`
            : ""
        }
        confirmLabel="Xóa lịch"
        pending={pending}
        onConfirm={() => {
          const pattern = patternToDelete;
          setPatternToDelete(null);
          if (pattern) run(() => deleteShiftPattern(pattern.id));
        }}
        onCancel={() => setPatternToDelete(null)}
      />
    </div>
  );
}
