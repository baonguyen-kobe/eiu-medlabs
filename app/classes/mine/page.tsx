import {
  ClassRegistrationList,
  type RegistrationClass,
} from "@/components/class-registration-list";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";
import { resolveClassDateRange } from "@/lib/class-date-range";
import { businessTodayString } from "@/lib/business-time";
import { redirect } from "next/navigation";
import {
  canUseSkillsWorkspace,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

export default async function MyClassesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    date?: string;
    from?: string;
    to?: string;
  }>;
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
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canUseSkillsWorkspace(roles, roomTypeCodes)) {
    redirect(defaultWorkspacePath(roles, roomTypeCodes));
  }
  if (!roles.includes("lecturer")) redirect("/dashboard");
  const range = resolveClassDateRange(await searchParams);

  const [{ data }, { data: people }] = await Promise.all([
    supabase
      .from("class_schedules")
      .select(
        `
      id, room_id, schedule_date, start_time, end_time, course_code_snapshot,
      course_name_snapshot, lecturer_id, lecturer_2_id, student_count,
      rooms (room_code, building_code, room_type_id, room_types (name))
    `,
      )
      .or(`lecturer_id.eq.${userId},lecturer_2_id.eq.${userId}`)
      .neq("schedule_status", "cancelled")
      .gte("schedule_date", range.from)
      .lte("schedule_date", range.to)
      .order("schedule_date")
      .order("start_time"),
    supabase.rpc("list_active_people"),
  ]);
  const peopleById = new Map(
    ((people ?? []) as Array<{ id: string; full_name: string }>).map(
      (person) => [person.id, person.full_name],
    ),
  );

  const classes: RegistrationClass[] = (data ?? []).map((item) => {
    const room = item.rooms as unknown as {
      room_code: string;
      building_code: string;
      room_type_id: string;
      room_types: { name: string } | null;
    } | null;
    return {
      ...item,
      lecturerNames: [item.lecturer_id, item.lecturer_2_id]
        .filter(Boolean)
        .map((id) => peopleById.get(id as string) ?? "Giảng viên"),
      claimable: item.schedule_date >= businessTodayString(),
      roomLabel: room
        ? `${room.room_code} · ${room.building_code}`
        : "Chưa xếp phòng",
      roomId: item.room_id,
      roomTypeId: room?.room_type_id ?? "",
      roomTypeName: room?.room_types?.name ?? "Chưa phân loại",
    };
  });

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      title="Lớp của tôi"
      description="Theo dõi lớp đã nhận và rút lớp chưa bắt đầu khi cần."
    >
      <ClassRegistrationList
        classes={classes}
        mode="mine"
        viewerId={userId}
        roles={roles}
        range={range}
      />
    </WorkspaceShell>
  );
}
