import { AdminShell } from "@/components/admin-shell";
import {
  createCourse,
  deleteCourse,
  importCourses,
  toggleCourse,
} from "@/app/admin/actions";
import { CatalogTabs } from "@/components/catalog-tabs";
import { CatalogImportActions } from "@/components/catalog-import-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Trash2 } from "@/components/icons";
import { PaginationLinks } from "@/components/pagination-links";
import { requireAdmin } from "@/lib/admin";
import { normalizePage, paginationRange } from "@/lib/pagination";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const [{ data: courses, count }, { data: roomTypes }] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, course_code, course_name, room_type_id, is_active, room_types (name)",
        { count: "exact" },
      )
      .order("course_code")
      .range(from, to),
    supabase.from("room_types").select("id, name, is_active").order("name"),
  ]);

  return (
    <AdminShell
      title="Danh mục môn học"
      description="Tạo mới, ngừng sử dụng hoặc xóa môn học chưa phát sinh lịch."
      active="/admin/courses"
      actions={
        <CatalogImportActions action={importCourses} catalog="courses" />
      }
    >
      <CatalogTabs active="/admin/courses" />
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error ? (
        <p className="action-feedback error">{query.error}</p>
      ) : null}
      <form
        action={createCourse}
        className="admin-create-form admin-create-course"
      >
        <label>
          Mã môn học
          <input name="course_code" required placeholder="NUR 301" />
        </label>
        <label>
          Tên môn học
          <input name="course_name" required placeholder="Tên môn học" />
        </label>
        <label>
          Loại
          <select name="room_type_id" required defaultValue="">
            <option value="" disabled>
              Chọn Loại
            </option>
            {(roomTypes ?? [])
              .filter(({ is_active }) => is_active)
              .map((roomType) => (
                <option key={roomType.id} value={roomType.id}>
                  {roomType.name}
                </option>
              ))}
          </select>
        </label>
        <button className="button button-primary">Thêm môn học</button>
      </form>
      <div className="data-panel catalog-data-panel">
        <div
          className="responsive-table"
          role="region"
          aria-label="Danh mục môn học; vuốt ngang để xem đầy đủ"
          tabIndex={0}
        >
          <table className="data-table catalog-data-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên môn học</th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(courses ?? []).map((course) => (
                <tr key={course.id}>
                  <td className="mono">{course.course_code}</td>
                  <td>{course.course_name}</td>
                  <td>
                    {(course.room_types as unknown as { name: string } | null)
                      ?.name ?? "—"}
                  </td>
                  <td>
                    <span
                      className={`status-pill ${course.is_active ? "is-active" : ""}`}
                    >
                      {course.is_active ? "Đang dùng" : "Ngừng dùng"}
                    </span>
                  </td>
                  <td className="catalog-row-actions">
                    <form action={toggleCourse}>
                      <input type="hidden" name="id" value={course.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(!course.is_active)}
                      />
                      <button className="table-action">
                        {course.is_active ? "Ngừng dùng" : "Kích hoạt"}
                      </button>
                    </form>
                    <form action={deleteCourse}>
                      <input type="hidden" name="id" value={course.id} />
                      <ConfirmSubmitButton
                        className="table-action delete-action"
                        message={`Xóa môn học ${course.course_code}?`}
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
          pathname="/admin/courses"
        />
      </div>
    </AdminShell>
  );
}
