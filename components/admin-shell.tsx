import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";

export async function AdminShell({
  title,
  description,
  active,
  actions,
  children,
}: {
  title: string;
  description: string;
  active: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { fullName, roles, roomTypes, allowBasicMedicalAccess } =
    await getViewer();
  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      title={title}
      description={description}
      actions={actions}
    >
      <section className="admin-page workspace-admin-page" data-active={active}>
        <div className="admin-content">{children}</div>
      </section>
    </WorkspaceShell>
  );
}
