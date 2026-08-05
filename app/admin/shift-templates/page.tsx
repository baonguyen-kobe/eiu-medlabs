import { AdminShell } from "@/components/admin-shell";
import {
  createShiftTemplate,
  deleteShiftTemplate,
  toggleShiftTemplate,
} from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin";
import { CatalogTabs } from "@/components/catalog-tabs";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Trash2 } from "@/components/icons";
import { PaginationLinks } from "@/components/pagination-links";
import { normalizePage, paginationRange } from "@/lib/pagination";

export default async function ShiftTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const { data: templates, count } = await supabase
    .from("shift_templates")
    .select("id, shift_code, shift_name, start_time, end_time, is_active", {
      count: "exact",
    })
    .order("start_time")
    .range(from, to);

  return (
    <AdminShell
      title="Mẫu ca trực"
      description="Các khung giờ chuẩn để staff tự đăng ký ca của chính mình."
      active="/admin/shift-templates"
    >
      <CatalogTabs active="/admin/shift-templates" />
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error ? (
        <p className="action-feedback error">{query.error}</p>
      ) : null}
      <form action={createShiftTemplate} className="admin-create-form">
        <label>
          Mã ca
          <input name="shift_code" required placeholder="EVENING" />
        </label>
        <label>
          Tên ca
          <input name="shift_name" required placeholder="Ca tối" />
        </label>
        <label>
          Bắt đầu
          <input name="start_time" type="time" required />
        </label>
        <label>
          Kết thúc
          <input name="end_time" type="time" required />
        </label>
        <button className="button button-primary">Thêm mẫu ca</button>
      </form>
      <div className="data-panel catalog-data-panel">
        <div
          className="responsive-table"
          role="region"
          aria-label="Danh mục mẫu ca trực; vuốt ngang để xem đầy đủ"
          tabIndex={0}
        >
          <table className="data-table catalog-data-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên ca</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(templates ?? []).map((template) => (
                <tr key={template.id}>
                  <td className="mono">{template.shift_code}</td>
                  <td>{template.shift_name}</td>
                  <td>
                    {template.start_time.slice(0, 5)}–
                    {template.end_time.slice(0, 5)}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${template.is_active ? "is-active" : ""}`}
                    >
                      {template.is_active ? "Đang dùng" : "Ngừng dùng"}
                    </span>
                  </td>
                  <td className="catalog-row-actions">
                    <form action={toggleShiftTemplate}>
                      <input type="hidden" name="id" value={template.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(!template.is_active)}
                      />
                      <button className="table-action">
                        {template.is_active ? "Ngừng dùng" : "Kích hoạt"}
                      </button>
                    </form>
                    <form action={deleteShiftTemplate}>
                      <input type="hidden" name="id" value={template.id} />
                      <ConfirmSubmitButton
                        className="table-action delete-action"
                        message={`Xóa mẫu ca ${template.shift_name}?`}
                      >
                        <Trash2 size={16} /> Xóa
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationLinks
          currentPage={currentPage}
          totalItems={count ?? 0}
          pathname="/admin/shift-templates"
        />
      </div>
    </AdminShell>
  );
}
