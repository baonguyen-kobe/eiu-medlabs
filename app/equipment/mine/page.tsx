import { EquipmentRequestList } from "@/components/equipment-request-list";
import { WorkspaceShell } from "@/components/workspace-shell";
import { equipmentRequestSelect } from "@/lib/equipment-requests";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import {
  canUseSkillsWorkspace,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

export default async function MyEquipmentRequestsPage() {
  const {
    supabase,
    userId,
    email,
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

  const { data } = await supabase
    .from("equipment_requests")
    .select(equipmentRequestSelect)
    .or(`registrant_id.eq.${userId},responsible_lecturer_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      title="Phiếu thiết bị của tôi"
      description="Các phiếu mà bạn là người đăng ký hoặc giảng viên phụ trách."
    >
      <EquipmentRequestList
        requests={data ?? []}
        emptyMessage="Bạn chưa có phiếu thiết bị liên quan."
        canManageStatus={roles.some((role) =>
          ["admin", "staff"].includes(role),
        )}
        viewerId={userId}
        viewerEmail={email}
        viewerRoles={roles}
      />
    </WorkspaceShell>
  );
}
