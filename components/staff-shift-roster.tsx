"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  cancelStaffShiftAction,
  registerStaffShiftsAction,
  type ShiftRegistrationPayloadItem,
  updateStaffShiftTimeAction,
} from "@/app/dashboard/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  LockKeyhole,
  Plus,
  Trash2,
  X,
} from "@/components/icons";
import { TimePicker } from "@/components/time-picker";
import { businessTodayString, formatBusinessDate } from "@/lib/business-time";
import {
  AFTERNOON_SHIFT_ALLOWED_TIMES,
  MORNING_SHIFT_ALLOWED_TIMES,
} from "@/lib/time-picker-utils";
import { useScheduleRealtime } from "@/lib/use-schedule-realtime";

export type ShiftSlot = "MORNING" | "AFTERNOON";

export type Shift = {
  id: string;
  staff_id: string;
  shift_date: string;
  shift_slot: ShiftSlot;
  start_time: string;
  end_time: string;
  note: string | null;
  status: string;
  staffName: string;
  registration_source?: string;
  creation_group_id?: string | null;
};

export type Assignee = {
  id: string;
  fullName: string;
};

export type ShiftView = "week" | "month";
export type ShiftTab = "roster" | "register";

type SlotOption = "MORNING" | "AFTERNOON" | "ALL_DAY" | "CUSTOM";

type WeekDayRegistrationRow = {
  date: string;
  dayLabel: string;
  included: boolean;
  slotOption: SlotOption;
  customSlot: ShiftSlot;
  startTime: string;
  endTime: string;
  note: string;
};

type FreeformRegistrationRow = {
  id: string;
  date: string;
  slotOption: SlotOption;
  customSlot: ShiftSlot;
  startTime: string;
  endTime: string;
  note: string;
};

const weekdayFullNames = [
  "Chủ nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
];

function getDayOfWeekLabel(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return "";
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return weekdayFullNames[d.getDay()] ?? "";
}

function defaultStartFor(slot: ShiftSlot): string {
  return slot === "MORNING" ? "07:00" : "13:00";
}

function defaultEndFor(slot: ShiftSlot): string {
  return slot === "MORNING" ? "11:00" : "16:00";
}

