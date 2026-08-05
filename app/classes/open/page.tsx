import { redirect } from "next/navigation";
import {
  ClassRegistrationList,
  type RegistrationClass,
} from "@/components/class-registration-list";
import { WorkspaceShell } from "@/components/workspace-shell";
import { resolveClassDateRange } from "@/lib/class-date-range";
import { businessTodayString } from "@/lib/business-time";
import { getViewer } from "@/lib/viewer";
import Link from "next/link";
import { Plus } from "@/components/icons";
import {
  canUseSkillsWorkspace,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

export default async function OpenClassesPage({
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
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canUseSkillsWorkspace(roles, roomTypeCodes)) {
    redirect(defaultWorkspacePath(roles, roomTypeCodes));
  }
  if (
    !roles.some((role) =>
      ["lecturer", "staff", "admin", "importer"].includes(role),
    )
  )
    redirect("/dashboard");
  const range = resolveClassDateRange(await searchParams);

  const [{ data }, { data: people }, { data: rooms }, scopedLecturerResults] =
    await Promise.all([
      supabase
        .from("class_schedules")
        .select(
          `
      id, room_id, schedule_date, start_time, end_time, course_code_snapshot,
      course_name_snapshot, lecturer_id, lecturer_2_id, student_count,
      rooms (room_code, building_code, room_type_id, room_types (name))
    `,
        )
        .neq("schedule_status", "cancelled")
        .gte("schedule_date", range.from)
        .lte("schedule_date", range.to)
        .order("schedule_date")
        .order("start_time"),
      supabase.rpc("list_active_people"),
      supabase
        .from("rooms")
        .select("id, room_code, building_code, room_type_id")
        .eq("is_active", true)
        .order("room_code"),
      Promise.all(
        roomTypes.map(async (roomType) => ({
          roomTypeId: roomType.id,
          result: await supabase.rpc("list_scoped_lecturers", {
            target_room_type_id: roomType.id,
          }),
        })),
      ),
    ]);
  const activePeople = (people ?? []) as Array<{
    id: string;
    full_name: string;
    title: string | null;
  }>;
  const peopleById = new Map(
    activePeople.map((person) => [person.id, person.full_name]),
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
  const lecturerOptionsByRoomType = Object.fromEntries(
    scopedLecturerResults.map(({ roomTypeId, result }) => [
      roomTypeId,
      ((result.data ?? []) as Array<{ id: string; full_name: string }>).map(
        (person) => ({ value: person.id, label: person.full_name }),
      ),
    ]),
  );
  const canCreate = roles.some((role) =>
    ["admin", "staff", "importer"].includes(role),
  );

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      title="Lớp đang mở"
      description={`Toàn bộ lớp từ ${range.from.split("-").reverse().join("/")} đến ${range.to.split("-").reverse().join("/")}.`}
      actions={
        canCreate ? (
          <Link className="button button-primary" href="/schedule-entry/new">
            <Plus size={17} /> Tạo phiếu mới thủ công
          </Link>
        ) : null
      }
    >
      <ClassRegistrationList
        classes={classes}
        mode="open"
        viewerId={userId}
        roles={roles}
        range={range}
        lecturerOptionsByRoomType={lecturerOptionsByRoomType}
        roomTypeOptions={roomTypes}
        roomOptions={(rooms ?? []).map((room) => ({
          id: room.id,
          label: `${room.room_code} · ${room.building_code}`,
          roomTypeId: room.room_type_id,
        }))}
      />
    </WorkspaceShell>
  );
}
