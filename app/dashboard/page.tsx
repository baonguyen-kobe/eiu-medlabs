import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import {
  CalendarDays,
  GraduationCap,
  PackageCheck,
  Plus,
} from "@/components/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  businessToday,
  businessTodayString,
  formatBusinessDate,
} from "@/lib/business-time";
import { getViewer } from "@/lib/viewer";
import { NURSING_SKILLS_ROOM_TYPE_ID } from "@/lib/room-types";
import {
  canUseSkillsWorkspace,
  canViewBasicMedicalSchedules,
} from "@/lib/workspace-access";

export default async function DashboardPage() {
  const {
    supabase,
    userId,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageEmailNotifications,
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (
    !canUseSkillsWorkspace(roles, roomTypeCodes) &&
    canViewBasicMedicalSchedules(roles, roomTypeCodes)
  ) {
    redirect("/basic-medical/schedules");
  }
  const today = businessToday();
  const todayText = businessTodayString();
  const monthStartText = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = endOfMonth(today);
  const upcomingEnd = addDays(today, 7);
  const monthEndText = format(monthEnd, "yyyy-MM-dd");
  const upcomingEndText = format(upcomingEnd, "yyyy-MM-dd");
  const queryEndText = format(
    monthEnd.getTime() > upcomingEnd.getTime() ? monthEnd : upcomingEnd,
    "yyyy-MM-dd",
  );

  const [{ data: schedules }, { data: shifts }, { data: people }] =
    await Promise.all([
      supabase
        .from("class_schedules")
        .select(
          `
        id, schedule_date, start_time, end_time, course_code_snapshot,
        course_name_snapshot, lecturer_id, lecturer_2_id, schedule_status,
        rooms!inner (room_code, building_code, room_type_id)
      `,
        )
        .eq("rooms.room_type_id", NURSING_SKILLS_ROOM_TYPE_ID)
        .gte("schedule_date", monthStartText)
        .lte("schedule_date", queryEndText)
        .neq("schedule_status", "cancelled")
        .order("schedule_date")
        .order("start_time"),
      supabase
        .from("staff_shifts")
        .select(
          "id, staff_id, shift_date, start_time, end_time, shift_type, status",
        )
        .gte("shift_date", monthStartText)
        .lte("shift_date", monthEndText)
        .neq("status", "cancelled")
        .order("shift_date")
        .order("start_time"),
      supabase.rpc("list_active_people"),
    ]);

  const classRows = schedules ?? [];
  const shiftRows = shifts ?? [];
  const peopleById = new Map(
    ((people ?? []) as Array<{ id: string; full_name: string }>).map(
      (person) => [person.id, person.full_name],
    ),
  );
  const activeClasses = classRows.filter(
    ({ schedule_status }) => schedule_status !== "cancelled",
  );
  const monthClasses = activeClasses.filter(
    ({ schedule_date }) =>
      schedule_date >= monthStartText && schedule_date <= monthEndText,
  );
  const upcomingClasses = activeClasses.filter(
    ({ schedule_date }) =>
      schedule_date >= todayText && schedule_date <= upcomingEndText,
  );
  const openClasses = monthClasses.filter(
    ({ lecturer_id, lecturer_2_id }) => !lecturer_id && !lecturer_2_id,
  );
  const myClasses = monthClasses.filter(
    ({ lecturer_id, lecturer_2_id }) =>
      lecturer_id === userId || lecturer_2_id === userId,
  );
  const canImport = roles.some((role) =>
    ["admin", "staff", "teaching_assistant"].includes(role),
  );
  const canCreate =
    canImport ||
    (roles.includes("lecturer") &&
      roomTypes.some(({ id }) => id === NURSING_SKILLS_ROOM_TYPE_ID));
  const displayRole = roles.includes("admin")
    ? "admin"
    : roles.includes("staff")
      ? "staff"
      : roles.includes("lecturer")
        ? "lecturer"
        : roles.includes("teaching_assistant")
          ? "teaching_assistant"
          : "viewer";
  const lecturerView = displayRole === "lecturer";

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      canManageEmailNotifications={canManageEmailNotifications}
      title="Tổng quan"
      description={`Hôm nay ${formatBusinessDate(todayText)}`}
      actions={
        canCreate ? (
          <>
            {canImport ? (
              <Link
                className="button button-secondary"
                href="/schedule-entry/import"
              >
                Import lịch Skills lab
              </Link>
            ) : null}
            <Link className="button button-primary" href="/schedule-entry/new">
              <Plus size={17} /> Tạo lịch
            </Link>
          </>
        ) : undefined
      }
    >
      <section className="kpi-grid" aria-label="Chỉ số tổng quan">
        <article className="kpi-card kpi-teal">
          <div className="kpi-icon">
            <CalendarDays />
          </div>
          <span>Tổng lớp học trong tháng</span>
          <strong>{monthClasses.length}</strong>
        </article>
        <article className="kpi-card kpi-indigo">
          <div className="kpi-icon">
            <GraduationCap />
          </div>
          <span>Số lớp đã có Giảng viên</span>
          <strong>{monthClasses.length - openClasses.length}</strong>
        </article>
        <article className="kpi-card kpi-amber">
          <div className="kpi-icon">
            <GraduationCap />
          </div>
          <span>Số lớp chưa có Giảng viên</span>
          <strong>{openClasses.length}</strong>
        </article>
        {lecturerView ? (
          <article className="kpi-card kpi-violet">
            <div className="kpi-icon">
              <CalendarDays />
            </div>
            <span>Lớp của tôi trong tháng</span>
            <strong>{myClasses.length}</strong>
          </article>
        ) : null}
        {!lecturerView ? (
          <article className="kpi-card kpi-violet">
            <div className="kpi-icon">
              <PackageCheck />
            </div>
            <span>Ca trực Kho trong tháng</span>
            <strong>{shiftRows.length}</strong>
          </article>
        ) : null}
      </section>

      <section className="overview-grid">
        <article className="overview-panel overview-schedule-panel">
          <div className="overview-panel-heading">
            <h2>LỊCH HỌC 7 NGÀY TỚI</h2>
            <Link href="/class-schedules">Xem lịch Skills lab</Link>
          </div>
          <div
            className="responsive-table"
            role="region"
            aria-label="Lịch học 7 ngày tới; vuốt ngang để xem đầy đủ"
            tabIndex={0}
          >
            <table className="data-table overview-schedule-table">
              <thead>
                <tr>
                  <th>Ngày</th>
                  <th>Thời gian</th>
                  <th>Mã môn</th>
                  <th>Tên môn học</th>
                  <th>Phòng</th>
                  <th>Giảng viên</th>
                </tr>
              </thead>
              <tbody>
                {upcomingClasses.slice(0, 8).map((schedule) => {
                  const room = schedule.rooms as unknown as {
                    room_code: string;
                    building_code: string;
                  } | null;
                  return (
                    <tr key={schedule.id}>
                      <td>{formatBusinessDate(schedule.schedule_date)}</td>
                      <td className="mono">
                        {schedule.start_time.slice(0, 5)}–
                        {schedule.end_time.slice(0, 5)}
                      </td>
                      <td>
                        <strong>{schedule.course_code_snapshot}</strong>
                      </td>
                      <td>{schedule.course_name_snapshot}</td>
                      <td>
                        {room
                          ? `${room.room_code} · ${room.building_code}`
                          : "Chưa có phòng"}
                      </td>
                      <td className="lecturer-name">
                        {schedule.lecturer_id || schedule.lecturer_2_id ? (
                          <span className="lecturer-name-list">
                            {[schedule.lecturer_id, schedule.lecturer_2_id]
                              .filter(Boolean)
                              .map((id) => (
                                <strong key={id as string}>
                                  {peopleById.get(id as string) ?? "Giảng viên"}
                                </strong>
                              ))}
                          </span>
                        ) : (
                          <strong>Chưa có giảng viên</strong>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!upcomingClasses.length ? (
            <p className="panel-empty">Chưa có lịch học trong 7 ngày tới.</p>
          ) : null}
        </article>

        {lecturerView ? (
          <article className="overview-panel">
            <div className="overview-panel-heading">
              <div>
                <span>Giảng viên</span>
                <h2>Lớp đang mở gần nhất</h2>
              </div>
              <Link href="/classes/open">Xem tất cả</Link>
            </div>
            <div className="overview-list">
              {openClasses.slice(0, 6).map((schedule) => (
                <div key={schedule.id}>
                  <time>{formatBusinessDate(schedule.schedule_date)}</time>
                  <strong>{schedule.course_code_snapshot}</strong>
                  <span>
                    {schedule.start_time.slice(0, 5)}–
                    {schedule.end_time.slice(0, 5)}
                  </span>
                  <small>{schedule.course_name_snapshot}</small>
                </div>
              ))}
              {!openClasses.length ? (
                <p className="empty-state">Không có lớp đang chờ nhận.</p>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}
