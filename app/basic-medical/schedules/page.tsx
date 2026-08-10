import { Dashboard } from "@/components/dashboard";
import { redirect } from "next/navigation";
import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { ScheduleEvent } from "@/lib/demo-data";
import { businessToday, businessTodayString } from "@/lib/business-time";
import { BASIC_MEDICAL_ROOM_TYPE_ID } from "@/lib/room-types";
import { getViewer } from "@/lib/viewer";
import {
  canManageBasicMedicalWorkspace,
  canViewBasicMedicalSchedules,
} from "@/lib/workspace-access";

type ViewMode = "month" | "week" | "list";

export default async function BasicMedicalSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; week?: string }>;
}) {
  const {
    supabase,
    userId,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canViewBasicMedicalSchedules(roles, roomTypeCodes)) {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const requestedDate = query.date ?? query.week;
  const parsedDate = requestedDate ? parseISO(requestedDate) : businessToday();
  const baseDate = isValid(parsedDate) ? parsedDate : businessToday();
  const viewMode: ViewMode = ["month", "week", "list"].includes(
    query.view ?? "",
  )
    ? (query.view as ViewMode)
    : "week";
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const monthStart = startOfMonth(baseDate);
  const periodStart =
    viewMode === "month"
      ? startOfWeek(monthStart, { weekStartsOn: 1 })
      : weekStart;
  const periodEnd =
    viewMode === "month" ? addDays(periodStart, 41) : addDays(weekStart, 6);

  const [
    { data: schedules },
    { data: people },
    { data: lecturers },
    { data: rooms },
  ] = await Promise.all([
    supabase
      .from("class_schedules")
      .select(
        `
        id, room_id, schedule_date, start_time, end_time, course_code_snapshot,
        course_name_snapshot, lecturer_id, lecturer_2_id, schedule_status,
        source, note, student_count, basic_medical_registration_id,
        rooms!inner (room_code, building_code, room_type_id)
      `,
      )
      .eq("rooms.room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
      .gte("schedule_date", format(periodStart, "yyyy-MM-dd"))
      .lte("schedule_date", format(periodEnd, "yyyy-MM-dd"))
      .neq("schedule_status", "cancelled")
      .order("schedule_date")
      .order("start_time"),
    supabase.rpc("list_active_people"),
    supabase.rpc("list_scoped_lecturers", {
      target_room_type_id: BASIC_MEDICAL_ROOM_TYPE_ID,
    }),
    supabase
      .from("rooms")
      .select("id, room_code, building_code, room_type_id")
      .eq("room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
      .eq("is_active", true)
      .order("room_code"),
  ]);

  const peopleById = new Map(
    ((people ?? []) as Array<{ id: string; full_name: string }>).map(
      (person) => [person.id, person.full_name],
    ),
  );
  const classEvents: ScheduleEvent[] = (schedules ?? []).map((schedule) => {
    const room = schedule.rooms as unknown as {
      room_code: string;
      building_code: string;
      room_type_id: string;
    } | null;
    const lecturerIds = [schedule.lecturer_id, schedule.lecturer_2_id].filter(
      Boolean,
    ) as string[];
    return {
      id: schedule.id,
      type: "class",
      date: schedule.schedule_date,
      start: schedule.start_time.slice(0, 5),
      end: schedule.end_time.slice(0, 5),
      title: schedule.course_code_snapshot,
      subtitle: schedule.course_name_snapshot,
      room: room ? `${room.room_code}. ${room.building_code}` : "Chưa xác định",
      roomId: schedule.room_id,
      person: lecturerIds.length
        ? lecturerIds.map((id) => peopleById.get(id) ?? "Giảng viên").join("\n")
        : undefined,
      personId: schedule.lecturer_id ?? undefined,
      personIds: lecturerIds,
      status: schedule.schedule_status,
      assigned: lecturerIds.length > 0,
      source: schedule.source === "import" ? "import" : "manual",
      note: schedule.note ?? undefined,
      owned: lecturerIds.includes(userId),
      studentCount: schedule.student_count,
      roomTypeId: room?.room_type_id,
      basicMedicalRegistrationId:
        schedule.basic_medical_registration_id ?? undefined,
    };
  });

  const weekdays = [
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
    "Chủ nhật",
  ];
  const today = businessTodayString();
  const calendarDays = Array.from(
    { length: viewMode === "month" ? 42 : 7 },
    (_, index) => {
      const date = addDays(periodStart, index);
      const dateText = format(date, "yyyy-MM-dd");
      const weekdayIndex = (date.getDay() + 6) % 7;
      return {
        date: dateText,
        weekday: weekdays[weekdayIndex],
        day: format(date, "dd"),
        today: dateText === today,
        sunday: weekdayIndex === 6,
        outsideMonth: viewMode === "month" && !isSameMonth(date, baseDate),
      };
    },
  );
  const periodLabel =
    viewMode === "month"
      ? new Intl.DateTimeFormat("vi-VN", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(baseDate)
      : `${format(weekStart, "dd/MM")} – ${format(addDays(weekStart, 6), "dd/MM/yyyy")}`;

  return (
    <Dashboard
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canEditBasicMedicalSchedules={canManageBasicMedicalWorkspace(
        roles,
        roomTypeCodes,
      )}
      events={classEvents}
      calendarDays={calendarDays}
      periodLabel={periodLabel}
      previousDate={format(
        viewMode === "month" ? addMonths(baseDate, -1) : addDays(baseDate, -7),
        "yyyy-MM-dd",
      )}
      nextDate={format(
        viewMode === "month" ? addMonths(baseDate, 1) : addDays(baseDate, 7),
        "yyyy-MM-dd",
      )}
      anchorDate={format(baseDate, "yyyy-MM-dd")}
      initialView={viewMode}
      todayDate={today}
      lecturers={(
        (lecturers ?? []) as Array<{ id: string; full_name: string }>
      ).map(({ id, full_name }) => ({ id, fullName: full_name }))}
      rooms={(rooms ?? []).map((room) => ({
        id: room.id,
        label: `${room.room_code} · ${room.building_code}`,
        roomTypeId: room.room_type_id,
      }))}
      shiftAssignees={[]}
      calendarKind="basic_medical"
    />
  );
}
