import { FileClock, Import, Plus } from "@/components/icons";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";
import { PaginationLinks } from "@/components/pagination-links";
import { normalizePage, paginationRange } from "@/lib/pagination";

const importStatusLabels: Record<string, string> = {
  uploaded: "Đã tải lên",
  validating: "Đang kiểm tra",
  ready: "Sẵn sàng import",
  validated: "Đã kiểm tra",
  importing: "Đang tạo lịch",
  completed: "Hoàn tất",
  completed_with_errors: "Hoàn tất · Có lỗi",
  failed: "Thất bại",
};

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase, fullName, roles, roomTypes, allowBasicMedicalAccess } =
    await getViewer();
  if (!roles.some((role) => ["admin", "staff"].includes(role))) {
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
        <div
          className="responsive-table"
          role="region"
          aria-label="Lịch sử import; vuốt ngang để xem đầy đủ"
          tabIndex={0}
        >
          <table className="data-table import-history-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Thời điểm</th>
                <th>Trạng thái</th>
                <th>Phạm vi</th>
                <th>Tổng</th>
                <th>Đã tạo</th>
                <th>Cảnh báo</th>
                <th>Lỗi</th>
                <th>Trùng</th>
                <th>Xung đột</th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <strong>
                      <FileClock size={15} /> {batch.original_file_name}
                    </strong>
                    <small className="mono">{batch.id}</small>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(new Date(batch.created_at))}
                  </td>
                  <td>
                    <span className="status-pill">
                      {importStatusLabels[batch.status] ?? batch.status}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {(batch.room_types as unknown as { name: string } | null)
                        ?.name ?? "Kỹ năng Điều dưỡng"}
                    </strong>
                  </td>
                  <td>{batch.total_rows}</td>
                  <td>{batch.imported_rows}</td>
                  <td>{batch.warning_rows}</td>
                  <td>{batch.error_rows}</td>
                  <td>{batch.duplicate_rows}</td>
                  <td>{batch.conflict_rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
