import { Fragment } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin";
import { CatalogTabs } from "@/components/catalog-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { normalizePage, paginationRange } from "@/lib/pagination";

const actionLabels: Record<string, string> = {
  "class_schedule.created": "Tạo lịch học",
  "class_schedule.updated": "Sửa lịch học",
  "class_schedule.status_changed": "Đổi trạng thái lịch",
  "class_schedule.lecturer_changed": "Đổi giảng viên",
  "staff_shift.created": "Tạo ca trực",
  "staff_shift.updated": "Sửa ca trực",
  "staff_shift.status_changed": "Đổi trạng thái ca",
  "import.started": "Bắt đầu import",
  "import.status_changed": "Cập nhật import",
  "role.assigned": "Gán vai trò",
  "role.removed": "Gỡ vai trò",
  "profile.updated": "Đổi trạng thái tài khoản",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const { data: logs, count } = await supabase
    .from("audit_logs")
    .select(
      `
      id, action, entity_type, entity_id, created_at,
      profiles!audit_logs_actor_id_fkey (full_name, email)
    `,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  return (
    <AdminShell
      title="Audit log"
      description="Lịch sử thay đổi nghiệp vụ, chỉ admin được xem."
      active="/admin/audit"
    >
      <CatalogTabs active="/admin/audit" />
      <div className="data-panel catalog-data-panel">
        <div
          className="responsive-table"
          role="region"
          aria-label="Lịch sử thay đổi; vuốt ngang để xem đầy đủ"
          tabIndex={0}
        >
          <table className="data-table catalog-data-table audit-log-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thao tác</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
                <th>Mã bản ghi</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => {
                const actor = log.profiles as unknown as {
                  full_name: string;
                  email: string;
                } | null;
                const formattedTime = new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "medium",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(log.created_at));
                const actionText = actionLabels[log.action] ?? log.action;

                return (
                  <Fragment key={log.id}>
                    {/* Desktop Table Row (active > 920px) */}
                    <tr className="audit-desktop-row">
                      <td>{formattedTime}</td>
                      <td>
                        {actor?.full_name ?? "Hệ thống"}
                        <small>{actor?.email}</small>
                      </td>
                      <td>
                        <strong>{actionText}</strong>
                      </td>
                      <td className="mono">{log.entity_type}</td>
                      <td className="mono">
                        {log.entity_id?.slice(0, 8) ?? "—"}
                      </td>
                    </tr>

                    {/* Mobile Strategy C Card Row (active <= 920px) */}
                    <tr className="audit-mobile-row">
                      <td colSpan={5} className="audit-mobile-cell">
                        <article className="audit-card">
                          <div className="audit-card-header">
                            <time className="audit-card-time">
                              {formattedTime}
                            </time>
                            <span className="audit-card-action">
                              <strong>{actionText}</strong>
                            </span>
                          </div>
                          <div className="audit-card-actor">
                            <span className="audit-actor-name">
                              {actor?.full_name ?? "Hệ thống"}
                            </span>
                            {actor?.email ? (
                              <small className="audit-actor-email">
                                {actor.email}
                              </small>
                            ) : null}
                          </div>
                          <div className="audit-card-footer">
                            <span className="audit-entity-type mono">
                              {log.entity_type}
                            </span>
                            <span className="audit-entity-id mono">
                              {log.entity_id?.slice(0, 8) ?? "—"}
                            </span>
                          </div>
                        </article>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationLinks
          currentPage={currentPage}
          totalItems={count ?? 0}
          pathname="/admin/audit"
        />
      </div>
    </AdminShell>
  );
}
