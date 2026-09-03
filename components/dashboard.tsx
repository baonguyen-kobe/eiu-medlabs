"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  PackageCheck,
  Search,
  ShieldCheck,
  X,
} from "@/components/icons";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  adminCancelClass,
  adminCancelBasicMedicalSession,
  adminInvalidateBasicMedicalSessionConfirmation,
  cancelStaffShiftAction,
  claimClass,
  withdrawClass,
  rescheduleClass,
  updateClassSchedule,
} from "@/app/dashboard/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TimePicker } from "@/components/time-picker";
import { WorkspaceShell } from "@/components/workspace-shell";
import { type ScheduleEvent } from "@/lib/demo-data";
import { equipmentRequestDeepLink } from "@/lib/equipment-calendar-request";
import { equipmentStatusMeta } from "@/lib/equipment-requests";
import { useScheduleRealtime } from "@/lib/use-schedule-realtime";

type Role = "admin" | "lecturer" | "staff" | "teaching_assistant" | "viewer";
type View = "Tuần" | "Tháng" | "Danh sách";
type ViewMode = "month" | "week" | "list";
type PersonOption = { id: string; fullName: string };
type RoomOption = { id: string; label: string; roomTypeId: string };
type CalendarDay = {
  date: string;
  weekday: string;
  day: string;
  today: boolean;
  sunday: boolean;
  outsideMonth: boolean;
};

const viewModes: Record<View, ViewMode> = {
  Tháng: "month",
  Tuần: "week",
  "Danh sách": "list",
};

const viewLabels: Record<ViewMode, View> = {
  month: "Tháng",
  week: "Tuần",
  list: "Danh sách",
};

const responsiveCalendarDefaultMedia = "(max-width: 920px)";
const inactiveCalendarEquipmentRequestStatuses = new Set<string>(["cancelled"]);

function subscribeToInitialCalendarViewport() {
  return () => {};
}

function getInitialCalendarViewportDefault() {
  return window.matchMedia(responsiveCalendarDefaultMedia).matches;
}

function getServerCalendarViewportDefault() {
  return false;
}

function formatDisplayDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

const roleLabels: Record<Role, string> = {
  admin: "Quản trị viên",
  lecturer: "Giảng viên",
  staff: "Chuyên viên",
  teaching_assistant: "Trợ giảng",
  viewer: "Người xem",
};

function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const calendarSlots = [
  { type: "class", period: "morning", group: "Lịch học", label: "Sáng" },
  { type: "class", period: "afternoon", group: "Lịch học", label: "Chiều" },
  { type: "shift", period: "morning", group: "Lịch trực", label: "Sáng" },
  { type: "shift", period: "afternoon", group: "Lịch trực", label: "Chiều" },
] as const;
type CalendarSlot = (typeof calendarSlots)[number];

function SlotEvents({
  events,
  slot,
  onOpen,
}: {
  events: ScheduleEvent[];
  slot: (typeof calendarSlots)[number];
  onOpen: (event: ScheduleEvent) => void;
}) {
  const slotEvents = events.filter(
    (event) =>
      event.type === slot.type &&
      (event.start < "12:00" ? "morning" : "afternoon") === slot.period,
  );

  return (
    <div className="slot-events">
      {slotEvents.map((event) => (
        <button
          className={`slot-event slot-event-${event.type}`}
          key={event.id}
          onClick={() => onOpen(event)}
          aria-label={`Xem ${event.title}, ${event.start} đến ${event.end}`}
        >
          <time>
            {event.start}–{event.end}
          </time>
          <strong>
            {event.type === "class" ? event.person || "\u00a0" : event.person}
          </strong>
          <small>
            {event.type === "class"
              ? `${event.title} - ${event.room}`
              : event.subtitle}
          </small>
        </button>
      ))}
    </div>
  );
}

