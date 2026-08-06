import { redirect } from "next/navigation";
import Link from "next/link";
import { Download } from "@/components/icons";
import { EquipmentImportWizard } from "@/components/equipment-import-wizard";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";

export const metadata = { title: "Import Phiếu thiết bị" };

export default async function EquipmentImportPage() {
  const {
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
  } = await getViewer();
  if (!roles.some((role) => ["admin", "staff"].includes(role))) {
    redirect("/equipment/mine");
  }

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      title="Import Phiếu thiết bị"
      description="Tải template chuẩn, kiểm tra từng dòng và đưa các phiếu thiết bị cũ lên hệ thống."
      actions={
        <>
          <Link
            className="button button-secondary"
            download
            href="/api/equipment-import-template/csv"
            prefetch={false}
          >
            <Download size={16} /> Template CSV
          </Link>
          <Link
            className="button button-primary"
            download
            href="/api/equipment-import-template/xlsx"
            prefetch={false}
          >
            <Download size={16} /> Template XLSX
          </Link>
        </>
      }
    >
      <EquipmentImportWizard />
    </WorkspaceShell>
  );
}
