import { EquipmentRequestList } from "@/components/equipment-request-list";
import { WorkspaceShell } from "@/components/workspace-shell";
import { equipmentRequestSelect } from "@/lib/equipment-requests";
import { isEquipmentRequestId } from "@/lib/equipment-calendar-request";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";
import {
  canUseSkillsWorkspace,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

export default async function MyEquipmentRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
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
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canUseSkillsWorkspace(roles, roomTypeCodes)) {
    redirect(defaultWorkspacePath(roles, roomTypeCodes));
  }

  const [query, { data }] = await Promise.all([
    searchParams,
    supabase
      .from("equipment_requests")
      .select(equipmentRequestSelect)
      .or(`registrant_id.eq.${userId},responsible_lecturer_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
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
        initialRequestId={
          isEquipmentRequestId(query.request) ? query.request : undefined
        }
      />
    </WorkspaceShell>
  );
}
