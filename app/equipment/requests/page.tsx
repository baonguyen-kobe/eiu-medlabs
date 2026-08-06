import { redirect } from "next/navigation";
import { EquipmentRequestList } from "@/components/equipment-request-list";
import { WorkspaceShell } from "@/components/workspace-shell";
import { equipmentRequestSelect } from "@/lib/equipment-requests";
import { getViewer } from "@/lib/viewer";

export default async function EquipmentRequestsPage() {
  const {
    supabase,
    userId,
    email,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
  } = await getViewer();
  if (!roles.some((role) => ["admin", "staff"].includes(role))) {
    redirect("/equipment/mine");
  }

  const [{ data }, { data: catalog }] = await Promise.all([
    supabase
      .from("equipment_requests")
      .select(equipmentRequestSelect)
      .order("created_at", { ascending: false }),
    supabase
      .from("equipment_catalog")
      .select(
        "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit",
      )
      .eq("is_active", true)
      .order("item_name"),
  ]);

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      title="Phiếu thiết bị"
      description="Toàn bộ phiếu thiết bị đã đăng ký, dành cho Admin và Staff quản lý phòng."
    >
      <EquipmentRequestList
        requests={data ?? []}
        emptyMessage="Chưa có phiếu đăng ký thiết bị."
        canManageStatus
        canAddItems
        catalog={catalog ?? []}
        viewerId={userId}
        viewerEmail={email}
        viewerRoles={roles}
      />
    </WorkspaceShell>
  );
}
