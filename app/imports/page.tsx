import { Import, Plus } from "@/components/icons";
import { ImportHistoryTable } from "@/components/import-history-table";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";
import { PaginationLinks } from "@/components/pagination-links";
import { normalizePage, paginationRange } from "@/lib/pagination";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const {
    supabase,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageEmailNotifications,
  } = await getViewer();
  if (
    !roles.includes("admin") &&
    !(
      canImportSchedules &&
      roles.some((role) =>
        ["staff", "lecturer", "teaching_assistant"].includes(role),
      )
    )
  ) {
    redirect("/dashboard");
  }

  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const { data: batches, count } = await supabase
    .from("import_batches")
    .select(
      `
      id, original_file_name, status, total_rows, valid_rows, warning_rows,
      error_rows, imported_rows, duplicate_rows, conflict_rows, created_at, completed_at,
      room_types (name)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      canManageEmailNotifications={canManageEmailNotifications}
      title="Lịch sử import"
      description="Theo dõi số dòng đã tạo, cảnh báo, lỗi và dữ liệu trùng."
      actions={
        <Link className="button button-primary" href="/schedule-entry/import">
          <Plus size={17} /> Import mới
        </Link>
      }
    >
      <section className="data-panel">
        <div className="data-toolbar">
          <Import size={20} />
          <h2 className="standard-section-heading">Các phiên import gần đây</h2>
          <span>{batches?.length ?? 0} phiên</span>
        </div>
        <ImportHistoryTable batches={batches ?? []} />
        {!batches?.length ? (
          <p className="panel-empty">Chưa có phiên import nào.</p>
        ) : null}
        <PaginationLinks
          currentPage={currentPage}
          totalItems={count ?? 0}
          pathname="/imports"
        />
      </section>
    </WorkspaceShell>
  );
}
