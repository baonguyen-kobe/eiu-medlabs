import {
  createBasicMedicalCatalogItem,
  importBasicMedicalEquipment,
} from "@/app/basic-medical/equipment/actions";
import { BasicMedicalEquipmentManager } from "@/components/basic-medical-equipment-manager";
import { Download, UploadCloud } from "@/components/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import type {
  BasicMedicalConditionLogItem,
  BasicMedicalEquipmentCatalogItem,
  BasicMedicalRoomInventoryItem,
} from "@/lib/basic-medical-equipment";
import { BASIC_MEDICAL_ROOM_TYPE_ID } from "@/lib/room-types";
import { getViewer } from "@/lib/viewer";
import { canManageBasicMedicalWorkspace } from "@/lib/workspace-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaginationLinks } from "@/components/pagination-links";
import { normalizePage, paginationRange } from "@/lib/pagination";

type Tab = "inventory" | "rooms" | "damaged" | "logs";

export default async function BasicMedicalEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    q?: string;
    room?: string;
    status?: string;
    event?: string;
    page?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const {
    supabase,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageBasicMedical,
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (
    !canManageBasicMedical ||
    !canManageBasicMedicalWorkspace(roles, roomTypeCodes)
  )
    redirect("/dashboard");
  const canManage = true;
  const activeTab: Tab =
    query.tab === "rooms" || query.tab === "damaged" || query.tab === "logs"
      ? query.tab
      : "inventory";
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const search = query.q?.trim() ?? "";

  let catalogQuery = supabase
    .from("basic_medical_equipment_catalog")
    .select(
      "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
      { count: "exact" },
    );
  if (search)
    catalogQuery = catalogQuery.or(
      `item_name.ilike.%${search}%,commercial_name.ilike.%${search}%,item_type.ilike.%${search}%,manufacturer.ilike.%${search}%,model.ilike.%${search}%`,
    );
  if (query.status === "active" || query.status === "inactive")
    catalogQuery = catalogQuery.eq("is_active", query.status === "active");

  let inventoryQuery = supabase
    .from("basic_medical_room_inventory")
    .select(
      "id,room_id,catalog_item_id,total_quantity,good_quantity,damaged_quantity,is_active,last_damage_reported_at,room:rooms(id,room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active),last_damage_reporter:profiles!basic_medical_room_inventory_last_damage_reporter_id_fkey(full_name)",
      { count: "exact" },
    )
    .eq("is_active", true);
  if (activeTab === "damaged")
    inventoryQuery = inventoryQuery.gt("damaged_quantity", 0);
  if (query.room) inventoryQuery = inventoryQuery.eq("room_id", query.room);

  const [catalogResult, inventoryResult, roomResult, logResult] =
    await Promise.all([
      activeTab === "inventory"
        ? catalogQuery.order("item_name").range(from, to)
        : activeTab === "rooms"
          ? supabase
              .from("basic_medical_equipment_catalog")
              .select(
                "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
              )
              .eq("is_active", true)
              .order("item_name")
              .limit(500)
          : Promise.resolve({ data: [], error: null, count: 0 }),
      activeTab === "rooms" || activeTab === "damaged"
        ? inventoryQuery
            .order("updated_at", { ascending: false })
            .range(from, to)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      activeTab === "rooms" || activeTab === "damaged"
        ? supabase
            .from("rooms")
            .select("id,room_code,building_code,room_name")
            .eq("room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
            .eq("is_active", true)
            .order("building_code")
            .order("room_code")
        : Promise.resolve({ data: [], error: null }),
      activeTab === "logs"
        ? (() => {
            let logsQuery = supabase
              .from("basic_medical_equipment_condition_logs")
              .select(
                "id,event_type,total_before,good_before,damaged_before,total_after,good_after,damaged_after,quantity_delta,note,created_at,inventory:basic_medical_room_inventory(room:rooms(room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(item_name,commercial_name,unit)),actor:profiles!basic_medical_equipment_condition_logs_actor_id_fkey(full_name)",
                { count: "exact" },
              );
            if (query.event)
              logsQuery = logsQuery.eq("event_type", query.event);
            if (search) logsQuery = logsQuery.ilike("note", `%${search}%`);
            return logsQuery
              .order("created_at", { ascending: false })
              .range(from, to);
          })()
        : Promise.resolve({ data: [], error: null, count: 0 }),
    ]);
  const loadError =
    catalogResult.error ??
    inventoryResult.error ??
    roomResult.error ??
    logResult.error;

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      title="Danh sách thiết bị Y cơ sở"
      description="Quản lý thiết bị riêng theo từng phòng, tình trạng Tốt/Hư và lịch sử thay đổi."
    >
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error || loadError ? (
        <p className="action-feedback error" role="alert">
          {query.error ?? `Không thể tải dữ liệu: ${loadError?.message}`}
        </p>
      ) : null}
      <nav
        className="catalog-tabs basic-medical-equipment-tabs"
        aria-label="Thiết bị Y cơ sở"
      >
        {[
          ["inventory", "Thiết bị"],
          ["rooms", "Thiết bị theo phòng"],
          ["damaged", "Thiết bị hư"],
          ["logs", "Log thay đổi"],
        ].map(([tab, label]) => (
          <Link
            key={tab}
            className={activeTab === tab ? "active" : ""}
            href={`/basic-medical/equipment?tab=${tab}`}
            scroll={false}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="basic-medical-list-filters" method="get">
        <input type="hidden" name="tab" value={activeTab} />
        <label className="data-search">
          <span className="sr-only">Tìm kiếm</span>
          <input
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Tìm thiết bị, phòng, người thay đổi, ghi chú…"
          />
        </label>
        {activeTab === "inventory" ? (
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang sử dụng</option>
            <option value="inactive">Ngừng sử dụng</option>
          </select>
        ) : null}
        {activeTab === "rooms" || activeTab === "damaged" ? (
          <select name="room" defaultValue={query.room ?? ""}>
            <option value="">Tất cả phòng</option>
            {(roomResult.data ?? []).map((room) => (
              <option key={room.id} value={room.id}>
                {room.room_code}.{room.building_code}
              </option>
            ))}
          </select>
        ) : null}
        {activeTab === "logs" ? (
          <select name="event" defaultValue={query.event ?? ""}>
            <option value="">Tất cả thay đổi</option>
            <option value="damage_report">Báo Hư</option>
            <option value="condition_adjustment">Điều chỉnh Tốt/Hư</option>
            <option value="stock_adjustment">Điều chỉnh tồn kho</option>
          </select>
        ) : null}
        <button className="button button-primary" type="submit">
          Lọc
        </button>
        <Link
          className="button button-secondary"
          href={`/basic-medical/equipment?tab=${activeTab}`}
        >
          Xóa bộ lọc
        </Link>
      </form>
      {canManage && activeTab === "inventory" ? (
        <div className="basic-medical-catalog-actions">
          <form
            action={createBasicMedicalCatalogItem}
            className="data-panel catalog-inline-form equipment-catalog-create-form"
          >
            <div className="equipment-catalog-create-heading">
              <strong>Thêm thiết bị thủ công</strong>
            </div>
            <div className="form-grid equipment-catalog-create-grid">
              {[
                ["item_name", "Tên thiết bị và vật tư *"],
                ["commercial_name", "Tên thương mại"],
                ["item_type", "Loại"],
                ["country_of_origin", "Nước SX"],
                ["manufacturer", "Hãng"],
                ["model", "Model"],
                ["unit", "ĐVT *"],
              ].map(([name, label]) => (
                <label key={name}>
                  <span>{label}</span>
                  <input
                    name={name}
                    required={name === "item_name" || name === "unit"}
                  />
                </label>
              ))}
            </div>
            <button type="submit" className="button button-primary">
              Thêm vào danh mục
            </button>
          </form>

          <form
            action={importBasicMedicalEquipment}
            className="data-panel equipment-catalog-import"
          >
            <label className="equipment-import-file">
              <UploadCloud size={20} aria-hidden="true" />
              <span>File CSV hoặc XLSX</span>
              <input name="file" type="file" accept=".csv,.xlsx" required />
            </label>
            <div className="equipment-import-actions">
              <a
                className="button equipment-template-download"
                href="/api/basic-medical-equipment-template"
              >
                <Download size={17} aria-hidden="true" /> Tải template
              </a>
              <button
                type="submit"
                className="button equipment-import-new"
                name="mode"
                value="new"
              >
                <UploadCloud size={17} aria-hidden="true" /> Import mới
              </button>
              <button
                type="submit"
                className="button equipment-import-all"
                name="mode"
                value="all"
              >
                <UploadCloud size={17} aria-hidden="true" /> Import tất cả
              </button>
              <a
                className="button equipment-export-all"
                href="/api/basic-medical-equipment-export"
              >
                <Download size={17} aria-hidden="true" /> Export tất cả
              </a>
            </div>
          </form>
        </div>
      ) : null}
      <BasicMedicalEquipmentManager
        activeTab={activeTab}
        catalog={
          (catalogResult.data ??
            []) as unknown as BasicMedicalEquipmentCatalogItem[]
        }
        inventories={
          (inventoryResult.data ??
            []) as unknown as BasicMedicalRoomInventoryItem[]
        }
        rooms={
          (roomResult.data ?? []) as Array<{
            id: string;
            room_code: string;
            building_code: string;
            room_name: string | null;
          }>
        }
        logs={
          (logResult.data ?? []) as unknown as BasicMedicalConditionLogItem[]
        }
        canManage={canManage}
      />
      <PaginationLinks
        currentPage={currentPage}
        totalItems={
          activeTab === "inventory"
            ? (catalogResult.count ?? 0)
            : activeTab === "logs"
              ? (logResult.count ?? 0)
              : (inventoryResult.count ?? 0)
        }
        pathname="/basic-medical/equipment"
        query={{
          tab: activeTab,
          q: search || undefined,
          room: query.room,
          status: query.status,
          event: query.event,
        }}
      />
    </WorkspaceShell>
  );
}