function generateWeekRows(anchor: string): WeekDayRegistrationRow[] {
  const parts = anchor.split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = d.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);

  const generated: WeekDayRegistrationRow[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(mon);
    cur.setDate(mon.getDate() + i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const dt = String(cur.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${dt}`;
    generated.push({
      date: dateStr,
      dayLabel: `${weekdayFullNames[cur.getDay()]}, ${dt}/${m}/${y}`,
      included: false,
      slotOption: "MORNING",
      customSlot: "MORNING",
      startTime: "07:00",
      endTime: "11:00",
      note: "",
    });
  }
  return generated;
}

export function StaffShiftRoster({
  shifts,
  assignees,
  userId,
  userFullName,
  days,
  anchorDate,
  previousDate,
  nextDate,
  periodLabel,
  view,
  tab,
  isAdmin,
  canSelfRegister,
  canManageShiftHistory,
}: {
  shifts: Shift[];
  assignees: Assignee[];
  userId: string;
  userFullName: string;
  days: string[];
  anchorDate: string;
  previousDate: string;
  nextDate: string;
  periodLabel: string;
  view: ShiftView;
  tab: ShiftTab;
  isAdmin: boolean;
  canSelfRegister: boolean;
  canManageShiftHistory: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useScheduleRealtime();

  const todayStr = businessTodayString();

  // Toast / Action feedback state
  const [actionMessage, setActionMessage] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = setTimeout(() => setActionMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  // Tab 1: Modal dialogs
  // 1. Quick Register Modal
  const [quickRegisterModal, setQuickRegisterModal] = useState<{
    open: boolean;
    date: string;
    slot: ShiftSlot;
    selectedAssigneeIds: string[];
    startTime: string;
    endTime: string;
    note: string;
    historicalReason: string;
  } | null>(null);

  // 2. Edit Shift Time Modal (Admin)
  const [editShiftModal, setEditShiftModal] = useState<{
    open: boolean;
    shift: Shift;
    startTime: string;
    endTime: string;
    note: string;
    historicalReason: string;
  } | null>(null);

  // 3. Cancel Shift Confirm Dialog
  const [cancelShiftDialog, setCancelShiftDialog] = useState<{
    open: boolean;
    shift: Shift;
    historicalReason: string;
  } | null>(null);

  // Tab 2: Registration State
  const [regMode, setRegMode] = useState<"week" | "freeform">("week");
  const [regAssigneeIds, setRegAssigneeIds] = useState<string[]>(
    isAdmin ? [] : [userId],
  );
  const [regAssigneeSearch, setRegAssigneeSearch] = useState("");
  const [regHistoricalReason, setRegHistoricalReason] = useState("");

  // Tab 2: Week mode rows (7 days from anchorDate's week)
  const [weekAnchor, setWeekAnchor] = useState(anchorDate);
  const [weekRows, setWeekRows] = useState<WeekDayRegistrationRow[]>(() =>
    generateWeekRows(anchorDate),
  );

  const updateWeekAnchor = (newAnchor: string) => {
    setWeekAnchor(newAnchor);
    setWeekRows(generateWeekRows(newAnchor));
  };

  // Tab 2: Freeform mode rows
  const [freeformRows, setFreeformRows] = useState<FreeformRegistrationRow[]>([
    {
      id: "row-1",
      date: todayStr,
      slotOption: "MORNING",
      customSlot: "MORNING",
      startTime: "07:00",
      endTime: "11:00",
      note: "",
    },
  ]);

  // Handle Quick Register Form Submit
  const handleQuickRegisterSubmit = () => {
    if (!quickRegisterModal) return;
    const {
      date,
      slot,
      selectedAssigneeIds,
      startTime,
      endTime,
      note,
      historicalReason,
    } = quickRegisterModal;

    const assigneesToRegister = isAdmin ? selectedAssigneeIds : [userId];
    if (assigneesToRegister.length === 0) {
      setActionMessage({
        ok: false,
        message: "Vui lòng chọn ít nhất một người trực.",
      });
      return;
    }

    if (date < todayStr && !canManageShiftHistory) {
      setActionMessage({
        ok: false,
        message: "Không thể đăng ký ca trực trong quá khứ.",
      });
      return;
    }

    if (date < todayStr && !historicalReason.trim()) {
      setActionMessage({
        ok: false,
        message: "Vui lòng nhập lý do điều chỉnh lịch sử.",
      });
      return;
    }

    const payload: ShiftRegistrationPayloadItem[] = assigneesToRegister.map(
      (staffId) => ({
        staff_id: staffId,
        shift_date: date,
        shift_slot: slot,
        start_time: startTime,
        end_time: endTime,
        note: note.trim() || null,
      }),
    );

    startTransition(async () => {
      const res = await registerStaffShiftsAction(
        payload,
        date < todayStr ? historicalReason : undefined,
      );
      setActionMessage(res);
      if (res.ok) {
        setQuickRegisterModal(null);
      }
    });
  };

  // Handle Edit Shift Time Submit
  const handleEditShiftSubmit = () => {
    if (!editShiftModal) return;
    const { shift, startTime, endTime, note, historicalReason } =
      editShiftModal;

    if (shift.shift_date < todayStr && !canManageShiftHistory) {
      setActionMessage({
        ok: false,
        message: "Không thể chỉnh sửa ca trực trong quá khứ.",
      });
      return;
    }

    if (shift.shift_date < todayStr && !historicalReason.trim()) {
      setActionMessage({
        ok: false,
        message: "Vui lòng nhập lý do điều chỉnh lịch sử.",
      });
      return;
    }

    startTransition(async () => {
      const res = await updateStaffShiftTimeAction(
        shift.id,
        startTime,
        endTime,
        note,
        shift.shift_date < todayStr ? historicalReason : undefined,
      );
      setActionMessage(res);
      if (res.ok) {
        setEditShiftModal(null);
      }
    });
  };

  // Handle Cancel Shift Submit
  const handleCancelShiftSubmit = () => {
    if (!cancelShiftDialog) return;
    const { shift, historicalReason } = cancelShiftDialog;

    if (shift.shift_date < todayStr && !canManageShiftHistory) {
      setActionMessage({
        ok: false,
        message: "Không thể hủy ca trực trong quá khứ.",
      });
      return;
    }

    if (shift.shift_date < todayStr && !historicalReason.trim()) {
      setActionMessage({
        ok: false,
        message: "Vui lòng nhập lý do điều chỉnh lịch sử.",
      });
      return;
    }

    startTransition(async () => {
      const res = await cancelStaffShiftAction(
        shift.id,
        historicalReason.trim() || undefined,
      );
      setActionMessage(res);
      if (res.ok) {
        setCancelShiftDialog(null);
      }
    });
  };

  // Handle Tab 2 Batch Registration Submit
  const handleTab2RegisterSubmit = () => {
    const targetAssignees = isAdmin ? regAssigneeIds : [userId];
    if (targetAssignees.length === 0) {
      setActionMessage({
        ok: false,
        message: "Vui lòng chọn ít nhất một người trực.",
      });
      return;
    }

    const payload: ShiftRegistrationPayloadItem[] = [];
    let hasHistorical = false;

    if (regMode === "week") {
      const includedWeekRows = weekRows.filter((r) => r.included);
      if (includedWeekRows.length === 0) {
        setActionMessage({
          ok: false,
          message: "Vui lòng tích chọn ít nhất một ngày trong tuần để đăng ký.",
        });
        return;
      }

      for (const row of includedWeekRows) {
        if (row.date < todayStr) hasHistorical = true;

        for (const staffId of targetAssignees) {
          if (row.slotOption === "ALL_DAY") {
            const groupId = crypto.randomUUID();
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "MORNING",
              start_time: "07:00",
              end_time: "11:00",
              note: row.note.trim() || null,
              creation_group_id: groupId,
            });
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "AFTERNOON",
              start_time: "13:00",
              end_time: "16:00",
              note: row.note.trim() || null,
              creation_group_id: groupId,
            });
          } else if (row.slotOption === "MORNING") {
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "MORNING",
              start_time: "07:00",
              end_time: "11:00",
              note: row.note.trim() || null,
            });
          } else if (row.slotOption === "AFTERNOON") {
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "AFTERNOON",
              start_time: "13:00",
              end_time: "16:00",
              note: row.note.trim() || null,
            });
          } else {
            // CUSTOM
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: row.customSlot,
              start_time: row.startTime,
              end_time: row.endTime,
              note: row.note.trim() || null,
            });
          }
        }
      }
    } else {
      // Freeform mode
      for (const row of freeformRows) {
        if (!row.date) {
          setActionMessage({
            ok: false,
            message: "Vui lòng nhập ngày cho tất cả các dòng.",
          });
          return;
        }
        if (row.date < todayStr) hasHistorical = true;

        for (const staffId of targetAssignees) {
          if (row.slotOption === "ALL_DAY") {
            const groupId = crypto.randomUUID();
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "MORNING",
              start_time: "07:00",
              end_time: "11:00",
              note: row.note.trim() || null,
              creation_group_id: groupId,
            });
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "AFTERNOON",
              start_time: "13:00",
              end_time: "16:00",
              note: row.note.trim() || null,
              creation_group_id: groupId,
            });
          } else if (row.slotOption === "MORNING") {
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "MORNING",
              start_time: "07:00",
              end_time: "11:00",
              note: row.note.trim() || null,
            });
          } else if (row.slotOption === "AFTERNOON") {
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: "AFTERNOON",
              start_time: "13:00",
              end_time: "16:00",
              note: row.note.trim() || null,
            });
          } else {
            // CUSTOM
            payload.push({
              staff_id: staffId,
              shift_date: row.date,
              shift_slot: row.customSlot,
              start_time: row.startTime,
              end_time: row.endTime,
              note: row.note.trim() || null,
            });
          }
        }
      }
    }

    if (hasHistorical && !canManageShiftHistory) {
      setActionMessage({
        ok: false,
        message: "Có ngày trực trong quá khứ mà bạn chưa có quyền quản lý.",
      });
      return;
    }

    if (hasHistorical && !regHistoricalReason.trim()) {
      setActionMessage({
        ok: false,
        message: "Vui lòng nhập lý do điều chỉnh lịch sử.",
      });
      return;
    }

    startTransition(async () => {
      const res = await registerStaffShiftsAction(
        payload,
        hasHistorical ? regHistoricalReason : undefined,
      );
      setActionMessage(res);
      if (res.ok) {
        // Reset form or switch to roster tab
        setRegHistoricalReason("");
        if (regMode === "week") {
          setWeekRows((prev) =>
            prev.map((r) => ({ ...r, included: false, note: "" })),
          );
        } else {
          setFreeformRows([
            {
              id: `row-${Date.now()}`,
              date: todayStr,
              slotOption: "MORNING",
              customSlot: "MORNING",
              startTime: "07:00",
              endTime: "11:00",
              note: "",
            },
          ]);
        }
        router.push(`/staff-shifts?tab=roster&view=${view}&date=${anchorDate}`);
      }
    });
  };

  // Group shifts by date and slot
  const shiftsByDateSlot = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.shift_date}:${s.shift_slot}`;
      const existing = map.get(key) ?? [];
      existing.push(s);
      map.set(key, existing);
    }
    return map;
  }, [shifts]);

  const filteredAssignees = useMemo(() => {
    if (!regAssigneeSearch.trim()) return assignees;
    const q = regAssigneeSearch.toLowerCase();
    return assignees.filter((a) => a.fullName.toLowerCase().includes(q));
  }, [assignees, regAssigneeSearch]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-neutral-200">
        <Link
          href={`/staff-shifts?tab=roster&view=${view}&date=${anchorDate}`}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === "roster"
              ? "border-primary-600 text-primary-700 bg-primary-50/40"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          Lịch trực
        </Link>
        <Link
          href={`/staff-shifts?tab=register&view=${view}&date=${anchorDate}`}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === "register"
              ? "border-primary-600 text-primary-700 bg-primary-50/40"
              : "border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300"
          }`}
        >
          Đăng ký lịch trực
        </Link>
      </div>

      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between text-sm ${
            actionMessage.ok
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            {actionMessage.ok ? (
              <Check className="text-emerald-600 flex-shrink-0" size={18} />
            ) : (
              <CircleAlert className="text-rose-600 flex-shrink-0" size={18} />
            )}
            <span>{actionMessage.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-neutral-400 hover:text-neutral-700 p-1"
            aria-label="Đóng thông báo"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* TAB 1: LỊCH TRỰC */}
      {tab === "roster" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-neutral-200 shadow-xs">
            <div className="flex items-center gap-2">
              <Link
                href={`/staff-shifts?tab=roster&view=${view}&date=${previousDate}`}
                className="button button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                aria-label="Khoảng thời gian trước"
              >
                <ChevronLeft size={16} />
                Trước
              </Link>
              <Link
                href={`/staff-shifts?tab=roster&view=${view}&date=${todayStr}`}
                className="button button-secondary text-xs px-2.5 py-1.5"
              >
                Hôm nay
              </Link>
              <Link
                href={`/staff-shifts?tab=roster&view=${view}&date=${nextDate}`}
                className="button button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                aria-label="Khoảng thời gian tiếp"
              >
                Tiếp
                <ChevronRight size={16} />
              </Link>
              <span className="font-semibold text-neutral-800 ml-2">
                {periodLabel}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-lg">
              <Link
                href={`/staff-shifts?tab=roster&view=week&date=${anchorDate}`}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  view === "week"
                    ? "bg-white text-neutral-900 shadow-xs font-semibold"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                Tuần
              </Link>
              <Link
                href={`/staff-shifts?tab=roster&view=month&date=${anchorDate}`}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  view === "month"
                    ? "bg-white text-neutral-900 shadow-xs font-semibold"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                Tháng
              </Link>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto shadow-xs">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-neutral-50/80 border-b border-neutral-200">
                  <th className="p-3 w-28 text-xs font-semibold text-neutral-500 uppercase tracking-wider sticky left-0 bg-neutral-50/95 z-10">
                    Buổi trực
                  </th>
                  {days.map((dateStr) => {
                    const isToday = dateStr === todayStr;
                    const isPast = dateStr < todayStr;
                    const dayLabel = getDayOfWeekLabel(dateStr);
                    const formatted = formatBusinessDate(dateStr);

                    return (
                      <th
                        key={dateStr}
                        className={`p-3 text-center border-l border-neutral-200 min-w-[130px] ${
                          isToday ? "bg-primary-50/50" : ""
                        }`}
                      >
                        <div className="text-xs font-medium text-neutral-500">
                          {dayLabel}
                        </div>
                        <div
                          className={`text-sm font-bold mt-0.5 ${
                            isToday
                              ? "text-primary-700 font-extrabold"
                              : isPast
                                ? "text-neutral-400"
                                : "text-neutral-800"
                          }`}
                        >
                          {formatted}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {/* SÁNG (MORNING) ROW */}
                <tr className="hover:bg-neutral-50/30 transition-colors">
                  <td className="p-3 text-xs font-bold text-neutral-700 bg-neutral-50/90 align-top sticky left-0 z-10 border-r border-neutral-200">
                    <div className="text-amber-700 font-bold flex items-center gap-1">
                      <span>Sáng</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 font-normal mt-0.5">
                      07:00 – 11:00
                    </div>
                  </td>
                  {days.map((dateStr) => {
                    const activeShifts =
                      shiftsByDateSlot.get(`${dateStr}:MORNING`) ?? [];
                    const isPast = dateStr < todayStr;
                    const isUserInSlot = activeShifts.some(
                      (s) => s.staff_id === userId,
                    );
                    const canAdd =
                      (!isPast || canManageShiftHistory) &&
                      (isAdmin || (canSelfRegister && !isUserInSlot));

                    return (
                      <td
                        key={`MORNING-${dateStr}`}
                        className="p-2.5 align-top border-l border-neutral-200"
                      >
                        <div className="space-y-1.5 min-h-[68px]">
                          {/* Active Shifts */}
                          {activeShifts.map((shift) => {
                            const isMe = shift.staff_id === userId;
                            return (
                              <div
                                key={shift.id}
                                className={`p-2 rounded-lg border text-xs transition-shadow ${
                                  isMe
                                    ? "bg-primary-50/70 border-primary-200 text-primary-950 shadow-xs"
                                    : "bg-white border-neutral-200 text-neutral-800 shadow-2xs"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span
                                    className={`font-semibold ${
                                      isMe
                                        ? "text-primary-800"
                                        : "text-neutral-900"
                                    }`}
                                  >
                                    {shift.staffName}
                                    {isMe && (
                                      <span className="ml-1 text-[10px] bg-primary-100 text-primary-700 px-1 py-0.2 rounded font-normal">
                                        Bạn
                                      </span>
                                    )}
                                  </span>
                                  {/* Shift Card Actions */}
                                  <div className="flex items-center gap-0.5 opacity-90 hover:opacity-100">
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        title="Chỉnh sửa giờ trực"
                                        onClick={() =>
                                          setEditShiftModal({
                                            open: true,
                                            shift,
                                            startTime: shift.start_time.slice(
                                              0,
                                              5,
                                            ),
                                            endTime: shift.end_time.slice(0, 5),
                                            note: shift.note ?? "",
                                            historicalReason: "",
                                          })
                                        }
                                        className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded"
                                        aria-label={`Chỉnh sửa giờ trực của ${shift.staffName}`}
                                      >
                                        <Clock3 size={13} />
                                      </button>
                                    )}
                                    {(isAdmin || isMe) && (
                                      <button
                                        type="button"
                                        title="Hủy lịch trực"
                                        onClick={() =>
                                          setCancelShiftDialog({
                                            open: true,
                                            shift,
                                            historicalReason: "",
                                          })
                                        }
                                        className="p-0.5 text-neutral-400 hover:text-rose-600 rounded"
                                        aria-label={`Hủy lịch trực của ${shift.staffName}`}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[11px] text-neutral-500 mt-0.5">
                                  {shift.start_time.slice(0, 5)} –{" "}
                                  {shift.end_time.slice(0, 5)}
                                </div>
                                {shift.note && (
                                  <div className="text-[10px] text-neutral-600 italic mt-0.5 line-clamp-2">
                                    {shift.note}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Quick Add Button */}
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() =>
                                setQuickRegisterModal({
                                  open: true,
                                  date: dateStr,
                                  slot: "MORNING",
                                  selectedAssigneeIds: isAdmin ? [] : [userId],
                                  startTime: "07:00",
                                  endTime: "11:00",
                                  note: "",
                                  historicalReason: "",
                                })
                              }
                              className="w-full py-1 text-[11px] font-medium text-neutral-400 hover:text-primary-700 hover:bg-primary-50/50 rounded border border-dashed border-neutral-200 hover:border-primary-300 flex items-center justify-center gap-1 transition-colors"
                              aria-label={`Đăng ký trực sáng ngày ${dateStr}`}
                            >
                              <Plus size={12} />
                              {isAdmin ? "Thêm" : "Đăng ký"}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* CHIỀU (AFTERNOON) ROW */}
                <tr className="hover:bg-neutral-50/30 transition-colors">
                  <td className="p-3 text-xs font-bold text-neutral-700 bg-neutral-50/90 align-top sticky left-0 z-10 border-r border-neutral-200">
                    <div className="text-sky-700 font-bold flex items-center gap-1">
                      <span>Chiều</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 font-normal mt-0.5">
                      13:00 – 16:00
                    </div>
                  </td>
                  {days.map((dateStr) => {
                    const activeShifts =
                      shiftsByDateSlot.get(`${dateStr}:AFTERNOON`) ?? [];
                    const isPast = dateStr < todayStr;
                    const isUserInSlot = activeShifts.some(
                      (s) => s.staff_id === userId,
                    );
                    const canAdd =
                      (!isPast || canManageShiftHistory) &&
                      (isAdmin || (canSelfRegister && !isUserInSlot));

                    return (
                      <td
                        key={`AFTERNOON-${dateStr}`}
                        className="p-2.5 align-top border-l border-neutral-200"
                      >
                        <div className="space-y-1.5 min-h-[68px]">
                          {/* Active Shifts */}
                          {activeShifts.map((shift) => {
                            const isMe = shift.staff_id === userId;
                            return (
                              <div
                                key={shift.id}
                                className={`p-2 rounded-lg border text-xs transition-shadow ${
                                  isMe
                                    ? "bg-primary-50/70 border-primary-200 text-primary-950 shadow-xs"
                                    : "bg-white border-neutral-200 text-neutral-800 shadow-2xs"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span
                                    className={`font-semibold ${
                                      isMe
                                        ? "text-primary-800"
                                        : "text-neutral-900"
                                    }`}
                                  >
                                    {shift.staffName}
                                    {isMe && (
                                      <span className="ml-1 text-[10px] bg-primary-100 text-primary-700 px-1 py-0.2 rounded font-normal">
                                        Bạn
                                      </span>
                                    )}
                                  </span>
                                  {/* Shift Card Actions */}
                                  <div className="flex items-center gap-0.5 opacity-90 hover:opacity-100">
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        title="Chỉnh sửa giờ trực"
                                        onClick={() =>
                                          setEditShiftModal({
                                            open: true,
                                            shift,
                                            startTime: shift.start_time.slice(
                                              0,
                                              5,
                                            ),
                                            endTime: shift.end_time.slice(0, 5),
                                            note: shift.note ?? "",
                                            historicalReason: "",
                                          })
                                        }
                                        className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded"
                                        aria-label={`Chỉnh sửa giờ trực của ${shift.staffName}`}
                                      >
                                        <Clock3 size={13} />
                                      </button>
                                    )}
                                    {(isAdmin || isMe) && (
                                      <button
                                        type="button"
                                        title="Hủy lịch trực"
                                        onClick={() =>
                                          setCancelShiftDialog({
                                            open: true,
                                            shift,
                                            historicalReason: "",
                                          })
                                        }
                                        className="p-0.5 text-neutral-400 hover:text-rose-600 rounded"
                                        aria-label={`Hủy lịch trực của ${shift.staffName}`}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[11px] text-neutral-500 mt-0.5">
                                  {shift.start_time.slice(0, 5)} –{" "}
                                  {shift.end_time.slice(0, 5)}
                                </div>
                                {shift.note && (
                                  <div className="text-[10px] text-neutral-600 italic mt-0.5 line-clamp-2">
                                    {shift.note}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Quick Add Button */}
                          {canAdd && (
                            <button
                              type="button"
                              onClick={() =>
                                setQuickRegisterModal({
                                  open: true,
                                  date: dateStr,
                                  slot: "AFTERNOON",
                                  selectedAssigneeIds: isAdmin ? [] : [userId],
                                  startTime: "13:00",
                                  endTime: "16:00",
                                  note: "",
                                  historicalReason: "",
                                })
                              }
                              className="w-full py-1 text-[11px] font-medium text-neutral-400 hover:text-primary-700 hover:bg-primary-50/50 rounded border border-dashed border-neutral-200 hover:border-primary-300 flex items-center justify-center gap-1 transition-colors"
                              aria-label={`Đăng ký trực chiều ngày ${dateStr}`}
                            >
                              <Plus size={12} />
                              {isAdmin ? "Thêm" : "Đăng ký"}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ĐĂNG KÝ LỊCH TRỰC */}
      {tab === "register" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Đăng ký ca trực mới
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Chọn người trực và các ngày trực theo tuần hoặc tự chọn danh
                sách ngày.
              </p>
            </div>

            {/* Mode Segment Control */}
            <div className="flex items-center gap-2 bg-neutral-100 p-1 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setRegMode("week")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  regMode === "week"
                    ? "bg-white text-neutral-900 shadow-xs"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                Theo tuần (Thứ 2 – Chủ nhật)
              </button>
              <button
                type="button"
                onClick={() => setRegMode("freeform")}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  regMode === "freeform"
                    ? "bg-white text-neutral-900 shadow-xs"
                    : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                Tự chọn ngày trực
              </button>
            </div>

            {/* Assignee Selection Field */}
            <div className="border-t border-neutral-200 pt-4 space-y-3">
              <label className="block text-xs font-semibold text-neutral-700">
                Người trực
              </label>

              {!isAdmin ? (
                // Staff: Readonly self display
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{userFullName} (Tài khoản của bạn)</span>
                  </div>
                  <span className="text-[11px] text-neutral-400">
                    Chỉ đăng ký cho chính mình
                  </span>
                </div>
              ) : (
                // Admin: Multi-select personnel
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Tìm kiếm nhân sự..."
                      value={regAssigneeSearch}
                      onChange={(e) => setRegAssigneeSearch(e.target.value)}
                      className="input text-xs px-3 py-1.5 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRegAssigneeIds(assignees.map((a) => a.id))
                      }
                      className="button button-secondary text-xs px-2.5 py-1.5"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegAssigneeIds([])}
                      className="button button-secondary text-xs px-2.5 py-1.5"
                    >
                      Bỏ chọn
                    </button>
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-neutral-200 rounded-lg p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 bg-neutral-50/50">
                    {filteredAssignees.map((person) => {
                      const checked = regAssigneeIds.includes(person.id);
                      return (
                        <label
                          key={person.id}
                          className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer select-none transition-colors ${
                            checked
                              ? "bg-primary-50 border-primary-300 text-primary-950 font-medium"
                              : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setRegAssigneeIds((prev) => [
                                  ...prev,
                                  person.id,
                                ]);
                              } else {
                                setRegAssigneeIds((prev) =>
                                  prev.filter((id) => id !== person.id),
                                );
                              }
                            }}
                            className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="truncate">{person.fullName}</span>
                        </label>
                      );
                    })}
                  </div>
                  {regAssigneeIds.length > 0 && (
                    <div className="text-[11px] text-neutral-500">
                      Đã chọn <strong>{regAssigneeIds.length}</strong> nhân sự
                      (mỗi nhân sự sẽ được tạo một ca trực riêng).
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mode 1: Theo tuần */}
            {regMode === "week" && (
              <div className="border-t border-neutral-200 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700">
                    Chọn các ngày trong tuần:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const parts = weekAnchor.split("-").map(Number);
                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                        d.setDate(d.getDate() - 7);
                        updateWeekAnchor(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                        );
                      }}
                      className="button button-secondary text-xs px-2 py-1 flex items-center gap-1"
                    >
                      <ChevronLeft size={14} /> Tuần trước
                    </button>
                    <button
                      type="button"
                      onClick={() => updateWeekAnchor(todayStr)}
                      className="button button-secondary text-xs px-2 py-1"
                    >
                      Tuần này
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const parts = weekAnchor.split("-").map(Number);
                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                        d.setDate(d.getDate() + 7);
                        updateWeekAnchor(
                          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                        );
                      }}
                      className="button button-secondary text-xs px-2 py-1 flex items-center gap-1"
                    >
                      Tuần sau <ChevronRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {weekRows.map((row, idx) => {
                    const isPast = row.date < todayStr;
                    return (
                      <div
                        key={row.date}
                        className={`p-3 rounded-lg border transition-all ${
                          row.included
                            ? "bg-white border-primary-400 shadow-xs ring-1 ring-primary-400"
                            : "bg-neutral-50/60 border-neutral-200 opacity-75"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={(e) => {
                                const next = [...weekRows];
                                next[idx].included = e.target.checked;
                                setWeekRows(next);
                              }}
                              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span
                              className={`text-xs font-bold ${
                                row.included
                                  ? "text-neutral-900"
                                  : "text-neutral-600"
                              }`}
                            >
                              {row.dayLabel}
                            </span>
                            {isPast && (
                              <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                <LockKeyhole size={10} /> Quá khứ
                              </span>
                            )}
                          </label>

                          {row.included && (
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Slot selector */}
                              <select
                                value={row.slotOption}
                                onChange={(e) => {
                                  const next = [...weekRows];
                                  const val = e.target.value as SlotOption;
                                  next[idx].slotOption = val;
                                  if (val === "MORNING") {
                                    next[idx].customSlot = "MORNING";
                                    next[idx].startTime = "07:00";
                                    next[idx].endTime = "11:00";
                                  } else if (val === "AFTERNOON") {
                                    next[idx].customSlot = "AFTERNOON";
                                    next[idx].startTime = "13:00";
                                    next[idx].endTime = "16:00";
                                  }
                                  setWeekRows(next);
                                }}
                                className="input text-xs py-1 px-2.5 font-medium"
                              >
                                <option value="MORNING">
                                  Sáng (07:00 – 11:00)
                                </option>
                                <option value="AFTERNOON">
                                  Chiều (13:00 – 16:00)
                                </option>
                                <option value="ALL_DAY">
                                  Cả ngày (Sáng + Chiều)
                                </option>
                                <option value="CUSTOM">Tùy chỉnh giờ</option>
                              </select>

                              {/* Custom Time Pickers */}
                              {row.slotOption === "CUSTOM" && (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={row.customSlot}
                                    onChange={(e) => {
                                      const next = [...weekRows];
                                      const sl = e.target.value as ShiftSlot;
                                      next[idx].customSlot = sl;
                                      next[idx].startTime = defaultStartFor(sl);
                                      next[idx].endTime = defaultEndFor(sl);
                                      setWeekRows(next);
                                    }}
                                    className="input text-xs py-1 px-2"
                                  >
                                    <option value="MORNING">Buổi sáng</option>
                                    <option value="AFTERNOON">
                                      Buổi chiều
                                    </option>
                                  </select>
                                  <TimePicker
                                    value={row.startTime}
                                    onChange={(val) => {
                                      const next = [...weekRows];
                                      next[idx].startTime = val;
                                      setWeekRows(next);
                                    }}
                                    allowedValues={
                                      row.customSlot === "MORNING"
                                        ? MORNING_SHIFT_ALLOWED_TIMES
                                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                                    }
                                  />
                                  <span className="text-xs text-neutral-400">
                                    –
                                  </span>
                                  <TimePicker
                                    value={row.endTime}
                                    onChange={(val) => {
                                      const next = [...weekRows];
                                      next[idx].endTime = val;
                                      setWeekRows(next);
                                    }}
                                    allowedValues={
                                      row.customSlot === "MORNING"
                                        ? MORNING_SHIFT_ALLOWED_TIMES
                                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                                    }
                                  />
                                </div>
                              )}

                              {/* Note */}
                              <input
                                type="text"
                                placeholder="Ghi chú (tùy chọn)..."
                                value={row.note}
                                onChange={(e) => {
                                  const next = [...weekRows];
                                  next[idx].note = e.target.value;
                                  setWeekRows(next);
                                }}
                                className="input text-xs py-1 px-2.5 max-w-[200px]"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode 2: Tự chọn */}
            {regMode === "freeform" && (
              <div className="border-t border-neutral-200 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-700">
                    Danh sách ngày trực:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFreeformRows((prev) => [
                        ...prev,
                        {
                          id: `row-${Date.now()}`,
                          date: todayStr,
                          slotOption: "MORNING",
                          customSlot: "MORNING",
                          startTime: "07:00",
                          endTime: "11:00",
                          note: "",
                        },
                      ])
                    }
                    className="button button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                  >
                    <Plus size={14} /> Thêm ngày trực
                  </button>
                </div>

                <div className="space-y-3">
                  {freeformRows.map((row, idx) => {
                    const isPast = row.date < todayStr;
                    return (
                      <div
                        key={row.id}
                        className="p-3 bg-white rounded-lg border border-neutral-200 shadow-2xs space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) => {
                                const next = [...freeformRows];
                                next[idx].date = e.target.value;
                                setFreeformRows(next);
                              }}
                              className="input text-xs py-1 px-2.5"
                            />
                            {isPast && (
                              <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                <LockKeyhole size={10} /> Quá khứ
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Slot Selector */}
                            <select
                              value={row.slotOption}
                              onChange={(e) => {
                                const next = [...freeformRows];
                                const val = e.target.value as SlotOption;
                                next[idx].slotOption = val;
                                if (val === "MORNING") {
                                  next[idx].customSlot = "MORNING";
                                  next[idx].startTime = "07:00";
                                  next[idx].endTime = "11:00";
                                } else if (val === "AFTERNOON") {
                                  next[idx].customSlot = "AFTERNOON";
                                  next[idx].startTime = "13:00";
                                  next[idx].endTime = "16:00";
                                }
                                setFreeformRows(next);
                              }}
                              className="input text-xs py-1 px-2.5 font-medium"
                            >
                              <option value="MORNING">
                                Sáng (07:00 – 11:00)
                              </option>
                              <option value="AFTERNOON">
                                Chiều (13:00 – 16:00)
                              </option>
                              <option value="ALL_DAY">
                                Cả ngày (Sáng + Chiều)
                              </option>
                              <option value="CUSTOM">Tùy chỉnh giờ</option>
                            </select>

                            {/* Custom Time Pickers */}
                            {row.slotOption === "CUSTOM" && (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={row.customSlot}
                                  onChange={(e) => {
                                    const next = [...freeformRows];
                                    const sl = e.target.value as ShiftSlot;
                                    next[idx].customSlot = sl;
                                    next[idx].startTime = defaultStartFor(sl);
                                    next[idx].endTime = defaultEndFor(sl);
                                    setFreeformRows(next);
                                  }}
                                  className="input text-xs py-1 px-2"
                                >
                                  <option value="MORNING">Buổi sáng</option>
                                  <option value="AFTERNOON">Buổi chiều</option>
                                </select>
                                <TimePicker
                                  value={row.startTime}
                                  onChange={(val) => {
                                    const next = [...freeformRows];
                                    next[idx].startTime = val;
                                    setFreeformRows(next);
                                  }}
                                  allowedValues={
                                    row.customSlot === "MORNING"
                                      ? MORNING_SHIFT_ALLOWED_TIMES
                                      : AFTERNOON_SHIFT_ALLOWED_TIMES
                                  }
                                />
                                <span className="text-xs text-neutral-400">
                                  –
                                </span>
                                <TimePicker
                                  value={row.endTime}
                                  onChange={(val) => {
                                    const next = [...freeformRows];
                                    next[idx].endTime = val;
                                    setFreeformRows(next);
                                  }}
                                  allowedValues={
                                    row.customSlot === "MORNING"
                                      ? MORNING_SHIFT_ALLOWED_TIMES
                                      : AFTERNOON_SHIFT_ALLOWED_TIMES
                                  }
                                />
                              </div>
                            )}

                            {/* Note */}
                            <input
                              type="text"
                              placeholder="Ghi chú (tùy chọn)..."
                              value={row.note}
                              onChange={(e) => {
                                const next = [...freeformRows];
                                next[idx].note = e.target.value;
                                setFreeformRows(next);
                              }}
                              className="input text-xs py-1 px-2.5 max-w-[200px]"
                            />

                            {/* Remove Row Button */}
                            {freeformRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFreeformRows((prev) =>
                                    prev.filter((r) => r.id !== row.id),
                                  )
                                }
                                className="p-1.5 text-neutral-400 hover:text-rose-600 rounded transition-colors"
                                aria-label="Xóa dòng ngày trực này"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historical Reason Field (if any date is past) */}
            {((regMode === "week" &&
              weekRows.some((r) => r.included && r.date < todayStr)) ||
              (regMode === "freeform" &&
                freeformRows.some((r) => r.date < todayStr))) && (
              <div className="border-t border-amber-200 bg-amber-50/60 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
                  <LockKeyhole size={14} />
                  <span>
                    Yêu cầu lý do điều chỉnh lịch sử (vì có ngày trực trong quá
                    khứ)
                  </span>
                </div>
                {canManageShiftHistory ? (
                  <textarea
                    rows={2}
                    placeholder="Nhập lý do điều chỉnh lịch sử (bắt buộc)..."
                    value={regHistoricalReason}
                    onChange={(e) => setRegHistoricalReason(e.target.value)}
                    className="input text-xs w-full"
                    required
                  />
                ) : (
                  <p className="text-xs text-rose-700 font-medium">
                    Tài khoản của bạn chưa có quyền quản lý lịch sử ca trực. Vui
                    lòng bỏ chọn các ngày trong quá khứ hoặc liên hệ quản trị
                    viên.
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <div className="border-t border-neutral-200 pt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleTab2RegisterSubmit}
                disabled={pending}
                className="button button-primary text-xs px-6 py-2.5 font-semibold"
              >
                {pending ? "Đang xử lý..." : "Xác nhận đăng ký"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG 1: Quick Register Modal */}
      {quickRegisterModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl border border-neutral-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {isAdmin ? "Thêm người trực" : "Đăng ký ca trực"}
                </h3>
                <p className="text-xs text-neutral-500">
                  {getDayOfWeekLabel(quickRegisterModal.date)},{" "}
                  {formatBusinessDate(quickRegisterModal.date)} – Buổi{" "}
                  {quickRegisterModal.slot === "MORNING" ? "Sáng" : "Chiều"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickRegisterModal(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
                aria-label="Đóng cửa sổ"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Assignee selection for admin */}
              {isAdmin ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Người trực:
                  </label>
                  <div className="max-h-36 overflow-y-auto border border-neutral-200 rounded-lg p-2 space-y-1 bg-neutral-50/50">
                    {assignees.map((person) => {
                      const checked =
                        quickRegisterModal.selectedAssigneeIds.includes(
                          person.id,
                        );
                      return (
                        <label
                          key={person.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-neutral-100 cursor-pointer text-xs select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setQuickRegisterModal((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        selectedAssigneeIds: [
                                          ...prev.selectedAssigneeIds,
                                          person.id,
                                        ],
                                      }
                                    : null,
                                );
                              } else {
                                setQuickRegisterModal((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        selectedAssigneeIds:
                                          prev.selectedAssigneeIds.filter(
                                            (id) => id !== person.id,
                                          ),
                                      }
                                    : null,
                                );
                              }
                            }}
                            className="rounded border-neutral-300 text-primary-600"
                          />
                          <span>{person.fullName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
                  Người trực: <strong>{userFullName}</strong>
                </div>
              )}

              {/* Time Pickers */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-neutral-700">
                  Khung giờ trực:
                </label>
                <div className="flex items-center gap-2">
                  <TimePicker
                    value={quickRegisterModal.startTime}
                    onChange={(val) =>
                      setQuickRegisterModal((prev) =>
                        prev ? { ...prev, startTime: val } : null,
                      )
                    }
                    allowedValues={
                      quickRegisterModal.slot === "MORNING"
                        ? MORNING_SHIFT_ALLOWED_TIMES
                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                    }
                  />
                  <span className="text-xs text-neutral-400">–</span>
                  <TimePicker
                    value={quickRegisterModal.endTime}
                    onChange={(val) =>
                      setQuickRegisterModal((prev) =>
                        prev ? { ...prev, endTime: val } : null,
                      )
                    }
                    allowedValues={
                      quickRegisterModal.slot === "MORNING"
                        ? MORNING_SHIFT_ALLOWED_TIMES
                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                    }
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-neutral-700">
                  Ghi chú (tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="Nhập ghi chú..."
                  value={quickRegisterModal.note}
                  onChange={(e) =>
                    setQuickRegisterModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null,
                    )
                  }
                  className="input text-xs w-full"
                />
              </div>

              {/* Historical Reason */}
              {quickRegisterModal.date < todayStr && (
                <div className="space-y-1.5 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <label className="block text-xs font-bold text-amber-800">
                    Lý do điều chỉnh lịch sử (bắt buộc):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Nhập lý do..."
                    value={quickRegisterModal.historicalReason}
                    onChange={(e) =>
                      setQuickRegisterModal((prev) =>
                        prev
                          ? { ...prev, historicalReason: e.target.value }
                          : null,
                      )
                    }
                    className="input text-xs w-full"
                    required
                  />
                </div>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickRegisterModal(null)}
                className="button button-secondary text-xs px-3 py-1.5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleQuickRegisterSubmit}
                disabled={pending}
                className="button button-primary text-xs px-4 py-1.5"
              >
                {pending ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG 2: Edit Shift Time Modal (Admin only) */}
      {editShiftModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl border border-neutral-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Chỉnh sửa giờ ca trực
                </h3>
                <p className="text-xs text-neutral-500">
                  {editShiftModal.shift.staffName} –{" "}
                  {formatBusinessDate(editShiftModal.shift.shift_date)} (Buổi{" "}
                  {editShiftModal.shift.shift_slot === "MORNING"
                    ? "Sáng"
                    : "Chiều"}
                  )
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditShiftModal(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
                aria-label="Đóng cửa sổ"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Time Pickers */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-neutral-700">
                  Giờ trực (trong khung giờ buổi{" "}
                  {editShiftModal.shift.shift_slot === "MORNING"
                    ? "07:00–11:00"
                    : "13:00–16:00"}
                  ):
                </label>
                <div className="flex items-center gap-2">
                  <TimePicker
                    value={editShiftModal.startTime}
                    onChange={(val) =>
                      setEditShiftModal((prev) =>
                        prev ? { ...prev, startTime: val } : null,
                      )
                    }
                    allowedValues={
                      editShiftModal.shift.shift_slot === "MORNING"
                        ? MORNING_SHIFT_ALLOWED_TIMES
                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                    }
                  />
                  <span className="text-xs text-neutral-400">–</span>
                  <TimePicker
                    value={editShiftModal.endTime}
                    onChange={(val) =>
                      setEditShiftModal((prev) =>
                        prev ? { ...prev, endTime: val } : null,
                      )
                    }
                    allowedValues={
                      editShiftModal.shift.shift_slot === "MORNING"
                        ? MORNING_SHIFT_ALLOWED_TIMES
                        : AFTERNOON_SHIFT_ALLOWED_TIMES
                    }
                  />
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-neutral-700">
                  Ghi chú:
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú..."
                  value={editShiftModal.note}
                  onChange={(e) =>
                    setEditShiftModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null,
                    )
                  }
                  className="input text-xs w-full"
                />
              </div>

              {/* Historical Reason */}
              {editShiftModal.shift.shift_date < todayStr && (
                <div className="space-y-1.5 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <label className="block text-xs font-bold text-amber-800">
                    Lý do điều chỉnh lịch sử (bắt buộc):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Nhập lý do..."
                    value={editShiftModal.historicalReason}
                    onChange={(e) =>
                      setEditShiftModal((prev) =>
                        prev
                          ? { ...prev, historicalReason: e.target.value }
                          : null,
                      )
                    }
                    className="input text-xs w-full"
                    required
                  />
                </div>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditShiftModal(null)}
                className="button button-secondary text-xs px-3 py-1.5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleEditShiftSubmit}
                disabled={pending}
                className="button button-primary text-xs px-4 py-1.5"
              >
                {pending ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG 3: Cancel Shift Confirm Dialog */}
      {cancelShiftDialog?.open && (
        <ConfirmDialog
          open={cancelShiftDialog.open}
          title="Hủy lịch trực?"
          description={`Bạn có chắc chắn muốn hủy ca trực ngày ${formatBusinessDate(cancelShiftDialog.shift.shift_date)} (Buổi ${cancelShiftDialog.shift.shift_slot === "MORNING" ? "Sáng" : "Chiều"}) của ${cancelShiftDialog.shift.staffName}?`}
          confirmLabel="Hủy ca trực"
          cancelLabel="Quay lại"
          tone="danger"
          pending={pending}
          onConfirm={handleCancelShiftSubmit}
          onCancel={() => setCancelShiftDialog(null)}
        >
          {cancelShiftDialog.shift.shift_date < todayStr ? (
            <div className="mt-3 space-y-1.5 text-left">
              <label className="block text-xs font-bold text-neutral-800">
                Lý do hủy ca trực lịch sử (bắt buộc):
              </label>
              <textarea
                rows={2}
                placeholder="Nhập lý do..."
                value={cancelShiftDialog.historicalReason}
                onChange={(e) =>
                  setCancelShiftDialog((prev) =>
                    prev ? { ...prev, historicalReason: e.target.value } : null,
                  )
                }
                className="input text-xs w-full"
                required
              />
            </div>
          ) : (
            <div className="mt-3 space-y-1.5 text-left">
              <label className="block text-xs font-medium text-neutral-600">
                Lý do hủy (tùy chọn):
              </label>
              <input
                type="text"
                placeholder="Nhập lý do hủy..."
                value={cancelShiftDialog.historicalReason}
                onChange={(e) =>
                  setCancelShiftDialog((prev) =>
                    prev ? { ...prev, historicalReason: e.target.value } : null,
                  )
                }
                className="input text-xs w-full"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
