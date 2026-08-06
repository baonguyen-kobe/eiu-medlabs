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
import { isWorkspaceManager } from "@/lib/workspace-access";
import Link from "next/link";
import { redirect } from "next/navigation";

type Tab = "inventory" | "rooms" | "damaged" | "logs";

export default async function BasicMedicalEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; notice?: string; error?: string }>;
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
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!isWorkspaceManager(roles)) redirect("/dashboard");
  const canManage = isWorkspaceManager(roles);
  const activeTab: Tab =
    query.tab === "rooms" || query.tab === "damaged" || query.tab === "logs"
      ? query.tab
      : "inventory";

  const [catalogResult, inventoryResult, roomResult, logResult] =
    await Promise.all([
      supabase
        .from("basic_medical_equipment_catalog")
        .select(
          "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
        )
        .order("item_name")
        .limit(5000),
      supabase
        .from("basic_medical_room_inventory")
        .select(
          "id,room_id,catalog_item_id,total_quantity,good_quantity,damaged_quantity,is_active,last_damage_reported_at,room:rooms(id,room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active),last_damage_reporter:profiles!basic_medical_room_inventory_last_damage_reporter_id_fkey(full_name)",
        )
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(5000),
      supabase
        .from("rooms")
        .select("id,room_code,building_code,room_name")
        .eq("room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
        .eq("is_active", true)
        .order("building_code")
        .order("room_code"),
      canManage
        ? supabase
            .from("basic_medical_equipment_condition_logs")
            .select(
              "id,event_type,total_before,good_before,damaged_before,total_after,good_after,damaged_after,quantity_delta,note,created_at,inventory:basic_medical_room_inventory(room:rooms(room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(item_name,commercial_name,unit)),actor:profiles!basic_medical_equipment_condition_logs_actor_id_fkey(full_name)",
            )
            .order("created_at", { ascending: false })
            .limit(5000)
        : Promise.resolve({ data: [], error: null }),
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
    </WorkspaceShell>
  );
}
