import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { StaffShiftRoster } from "@/components/staff-shift-roster";
import { WorkspaceShell } from "@/components/workspace-shell";
import { businessToday } from "@/lib/business-time";
import { getViewer } from "@/lib/viewer";

type ShiftView = "week" | "month";
type ShiftTab = "patterns" | "manage";

export default async function StaffShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; tab?: string }>;
}) {
  const {
    supabase,
    userId,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
  } = await getViewer();
  const query = await searchParams;
  const parsedDate = query.date ? parseISO(query.date) : businessToday();
  const baseDate = isValid(parsedDate) ? parsedDate : businessToday();
  const view: ShiftView = query.view === "month" ? "month" : "week";
  const tab: ShiftTab = query.tab === "manage" ? "manage" : "patterns";
  const periodStart =
    view === "month"
      ? startOfWeek(startOfMonth(baseDate), { weekStartsOn: 1 })
      : startOfWeek(baseDate, { weekStartsOn: 1 });
  const periodEnd =
    view === "month"
      ? endOfWeek(endOfMonth(baseDate), { weekStartsOn: 1 })
      : addDays(periodStart, 6);
  const periodStartText = format(periodStart, "yyyy-MM-dd");
  const periodEndText = format(periodEnd, "yyyy-MM-dd");
  const days = Array.from(
    { length: differenceInCalendarDays(periodEnd, periodStart) + 1 },
    (_, index) => format(addDays(periodStart, index), "yyyy-MM-dd"),
  );
  const previousDate =
    view === "month" ? addMonths(baseDate, -1) : addWeeks(baseDate, -1);
  const nextDate =
    view === "month" ? addMonths(baseDate, 1) : addWeeks(baseDate, 1);
  const periodLabel =
    view === "month"
      ? `Tháng ${format(baseDate, "MM/yyyy")}`
      : `${format(periodStart, "dd/MM")} – ${format(periodEnd, "dd/MM/yyyy")}`;

  const [
    { data: shifts },
    { data: patterns },
    { data: people },
    { data: roleRows },
  ] = await Promise.all([
    supabase
      .from("staff_shifts")
      .select(
        "id, staff_id, shift_date, start_time, end_time, shift_type, status",
      )
      .gte("shift_date", periodStartText)
      .lte("shift_date", periodEndText)
      .order("shift_date")
      .order("start_time"),
    supabase
      .from("staff_shift_patterns")
      .select(
        "id, staff_id, weekday, start_time, end_time, shift_type, effective_from, effective_to",
      )
      .eq("is_active", true)
      .lte("effective_from", periodEndText)
      .or(`effective_to.is.null,effective_to.gte.${periodStartText}`)
      .order("weekday")
      .order("start_time"),
    supabase.rpc("list_active_people"),
    supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["staff", "admin"]),
  ]);

  const activePeople = (people ?? []) as Array<{
    id: string;
    full_name: string;
    title: string | null;
  }>;
  const peopleById = new Map(
    activePeople.map((person) => [person.id, person.full_name]),
  );
  const eligibleIds = new Set((roleRows ?? []).map(({ user_id }) => user_id));
  const assignees = activePeople
    .filter((person) => eligibleIds.has(person.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
    .map((person) => ({ id: person.id, fullName: person.full_name }));

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      title="Lịch trực"
      description="Đăng ký lịch cố định hoặc quản lý người trực theo tuần và tháng."
    >
      <StaffShiftRoster
        shifts={(shifts ?? []).map((shift) => ({
          ...shift,
          staffName: peopleById.get(shift.staff_id) ?? "Nhân sự",
        }))}
        patterns={(patterns ?? []).map((pattern) => ({
          ...pattern,
          staffName: peopleById.get(pattern.staff_id) ?? "Nhân sự",
        }))}
        assignees={assignees}
        userId={userId}
        days={days}
        anchorDate={format(baseDate, "yyyy-MM-dd")}
        previousDate={format(previousDate, "yyyy-MM-dd")}
        nextDate={format(nextDate, "yyyy-MM-dd")}
        periodLabel={periodLabel}
        view={view}
        tab={tab}
        canSelfRegister={roles.includes("staff") || roles.includes("admin")}
        canManage={roles.includes("admin")}
      />
    </WorkspaceShell>
  );
}