function PeriodCalendar({
  days,
  eventsByDay,
  onOpen,
  variant,
  slots,
}: {
  days: CalendarDay[];
  eventsByDay: Map<string, ScheduleEvent[]>;
  onOpen: (event: ScheduleEvent) => void;
  variant: "month" | "week";
  slots: readonly CalendarSlot[];
}) {
  const dayGroups =
    variant === "month"
      ? Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
          days.slice(index * 7, index * 7 + 7),
        )
      : [days];

  return (
    <div
      aria-label={`Lịch ${variant === "month" ? "tháng" : "tuần"}; vuốt ngang để xem thêm ngày`}
      className={`period-calendar period-calendar-${variant}`}
      role="region"
      tabIndex={0}
    >
      {dayGroups.map((group, groupIndex) => (
        <section
          className="period-week"
          aria-label={
            variant === "month" ? `Tuần ${groupIndex + 1}` : "Các buổi trong kỳ"
          }
          key={group[0]?.date ?? groupIndex}
        >
          <div
            className="period-grid"
            style={
              { "--calendar-day-count": group.length } as React.CSSProperties
            }
          >
            <div className="period-corner">Buổi</div>
            {group.map((day) => (
              <header
                className={[
                  "period-day-heading",
                  day.today ? "is-today" : "",
                  day.sunday ? "is-sunday" : "",
                  day.outsideMonth ? "is-outside-month" : "",
                ].join(" ")}
                key={day.date}
              >
                <span>{day.weekday}</span>
                <strong>{day.day}</strong>
              </header>
            ))}
            {slots.map((slot) => (
              <Fragment key={`${slot.type}-${slot.period}`}>
                <div className={`period-label period-label-${slot.type}`}>
                  <span>{slot.group}</span>
                  <strong>{slot.label}</strong>
                </div>
                {group.map((day) => (
                  <div
                    className={[
                      "period-cell",
                      `period-cell-${slot.type}`,
                      day.today ? "is-today" : "",
                      day.sunday ? "is-sunday" : "",
                      day.outsideMonth ? "is-outside-month" : "",
                    ].join(" ")}
                    key={`${day.date}-${slot.type}-${slot.period}`}
                  >
                    <SlotEvents
                      events={eventsByDay.get(day.date) ?? []}
                      slot={slot}
                      onOpen={onOpen}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DayScheduleCell({
  day,
  events,
  onOpen,
  variant,
  slots,
}: {
  day: CalendarDay;
  events: ScheduleEvent[];
  onOpen: (event: ScheduleEvent) => void;
  variant: "month" | "week" | "list";
  slots: readonly CalendarSlot[];
}) {
  return (
    <article
      className={[
        "structured-day",
        `structured-day-${variant}`,
        day.today ? "is-today" : "",
        day.sunday ? "is-sunday" : "",
        day.outsideMonth ? "is-outside-month" : "",
      ].join(" ")}
    >
      <header className="structured-day-heading">
        <span>{day.weekday}</span>
        <strong>{day.day}</strong>
      </header>
      <div className="day-slots">
        {slots.map((slot) => (
          <div
            className={`schedule-slot slot-${slot.type}`}
            key={`${slot.type}-${slot.period}`}
          >
            <span className="slot-label">
              {slot.group} · {slot.label}
            </span>
            <SlotEvents events={events} slot={slot} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </article>
  );
}

export function Dashboard({
  fullName,
  roles,
  events,
  calendarDays,
  periodLabel,
  previousDate,
  nextDate,
  anchorDate,
  initialView,
  hasExplicitView = false,
  todayDate,
  lecturers,
  rooms = [],
  calendarKind = "combined",
  roomTypeCodes = [],
  allowBasicMedicalAccess = false,
  canEditBasicMedicalSchedules = false,
  canManageEmailNotifications = false,
  isRootAdministrator = false,
  skillsActions,
}: {
  fullName: string;
  roles: Role[];
  events: ScheduleEvent[];
  calendarDays: CalendarDay[];
  periodLabel: string;
  previousDate: string;
  nextDate: string;
  anchorDate: string;
  initialView: ViewMode;
  hasExplicitView?: boolean;
  todayDate: string;
  lecturers: PersonOption[];
  rooms?: RoomOption[];
  calendarKind?: "combined" | "basic_medical";
  roomTypeCodes?: string[];
  allowBasicMedicalAccess?: boolean;
  canEditBasicMedicalSchedules?: boolean;
  canManageEmailNotifications?: boolean;
  isRootAdministrator?: boolean;
  skillsActions?: ReactNode;
}) {
  const router = useRouter();
  useScheduleRealtime();
  const [pending, startTransition] = useTransition();
  const initialRole: Role = roles.includes("admin")
    ? "admin"
    : roles.includes("staff")
      ? "staff"
      : roles.includes("lecturer")
        ? "lecturer"
        : roles.includes("teaching_assistant")
          ? "teaching_assistant"
          : "viewer";
  const selectableRoles: Role[] = roles;
  const [role, setRole] = useState<Role>(initialRole);
  const [manualView, setManualView] = useState<View | null>(null);
  const useCompactCalendarDefault = useSyncExternalStore(
    subscribeToInitialCalendarViewport,
    getInitialCalendarViewportDefault,
    getServerCalendarViewportDefault,
  );
  const view = hasExplicitView
    ? viewLabels[initialView]
    : (manualView ?? (useCompactCalendarDefault ? "Danh sách" : "Tuần"));
  const [showClasses, setShowClasses] = useState(true);
  const [showShifts, setShowShifts] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(
    null,
  );
  const [selectedLecturerIds, setSelectedLecturerIds] = useState<string[]>([]);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState("");
  const [selectedStartTime, setSelectedStartTime] = useState("");
  const [selectedEndTime, setSelectedEndTime] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedStudentCount, setSelectedStudentCount] = useState(1);
  const detailDrawerRef = useRef<HTMLElement>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    action: () => Promise<{ ok: boolean; message: string }>;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [basicMedicalAction, setBasicMedicalAction] = useState<{
    kind: "cancel" | "invalidate";
    event: ScheduleEvent;
  } | null>(null);
  const [basicMedicalReason, setBasicMedicalReason] = useState("");

  useEffect(() => {
    if (!selectedEvent) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    detailDrawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedEvent(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEvent]);

  function handleClaim(scheduleId: string) {
    setActionMessage(null);
    startTransition(async () => {
      const result = await claimClass(scheduleId);
      setActionMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setSelectedEvent(null);
        router.refresh();
      }
    });
  }

  function openEvent(event: ScheduleEvent) {
    setSelectedEvent(event);
    setSelectedLecturerIds(
      event.type === "class"
        ? event.basicMedicalRegistrationId
          ? [event.personId].filter((id): id is string => Boolean(id))
          : (event.personIds ?? (event.personId ? [event.personId] : []))
        : [],
    );
    setSelectedScheduleDate(event.date);
    setSelectedStartTime(event.start);
    setSelectedEndTime(event.end);
    setSelectedRoomId(event.roomId ?? "");
    setSelectedStudentCount(event.studentCount ?? 1);
  }

  function runEventAction(
    action: () => Promise<{ ok: boolean; message: string }>,
    confirmationRequest?: {
      title: string;
      description: string;
      confirmLabel: string;
    },
  ) {
    if (confirmationRequest) {
      setConfirmation({ ...confirmationRequest, action });
      return;
    }
    setActionMessage(null);
    startTransition(async () => {
      const result = await action();
      setActionMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setSelectedEvent(null);
        router.refresh();
      }
    });
  }

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return events.filter((event) => {
      if (event.type === "class" && !showClasses) return false;
      if (event.type === "shift" && !showShifts) return false;
      if (!normalized) return true;
      return [event.title, event.subtitle, event.room, event.person].some(
        (value) => value?.toLocaleLowerCase("vi").includes(normalized),
      );
    });
  }, [events, query, showClasses, showShifts]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, ScheduleEvent[]>();
    for (const event of visibleEvents) {
      grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    }
    for (const dayEvents of grouped.values()) {
      dayEvents.sort((left, right) => left.start.localeCompare(right.start));
    }
    return grouped;
  }, [visibleEvents]);

  function navigateToView(nextView: View) {
    const mode = viewModes[nextView];
    setManualView(nextView);
    const basePath =
      calendarKind === "basic_medical"
        ? "/basic-medical/schedules"
        : "/class-schedules";
    router.push(`${basePath}?view=${mode}&date=${anchorDate}`, {
      scroll: false,
    });
  }

  function navigateToDate(date: string) {
    const basePath =
      calendarKind === "basic_medical"
        ? "/basic-medical/schedules"
        : "/class-schedules";
    router.push(`${basePath}?view=${viewModes[view]}&date=${date}`, {
      scroll: false,
    });
  }

  const loadedClassEvents = events.filter((event) => event.type === "class");
  const classEvents = visibleEvents.filter((event) => event.type === "class");
  const unassigned = classEvents.filter((event) => !event.assigned);
  const classesWithoutEffectiveEquipmentRequest = loadedClassEvents.filter(
    (event) =>
      !event.equipmentRequest ||
      inactiveCalendarEquipmentRequestStatuses.has(
        event.equipmentRequest.status,
      ),
  );
  const activeSlots = calendarSlots.filter((slot) =>
    calendarKind === "basic_medical"
      ? slot.type === "class"
      : slot.type === "class"
        ? showClasses
        : showShifts,
  );
  const lecturerView = role === "lecturer";
  const classManager = roles.some((item) =>
    ["admin", "staff", "teaching_assistant"].includes(item),
  );
  const canEditClassDetails =
    calendarKind === "basic_medical"
      ? canEditBasicMedicalSchedules
      : classManager;

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canManageEmailNotifications={canManageEmailNotifications}
      title={
        calendarKind === "basic_medical" ? "Lịch Y cơ sở" : "Lịch Skills lab"
      }
      description={`${calendarKind === "basic_medical" ? "Lịch sử dụng phòng Y cơ sở" : "Lịch học và lịch trực"} · ${periodLabel}`}
      actions={
        <>
          {calendarKind === "combined" ? (
            <div className="skills-calendar-header-actions">
              {skillsActions}
            </div>
          ) : null}
          {roles.includes("admin") ? (
            <label className="role-switcher">
              <ShieldCheck size={16} />
              <span className="sr-only">Xem theo vai trò</span>
              <select
                name="display_role"
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {selectableRoles.map((item) => (
                  <option value={item} key={item}>
                    {roleLabels[item]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      }
    >
      <div className="content">
        {calendarKind === "combined" && skillsActions ? (
          <div className="skills-calendar-mobile-actions">{skillsActions}</div>
        ) : null}
        <section
          className={`kpi-grid ${calendarKind === "basic_medical" ? "kpi-grid-three" : ""}`}
          aria-label="Tổng quan"
        >
          <article className="kpi-card kpi-teal">
            <div className="kpi-icon">
              <CalendarDays size={19} />
            </div>
            <span>
              {calendarKind === "basic_medical"
                ? "Tổng số lớp"
                : "Tổng lớp học"}
            </span>
            <strong>{classEvents.length}</strong>
          </article>
          {calendarKind === "basic_medical" ? (
            <>
              <article className="kpi-card kpi-indigo">
                <div className="kpi-icon">
                  <GraduationCap size={19} />
                </div>
                <span>Tổng số giảng viên</span>
                <strong>
                  {
                    new Set(
                      classEvents.flatMap((event) => event.personIds ?? []),
                    ).size
                  }
                </strong>
              </article>
              <article className="kpi-card kpi-amber">
                <div className="kpi-icon">
                  <CircleAlert size={19} />
                </div>
                <span>Tổng số sinh viên</span>
                <strong>
                  {classEvents.reduce(
                    (total, event) => total + (event.studentCount ?? 0),
                    0,
                  )}
                </strong>
              </article>
            </>
          ) : (
            <>
              <article className="kpi-card kpi-indigo">
                <div className="kpi-icon">
                  <GraduationCap size={19} />
                </div>
                <span>Đã có giảng viên</span>
                <strong>
                  {classEvents.filter((event) => event.assigned).length}
                </strong>
              </article>
              <article className="kpi-card kpi-amber">
                <div className="kpi-icon">
                  <CircleAlert size={19} />
                </div>
                <span>Chưa có giảng viên</span>
                <strong>{unassigned.length}</strong>
              </article>
              <article className="kpi-card kpi-violet">
                <div className="kpi-icon">
                  <PackageCheck size={19} />
                </div>
                <span>Số lớp chưa đăng ký thiết bị</span>
                <strong>
                  {classesWithoutEffectiveEquipmentRequest.length}
                </strong>
              </article>
            </>
          )}
        </section>

        <section className="filter-bar" aria-label="Bộ lọc lịch">
          <div className="search-field">
            <Search size={17} />
            <input
              name="schedule_search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm môn, phòng, giảng viên…"
              aria-label="Tìm kiếm lịch"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">
                <X size={15} />
              </button>
            ) : null}
          </div>
          <label className="filter-control date-filter-control">
            <input
              name="schedule_anchor_date"
              aria-label="Chọn ngày làm mốc"
              type="date"
              value={anchorDate}
              onChange={(event) => navigateToDate(event.target.value)}
            />
          </label>
          <button
            className="filter-reset"
            onClick={() => {
              setQuery("");
              setShowClasses(true);
              setShowShifts(true);
            }}
          >
            Xóa lọc
          </button>
        </section>

        <section className="calendar-card" id="calendar">
          <div className="calendar-toolbar">
            <div className="calendar-title">
              <div className="date-nav">
                <button
                  aria-label="Kỳ trước"
                  onClick={() => navigateToDate(previousDate)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="today-button"
                  onClick={() =>
                    router.push(
                      `${calendarKind === "basic_medical" ? "/basic-medical/schedules" : "/class-schedules"}?view=${viewModes[view]}&date=${todayDate}`,
                      { scroll: false },
                    )
                  }
                >
                  {view === "Tháng" ? "Tháng này" : "Tuần này"}
                </button>
                <button
                  aria-label="Kỳ sau"
                  onClick={() => navigateToDate(nextDate)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <div>
                <h3>{periodLabel}</h3>
              </div>
            </div>
            <div className="calendar-options">
              {calendarKind === "combined" ? (
                <>
                  <label className="layer-toggle">
                    <input
                      name="show_classes"
                      type="checkbox"
                      checked={showClasses}
                      onChange={(event) => {
                        if (event.target.checked || showShifts)
                          setShowClasses(event.target.checked);
                      }}
                    />
                    <span className="toggle-dot class-dot" /> Lịch học
                  </label>
                  <label className="layer-toggle">
                    <input
                      name="show_shifts"
                      type="checkbox"
                      checked={showShifts}
                      onChange={(event) => {
                        if (event.target.checked || showClasses)
                          setShowShifts(event.target.checked);
                      }}
                    />
                    <span className="toggle-dot shift-dot" /> Lịch trực
                  </label>
                </>
              ) : null}
              <div className="segmented-control">
                {(["Tháng", "Tuần", "Danh sách"] as View[]).map((item) => (
                  <button
                    key={item}
                    className={view === item ? "selected" : ""}
                    onClick={() => navigateToView(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view === "Tháng" ? (
            <PeriodCalendar
              days={calendarDays}
              eventsByDay={eventsByDay}
              onOpen={openEvent}
              variant="month"
              slots={activeSlots}
            />
          ) : view === "Danh sách" ? (
            <div className="structured-list">
              {calendarDays.map((day) => (
                <DayScheduleCell
                  day={day}
                  events={eventsByDay.get(day.date) ?? []}
                  onOpen={openEvent}
                  variant="list"
                  slots={activeSlots}
                  key={day.date}
                />
              ))}
            </div>
          ) : (
            <PeriodCalendar
              days={calendarDays}
              eventsByDay={eventsByDay}
              onOpen={openEvent}
              variant="week"
              slots={activeSlots}
            />
          )}
        </section>

        {lecturerView ? (
          <section className="lower-grid lecturer-only">
            <article className="open-classes" id="open-classes">
              <div className="section-heading">
                <div>
                  <Badge tone="amber">
                    <CircleAlert size={13} /> Cần giảng viên
                  </Badge>
                  <h3>Lớp đang mở</h3>
                  <p>Các lớp chưa có người nhận trong kỳ đang xem.</p>
                </div>
                <button className="text-button">
                  Xem tất cả <ChevronRight size={15} />
                </button>
              </div>
              <div className="open-list">
                {unassigned.map((event) => (
                  <div className="open-row" key={event.id}>
                    <div className="date-tile">
                      <strong>{event.date.slice(-2)}</strong>
                      <span>Thg {Number(event.date.slice(5, 7))}</span>
                    </div>
                    <div className="open-info">
                      <strong>
                        {event.title} <span>·</span> {event.subtitle}
                      </strong>
                      <span>
                        <Clock3 size={14} /> {event.start}–{event.end} <i />{" "}
                        <b>{event.room}</b>
                      </span>
                    </div>
                    {role === "lecturer" ? (
                      <button
                        className="button button-compact"
                        disabled={pending}
                        onClick={() => handleClaim(event.id)}
                      >
                        {pending ? "Đang xử lý…" : "Nhận lớp"}
                      </button>
                    ) : (
                      <Badge tone="slate">Chuyển sang vai trò Giảng viên</Badge>
                    )}
                  </div>
                ))}
                {unassigned.length === 0 ? (
                  <p className="empty-state">
                    Không có lớp nào đang chờ giảng viên trong kỳ này.
                  </p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}
      </div>

      {selectedEvent ? (
        <>
          <button
            className="drawer-scrim"
            onClick={() => setSelectedEvent(null)}
            aria-label="Đóng chi tiết"
          />
          <aside
            aria-label="Chi tiết lịch"
            aria-modal="true"
            className="detail-drawer"
            ref={detailDrawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="drawer-header">
              <div className={`drawer-icon drawer-${selectedEvent.type}`}>
                {selectedEvent.type === "class" ? (
                  <GraduationCap size={21} />
                ) : (
                  <PackageCheck size={21} />
                )}
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedEvent(null)}
                aria-label="Đóng"
              >
                <X size={19} />
              </button>
            </div>
            {selectedEvent.type === "shift" ? (
              <Badge tone="violet">Lịch trực kho</Badge>
            ) : null}
            <h2>{selectedEvent.title}</h2>
            <p className="drawer-subtitle">{selectedEvent.subtitle}</p>
            <dl className="detail-list">
              <div>
                <dt>Ngày</dt>
                <dd>
                  {selectedEvent.type === "class" &&
                  (canEditClassDetails ||
                    (calendarKind !== "basic_medical" &&
                      selectedEvent.owned)) ? (
                    <input
                      aria-label="Ngày học"
                      type="date"
                      value={selectedScheduleDate}
                      onChange={(event) =>
                        setSelectedScheduleDate(event.target.value)
                      }
                    />
                  ) : (
                    formatDisplayDate(selectedEvent.date)
                  )}
                </dd>
              </div>
              <div>
                <dt>Thời gian</dt>
                <dd>
                  {selectedEvent.type === "class" && canEditClassDetails ? (
                    <span className="drawer-time-editor">
                      <TimePicker
                        ariaLabel="Giờ bắt đầu"
                        value={selectedStartTime}
                        onChange={setSelectedStartTime}
                        required
                        baselineKey={selectedEvent.id}
                      />
                      <span>–</span>
                      <TimePicker
                        ariaLabel="Giờ kết thúc"
                        value={selectedEndTime}
                        onChange={setSelectedEndTime}
                        required
                        baselineKey={selectedEvent.id}
                      />
                    </span>
                  ) : (
                    `${selectedEvent.start}–${selectedEvent.end}`
                  )}
                </dd>
              </div>
              {selectedEvent.room ? (
                <div>
                  <dt>Phòng</dt>
                  <dd>
                    {selectedEvent.type === "class" &&
                    canEditClassDetails &&
                    calendarKind !== "basic_medical" ? (
                      <select
                        aria-label="Phòng học"
                        value={selectedRoomId}
                        onChange={(event) =>
                          setSelectedRoomId(event.target.value)
                        }
                      >
                        {rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      selectedEvent.room
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>
                  {selectedEvent.type === "class"
                    ? calendarKind === "basic_medical"
                      ? "Giảng viên giảng dạy/hướng dẫn"
                      : "Giảng viên"
                    : "Người trực"}
                </dt>
                <dd>
                  {canEditClassDetails && selectedEvent.type === "class" ? (
                    <span className="drawer-lecturer-selects">
                      <select
                        value={selectedLecturerIds[0] ?? ""}
                        onChange={(event) =>
                          setSelectedLecturerIds(
                            calendarKind === "basic_medical"
                              ? [event.target.value].filter(Boolean)
                              : [
                                  event.target.value,
                                  selectedLecturerIds[1] ?? "",
                                ].filter(Boolean),
                          )
                        }
                        aria-label={
                          calendarKind === "basic_medical"
                            ? "Chọn giảng viên giảng dạy/hướng dẫn"
                            : "Chọn giảng viên thứ nhất"
                        }
                      >
                        <option value="">Chưa có giảng viên</option>
                        {lecturers
                          .filter(
                            (person) => person.id !== selectedLecturerIds[1],
                          )
                          .map((person) => (
                            <option value={person.id} key={person.id}>
                              {person.fullName}
                            </option>
                          ))}
                      </select>
                      {calendarKind !== "basic_medical" ? (
                        <select
                          value={selectedLecturerIds[1] ?? ""}
                          onChange={(event) =>
                            setSelectedLecturerIds(
                              [
                                selectedLecturerIds[0] ?? "",
                                event.target.value,
                              ].filter(Boolean),
                            )
                          }
                          aria-label="Chọn giảng viên thứ hai"
                        >
                          <option value="">Không có giảng viên thứ hai</option>
                          {lecturers
                            .filter(
                              (person) => person.id !== selectedLecturerIds[0],
                            )
                            .map((person) => (
                              <option value={person.id} key={person.id}>
                                {person.fullName}
                              </option>
                            ))}
                        </select>
                      ) : null}
                    </span>
                  ) : (
                    <span className="lecturer-name-list">
                      {(selectedEvent.person ?? "Chưa có giảng viên")
                        .split("\n")
                        .map((name) => (
                          <strong key={name}>{name}</strong>
                        ))}
                    </span>
                  )}
                </dd>
              </div>
              {selectedEvent.note ? (
                <div>
                  <dt>Ghi chú</dt>
                  <dd>{selectedEvent.note}</dd>
                </div>
              ) : null}
              {selectedEvent.type === "class" ? (
                <div>
                  <dt>Số sinh viên</dt>
                  <dd>
                    {canEditClassDetails && calendarKind !== "basic_medical" ? (
                      <input
                        aria-label="Số sinh viên"
                        type="number"
                        min="1"
                        value={selectedStudentCount}
                        onChange={(event) =>
                          setSelectedStudentCount(Number(event.target.value))
                        }
                      />
                    ) : (
                      <strong>{selectedEvent.studentCount ?? 1}</strong>
                    )}
                  </dd>
                </div>
              ) : null}
              {selectedEvent.type === "class" &&
              selectedEvent.rootOperationalAssignment ? (
                <p className="action-feedback error">
                  Tài khoản Root Admin không thể được phân công vận hành. Vui
                  lòng chọn người thay thế.
                </p>
              ) : null}
              {selectedEvent.type === "class" && calendarKind === "combined" ? (
                <div>
                  <dt>Đăng ký TTB</dt>
                  <dd>
                    {selectedEvent.equipmentRequest ? (
                      <Link
                        href={equipmentRequestDeepLink(
                          roles,
                          selectedEvent.equipmentRequest.id,
                        )}
                      >
                        <strong>
                          {
                            equipmentStatusMeta(
                              selectedEvent.equipmentRequest.status,
                            ).label
                          }
                        </strong>
                      </Link>
                    ) : (
                      <Link
                        className="button button-secondary"
                        href={`/equipment/register?schedule=${selectedEvent.id}`}
                      >
                        Chưa đăng ký
                      </Link>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="drawer-actions">
              {selectedEvent.type === "class" &&
              (canEditClassDetails ||
                (calendarKind !== "basic_medical" && selectedEvent.owned)) ? (
                <button
                  className="button button-primary full-width"
                  disabled={
                    pending ||
                    Boolean(
                      selectedEvent.rootOperationalAssigneeIds?.some((id) =>
                        selectedLecturerIds.includes(id),
                      ),
                    )
                  }
                  onClick={() =>
                    runEventAction(() =>
                      canEditClassDetails
                        ? updateClassSchedule(selectedEvent.id, {
                            scheduleDate: selectedScheduleDate,
                            startTime: selectedStartTime,
                            endTime: selectedEndTime,
                            roomId: selectedRoomId,
                            studentCount: selectedStudentCount,
                            lecturerIds:
                              selectedEvent.basicMedicalRegistrationId
                                ? [selectedLecturerIds[0]].filter(
                                    (id): id is string => Boolean(id),
                                  )
                                : selectedLecturerIds,
                          })
                        : rescheduleClass(
                            selectedEvent.id,
                            selectedScheduleDate,
                          ),
                    )
                  }
                >
                  Lưu
                </button>
              ) : null}
              {selectedEvent.type === "class" &&
              calendarKind !== "basic_medical" &&
              (selectedEvent.personIds?.length ?? 0) < 2 &&
              !selectedEvent.owned &&
              !isRootAdministrator &&
              (role === "lecturer" || role === "admin") ? (
                <button
                  className="button button-primary full-width"
                  disabled={pending}
                  onClick={() => handleClaim(selectedEvent.id)}
                >
                  {pending ? "Đang xử lý…" : "Nhận lớp"}
                </button>
              ) : null}
              {selectedEvent.type === "class" &&
              calendarKind !== "basic_medical" &&
              selectedEvent.owned &&
              !isRootAdministrator &&
              (role === "lecturer" || role === "admin") ? (
                <button
                  className="button button-secondary full-width"
                  disabled={pending}
                  onClick={() =>
                    runEventAction(() => withdrawClass(selectedEvent.id), {
                      title: "Hủy nhận lớp?",
                      description:
                        "Lớp sẽ trở lại trạng thái chưa có giảng viên để người khác có thể nhận.",
                      confirmLabel: "Hủy nhận lớp",
                    })
                  }
                >
                  Hủy
                </button>
              ) : null}
              {role === "admin" && selectedEvent.type === "class" ? (
                calendarKind === "basic_medical" ? (
                  selectedEvent.activeConfirmation ? (
                    <button
                      className="button button-warning full-width"
                      disabled={pending}
                      onClick={() => {
                        setBasicMedicalReason("");
                        setBasicMedicalAction({
                          kind: "invalidate",
                          event: selectedEvent,
                        });
                      }}
                    >
                      Vô hiệu hóa xác nhận
                    </button>
                  ) : (
                    <button
                      className="button button-secondary full-width"
                      disabled={pending}
                      onClick={() => {
                        setBasicMedicalReason("");
                        setBasicMedicalAction({
                          kind: "cancel",
                          event: selectedEvent,
                        });
                      }}
                    >
                      Hủy lớp
                    </button>
                  )
                ) : (
                  <button
                    className="button button-secondary full-width"
                    disabled={pending}
                    onClick={() =>
                      runEventAction(() => adminCancelClass(selectedEvent.id), {
                        title: "Hủy lịch học?",
                        description:
                          "Lớp sẽ được ẩn khỏi lịch vận hành nhưng vẫn được lưu trong lịch sử thay đổi.",
                        confirmLabel: "Hủy lịch học",
                      })
                    }
                  >
                    Hủy lớp
                  </button>
                )
              ) : null}
              {(role === "admin" || selectedEvent.owned) &&
              selectedEvent.type === "shift" ? (
                <button
                  className="button button-secondary full-width"
                  disabled={pending}
                  onClick={() =>
                    runEventAction(
                      () => cancelStaffShiftAction(selectedEvent.id),
                      {
                        title: "Hủy ca trực?",
                        description:
                          "Ca trực sẽ được chuyển sang trạng thái đã hủy.",
                        confirmLabel: "Hủy ca trực",
                      },
                    )
                  }
                >
                  Hủy ca trực
                </button>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}

      {actionMessage ? (
        <div
          className={`action-toast ${actionMessage.ok ? "toast-success" : "toast-error"}`}
          role="status"
          aria-live="polite"
        >
          <span>
            {actionMessage.ok ? <Check size={17} /> : <CircleAlert size={17} />}
          </span>
          {actionMessage.text}
          <button
            onClick={() => setActionMessage(null)}
            aria-label="Đóng thông báo"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? "Xác nhận thao tác"}
        description={
          confirmation?.description ?? "Vui lòng xác nhận thao tác này."
        }
        confirmLabel={confirmation?.confirmLabel ?? "Xác nhận"}
        pending={pending}
        onConfirm={() => {
          const action = confirmation?.action;
          setConfirmation(null);
          if (action) runEventAction(action);
        }}
        onCancel={() => setConfirmation(null)}
      />
      <ConfirmDialog
        open={Boolean(basicMedicalAction)}
        title={
          basicMedicalAction?.kind === "invalidate"
            ? "Vô hiệu hóa xác nhận buổi học?"
            : "Hủy buổi học Y cơ sở?"
        }
        description={
          basicMedicalAction?.kind === "invalidate"
            ? `${basicMedicalAction.event.title} · ${formatDisplayDate(basicMedicalAction.event.date)} · ${basicMedicalAction.event.start}–${basicMedicalAction.event.end} · ${basicMedicalAction.event.room ?? "Chưa xác định phòng"} · Người ký: ${basicMedicalAction.event.activeConfirmation?.signerName ?? "Không xác định"} lúc ${basicMedicalAction.event.activeConfirmation ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(basicMedicalAction.event.activeConfirmation.signedAt)) : "không xác định"}. Chữ ký và bằng chứng gốc sẽ được giữ nguyên.`
            : "Chỉ hủy đúng buổi đã chọn; các buổi khác của Phiếu Y cơ sở không thay đổi."
        }
        confirmLabel={
          basicMedicalAction?.kind === "invalidate"
            ? "Vô hiệu hóa"
            : "Hủy buổi học"
        }
        pending={pending}
        onCancel={() => setBasicMedicalAction(null)}
        onConfirm={() => {
          const action = basicMedicalAction;
          const reason = basicMedicalReason.trim();
          if (!action || !reason) {
            setActionMessage({
              ok: false,
              text: "Vui lòng nhập lý do bắt buộc.",
            });
            return;
          }
          setBasicMedicalAction(null);
          runEventAction(() =>
            action.kind === "invalidate" && action.event.activeConfirmation
              ? adminInvalidateBasicMedicalSessionConfirmation(
                  action.event.activeConfirmation.id,
                  reason,
                )
              : adminCancelBasicMedicalSession(action.event.id, reason),
          );
        }}
      >
        <label className="form-field">
          <span>
            {basicMedicalAction?.kind === "invalidate"
              ? "Lý do vô hiệu hóa *"
              : "Lý do hủy buổi học *"}
          </span>
          <input
            value={basicMedicalReason}
            required
            onChange={(event) => setBasicMedicalReason(event.target.value)}
            placeholder="Nhập lý do bắt buộc"
          />
        </label>
      </ConfirmDialog>
    </WorkspaceShell>
  );
}
