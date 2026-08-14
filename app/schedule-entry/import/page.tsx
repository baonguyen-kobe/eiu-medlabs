import { redirect } from "next/navigation";
import { Download } from "@/components/icons";
import Link from "next/link";
import { ImportWizard } from "@/components/import-wizard";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";
import {
  canUseSkillsWorkspace,
  defaultWorkspacePath,
} from "@/lib/workspace-access";

export const metadata = { title: "Import lịch Skills lab" };

export default async function ImportPage() {
  const {
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageEmailNotifications,
  } = await getViewer();
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (!canUseSkillsWorkspace(roles, roomTypeCodes)) {
    redirect(defaultWorkspacePath(roles, roomTypeCodes));
  }
  const allowed =
    roles.includes("admin") ||
    (canImportSchedules &&
      roles.some((role) =>
        ["staff", "lecturer", "teaching_assistant"].includes(role),
      ));
  if (!allowed) redirect("/dashboard");

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      canManageEmailNotifications={canManageEmailNotifications}
      title="Import lịch Skills lab"
      description="Tải template chuẩn, kiểm tra từng dòng và tạo lịch hợp lệ."
      actions={
        <>
          <Link
            className="button button-secondary"
            download
            href="/api/import-template/csv?scope=skills_lab"
            prefetch={false}
          >
            <Download size={16} /> Template CSV
          </Link>
          <Link
            className="button button-primary"
            download
            href="/api/import-template/xlsx?scope=skills_lab"
            prefetch={false}
          >
            <Download size={16} /> Template XLSX
          </Link>
        </>
      }
    >
      <ImportWizard embedded scope="skills_lab" />
    </WorkspaceShell>
  );
}
