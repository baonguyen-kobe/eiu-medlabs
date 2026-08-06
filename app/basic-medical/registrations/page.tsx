import { BasicMedicalRegistrationList } from "@/components/basic-medical-registration-list";
import { Search } from "@/components/icons";
import { PaginationLinks } from "@/components/pagination-links";
import { WorkspaceShell } from "@/components/workspace-shell";
import type {
  BasicMedicalRegistrationListItem,
  BasicMedicalRoomInventoryItem,
} from "@/lib/basic-medical-equipment";
import { normalizePage, paginationRange } from "@/lib/pagination";
import { getViewer } from "@/lib/viewer";
import {
  canViewBasicMedicalRegistrations,
  canViewBasicMedicalSchedules,
} from "@/lib/workspace-access";
import { redirect } from "next/navigation";

type SearchParams = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
  notice?: string;
  error?: string;
};

export default async function BasicMedicalRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const {
    supabase,
    userId,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageBasicMedical,
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canViewBasicMedicalRegistrations(roles, roomTypeCodes)) {
    redirect(
      canViewBasicMedicalSchedules(roles, roomTypeCodes)
        ? "/basic-medical/schedules"
        : "/dashboard",
    );
  }

  const canDelete = canManageBasicMedical;
  const currentPage = normalizePage(query.page);
  const status = query.status === "completed" ? "completed" : "incomplete";
  const search = query.q?.trim() ?? "";
  const { from: rowFrom, to: rowTo } = paginationRange(currentPage);

  let listQuery = supabase
    .from("basic_medical_registration_list")
    .select("id", { count: "exact" })
    .eq("is_completed", status === "completed")
    .order("created_at", { ascending: false });
  if (search) listQuery = listQuery.ilike("search_text", `%${search}%`);
  if (query.from) listQuery = listQuery.gte("end_date", query.from);
  if (query.to) listQuery = listQuery.lte("start_date", query.to);

  const {
    data: listRows,
    count,
    error: listError,
  } = await listQuery.range(rowFrom, rowTo);
  const registrationIds = (listRows ?? []).map(({ id }) => id as string);

  const { data: registrationRows, error: registrationError } =
    registrationIds.length
      ? await supabase
          .from("basic_medical_registrations")
          .select(
            "id,registration_code,created_at,academic_year,semester,start_date,end_date,student_count,note,courses(course_code,course_name),rooms(id,room_code,building_code,room_name),registrant:profiles!basic_medical_registrations_registrant_id_fkey(full_name),responsible:profiles!basic_medical_registrations_responsible_lecturer_id_fkey(full_name),basic_medical_registration_sessions(id,session_number,lesson_title,teaching_lecturer_id,teaching:profiles!basic_medical_registration_sessions_teaching_lecturer_id_fkey(full_name),class_schedules(schedule_date,start_time,end_time),confirmations:basic_medical_session_confirmations(id,signer_id,signed_at,invalidated_at,signer:profiles!basic_medical_session_confirmations_signer_id_fkey(full_name)))",
          )
          .in("id", registrationIds)
      : { data: [], error: null };

  const order = new Map(registrationIds.map((id, index) => [id, index]));
  const registrations = (
    (registrationRows ?? []) as unknown as BasicMedicalRegistrationListItem[]
  ).sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  );
  const roomIds = [
    ...new Set(
      registrations.flatMap((item) => (item.rooms?.id ? [item.rooms.id] : [])),
    ),
  ];
  const { data: inventoryRows, error: inventoryError } = roomIds.length
    ? await supabase
        .from("basic_medical_room_inventory")
        .select(
          "id,room_id,catalog_item_id,total_quantity,good_quantity,damaged_quantity,is_active,last_damage_reported_at,room:rooms(id,room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active),last_damage_reporter:profiles!basic_medical_room_inventory_last_damage_reporter_id_fkey(full_name)",
        )
        .in("room_id", roomIds)
        .eq("is_active", true)
        .order("created_at")
    : { data: [], error: null };

  const loadError = listError ?? registrationError ?? inventoryError;

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      title="Phiếu Y cơ sở"
      description="Theo dõi xác nhận từng buổi học và tình trạng thiết bị trong phòng."
    >
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error || loadError ? (
        <p className="action-feedback error" role="alert">
          {query.error ?? `Không thể tải dữ liệu: ${loadError?.message}`}
        </p>
      ) : null}

      <form
        className="class-filter-panel equipment-request-filters basic-medical-registration-filters"
        method="get"
      >
        <label className="data-search">
          <Search size={18} aria-hidden="true" />
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Tìm mã môn, tên môn, phòng, giảng viên…"
          />
        </label>
        <label className="class-range-mode">
          <span className="sr-only">Trạng thái</span>
          <select name="status" defaultValue={status}>
            <option value="incomplete">Chưa hoàn thành</option>
            <option value="completed">Hoàn thành</option>
          </select>
        </label>
        <label className="equipment-date-filter">
          <span>Từ ngày</span>
          <input
            aria-label="Từ ngày"
            name="from"
            type="date"
            defaultValue={query.from}
          />
        </label>
        <label className="equipment-date-filter">
          <span>Đến ngày</span>
          <input
            aria-label="Đến ngày"
            name="to"
            type="date"
            defaultValue={query.to}
          />
        </label>
        <button type="submit" className="button button-primary">
          Lọc
        </button>
        <a
          className="button button-secondary"
          href="/basic-medical/registrations"
        >
          Xóa bộ lọc
        </a>
        <span className="equipment-filter-count">{count ?? 0} phiếu</span>
      </form>

      <BasicMedicalRegistrationList
        registrations={registrations}
        inventories={
          (inventoryRows ?? []) as unknown as BasicMedicalRoomInventoryItem[]
        }
        viewerId={userId}
        canDelete={canDelete}
      />
      <PaginationLinks
        currentPage={currentPage}
        totalItems={count ?? 0}
        pathname="/basic-medical/registrations"
        query={{ q: search, status, from: query.from, to: query.to }}
      />
    </WorkspaceShell>
  );
}
