import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { createPersonnel, importPersonnel } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin";
import { NURSING_SKILLS_ROOM_TYPE_ID } from "@/lib/room-types";
import { Download, UploadCloud } from "@/components/icons";
import { PersonnelImportButtons } from "@/components/personnel-import-buttons";
import { PaginationLinks } from "@/components/pagination-links";
import { TABLE_PAGE_SIZE, normalizePage } from "@/lib/pagination";
import {
  PersonnelManagementList,
  type PersonnelListItem,
} from "@/components/personnel-management-list";

const roleLabels = {
  admin: "Quản trị viên",
  staff: "Chuyên viên",
  lecturer: "Giảng viên",
  teaching_assistant: "Trợ giảng",
  viewer: "Người xem",
} as const;

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    import_permission?: string;
    status?: string;
    notice?: string;
    error?: string;
    page?: string;
  }>;
}) {
  const { supabase, userId } = await requireAdmin();
  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const [{ data: roomTypes }, { data: personnelRows, error: personnelError }] =
    await Promise.all([
      supabase
        .from("room_types")
        .select("id,code,name")
        .eq("is_active", true)
        .order("name"),
      supabase.rpc("admin_list_personnel", {
        target_query: query.q?.trim() || null,
        target_role: query.role && query.role !== "all" ? query.role : null,
        target_import_permission: query.import_permission ?? "all",
        target_status: query.status ?? "all",
        target_page: currentPage,
        target_page_size: TABLE_PAGE_SIZE,
      }),
    ]);
  const rows = (personnelRows ?? []) as Array<
    PersonnelListItem & { total_count: number }
  >;
  const totalItems = Number(rows[0]?.total_count ?? 0);

  return (
    <AdminShell
      title="Nhân sự & phân quyền"
      description="Vai trò chính, quyền bổ sung và phạm vi được lưu trong một thao tác."
      active="/admin/personnel"
    >
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error || personnelError ? (
        <p className="action-feedback error">
          {query.error ?? "Không thể tải danh sách nhân sự."}
        </p>
      ) : null}

      <form
        action={importPersonnel}
        className="data-panel equipment-catalog-import personnel-import-panel"
      >
        <label className="equipment-import-file">
          <UploadCloud size={20} />
          <span>File CSV hoặc XLSX</span>
          <input
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Chọn file import nhân sự"
            name="file"
            required
            type="file"
          />
        </label>
        <div className="equipment-import-actions">
          <Link
            className="button equipment-template-download"
            download
            href="/api/admin-catalog-template/personnel"
            prefetch={false}
          >
            <Download size={17} /> Tải template
          </Link>
          <PersonnelImportButtons />
        </div>
      </form>

      <details className="admin-create-personnel">
        <summary>Thêm nhân sự mới</summary>
        <form action={createPersonnel}>
          <label>
            Họ và tên
            <input name="full_name" required />
          </label>
          <label>
            Email đăng nhập
            <input name="email" type="email" required />
          </label>
          <label>
            Mật khẩu tạm
            <input name="password" type="password" minLength={8} required />
          </label>
          <label>
            Số điện thoại
            <input name="phone" />
          </label>
          <label>
            Chức danh
            <input name="title" />
          </label>
          <fieldset>
            <legend>Vai trò ban đầu</legend>
            {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map(
              (role) => (
                <label className="check-label" key={role}>
                  <input name="roles" type="checkbox" value={role} />
                  {roleLabels[role]}
                </label>
              ),
            )}
          </fieldset>
          <fieldset>
            <legend>Quyền bổ sung</legend>
            <label className="check-label">
              <input name="can_import_schedules" type="checkbox" value="true" />
              Cho phép nhập lịch
            </label>
            <label className="check-label">
              <input
                name="allow_basic_medical_access"
                type="checkbox"
                value="true"
              />
              Cho phép tạo lịch Y cơ sở
            </label>
          </fieldset>
          <fieldset>
            <legend>Loại phòng</legend>
            {(roomTypes ?? []).map((roomType) => (
              <div className="person-room-scope" key={roomType.id}>
                <label className="check-label">
                  <input
                    name="room_type_ids"
                    type="checkbox"
                    value={roomType.id}
                    defaultChecked={roomType.id === NURSING_SKILLS_ROOM_TYPE_ID}
                  />
                  {roomType.name}
                </label>
                <label className="check-label">
                  <input
                    name="email_room_type_ids"
                    type="checkbox"
                    value={roomType.id}
                  />
                  Nhận email lịch của loại phòng này (Người xem)
                </label>
              </div>
            ))}
          </fieldset>
          <button className="button button-primary">Tạo tài khoản</button>
        </form>
      </details>

      <form className="personnel-filters" method="get">
        <label>
          <span>Tìm kiếm</span>
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Tên, email, số điện thoại…"
          />
        </label>
        <label>
          <span>Vai trò</span>
          <select name="role" defaultValue={query.role ?? "all"}>
            <option value="all">Tất cả vai trò</option>
            {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map(
              (role) => (
                <option value={role} key={role}>
                  {roleLabels[role]}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <span>Quyền nhập lịch</span>
          <select
            name="import_permission"
            defaultValue={query.import_permission ?? "all"}
          >
            <option value="all">Tất cả</option>
            <option value="enabled">Có</option>
            <option value="disabled">Không</option>
          </select>
        </label>
        <label>
          <span>Trạng thái</span>
          <select name="status" defaultValue={query.status ?? "all"}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </label>
        <button className="button button-secondary">Lọc</button>
        <span>{totalItems} nhân sự</span>
      </form>

      <PersonnelManagementList
        initialItems={rows.map(({ total_count, ...row }) => {
          void total_count;
          return row;
        })}
        roomTypes={roomTypes ?? []}
        viewerId={userId}
      />
      {!rows.length ? (
        <p className="panel-empty">Không tìm thấy nhân sự phù hợp.</p>
      ) : null}
      <PaginationLinks
        currentPage={currentPage}
        totalItems={totalItems}
        pathname="/admin/personnel"
        query={{
          q: query.q,
          role: query.role,
          import_permission: query.import_permission,
          status: query.status,
        }}
      />
    </AdminShell>
  );
}
