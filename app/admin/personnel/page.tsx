import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import {
  createPersonnel,
  importPersonnel,
  toggleProfile,
  updatePersonnel,
  updateUserRole,
  updatePersonnelScope,
} from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin";
import { NURSING_SKILLS_ROOM_TYPE_ID } from "@/lib/room-types";
import { getNameInitials } from "@/lib/person-name";
import { Download, UploadCloud } from "@/components/icons";
import { PersonnelImportButtons } from "@/components/personnel-import-buttons";
import { PaginationLinks } from "@/components/pagination-links";
import {
  TABLE_PAGE_SIZE,
  normalizePage,
  totalPagesFor,
} from "@/lib/pagination";

const roleLabels = {
  admin: "Quản trị viên",
  lecturer: "Giảng viên",
  staff: "Chuyên viên",
  importer: "Trợ giảng",
  viewer: "Người xem",
} as const;

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    status?: string;
    notice?: string;
    error?: string;
    page?: string;
  }>;
}) {
  const { supabase, userId } = await requireAdmin();
  const query = await searchParams;
  const [
    { data: profiles },
    { data: roleRows },
    { data: roomTypes },
    { data: scopeRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, phone, title, is_active, allow_basic_medical_access",
      )
      .order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase
      .from("room_types")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("profile_room_types")
      .select("profile_id, room_type_id, receive_schedule_emails"),
  ]);

  const rolesByUser = new Map<string, Set<string>>();
  for (const row of roleRows ?? []) {
    const roles = rolesByUser.get(row.user_id) ?? new Set<string>();
    roles.add(row.role);
    rolesByUser.set(row.user_id, roles);
  }
  const scopesByUser = new Map<string, Set<string>>();
  const emailScopesByUser = new Map<string, Set<string>>();
  for (const row of scopeRows ?? []) {
    const scopes = scopesByUser.get(row.profile_id) ?? new Set<string>();
    scopes.add(row.room_type_id);
    scopesByUser.set(row.profile_id, scopes);
    if (row.receive_schedule_emails) {
      const emailScopes =
        emailScopesByUser.get(row.profile_id) ?? new Set<string>();
      emailScopes.add(row.room_type_id);
      emailScopesByUser.set(row.profile_id, emailScopes);
    }
  }
  const normalizedQuery = query.q?.trim().toLocaleLowerCase("vi") ?? "";
  const filteredProfiles = (profiles ?? []).filter((profile) => {
    const roles = rolesByUser.get(profile.id) ?? new Set<string>();
    if (roles.size === 0) return false;
    if (query.role && query.role !== "all" && !roles.has(query.role)) {
      return false;
    }
    if (
      (query.status === "active" && !profile.is_active) ||
      (query.status === "inactive" && profile.is_active)
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    return [
      profile.full_name,
      profile.email,
      profile.phone,
      profile.title,
    ].some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery));
  });
  const requestedPage = normalizePage(query.page);
  const currentPage = Math.min(
    requestedPage,
    totalPagesFor(filteredProfiles.length, TABLE_PAGE_SIZE),
  );
  const pageProfiles = filteredProfiles.slice(
    (currentPage - 1) * TABLE_PAGE_SIZE,
    currentPage * TABLE_PAGE_SIZE,
  );

  return (
    <AdminShell
      title="Nhân sự & vai trò"
      description="Một tài khoản có thể đồng thời mang nhiều vai trò."
      active="/admin/personnel"
    >
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error ? (
        <p className="action-feedback error">{query.error}</p>
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
                  Nhận email thông báo (Người xem)
                </label>
              </div>
            ))}
          </fieldset>
          <label className="check-label">
            <input
              type="checkbox"
              name="allow_basic_medical_access"
              value="true"
            />
            Cho phép tạo lịch Y cơ sở (Giảng viên/Trợ giảng)
          </label>
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
          <span>Trạng thái</span>
          <select name="status" defaultValue={query.status ?? "all"}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </label>
        <button className="button button-secondary">Lọc</button>
        <span>{filteredProfiles.length} nhân sự</span>
      </form>

      <div className="personnel-grid">
        {pageProfiles.map((profile) => {
          const assigned = rolesByUser.get(profile.id) ?? new Set<string>();
          const assignedScopes =
            scopesByUser.get(profile.id) ?? new Set<string>();
          const emailScopes =
            emailScopesByUser.get(profile.id) ?? new Set<string>();
          return (
            <article className="person-card" key={profile.id}>
              <div className="person-heading">
                <span
                  className="person-avatar initials-avatar"
                  aria-hidden="true"
                >
                  {getNameInitials(profile.full_name)}
                </span>
                <div>
                  <strong>{profile.full_name}</strong>
                  <small>{profile.email}</small>
                  {profile.title ? <small>{profile.title}</small> : null}
                </div>
                <span
                  className={`status-pill ${profile.is_active ? "is-active" : ""}`}
                >
                  {profile.is_active ? "Active" : "Đã khóa"}
                </span>
              </div>
              <details className="person-edit">
                <summary>Sửa thông tin</summary>
                <form action={updatePersonnel}>
                  <input type="hidden" name="id" value={profile.id} />
                  <label>
                    Họ và tên
                    <input
                      name="full_name"
                      defaultValue={profile.full_name}
                      required
                    />
                  </label>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={profile.email}
                      required
                    />
                  </label>
                  <label>
                    Số điện thoại
                    <input name="phone" defaultValue={profile.phone ?? ""} />
                  </label>
                  <label>
                    Chức danh
                    <input name="title" defaultValue={profile.title ?? ""} />
                  </label>
                  <button className="button button-primary">
                    Lưu thay đổi
                  </button>
                </form>
              </details>
              <div className="role-checks">
                {(
                  Object.keys(roleLabels) as Array<keyof typeof roleLabels>
                ).map((role) => {
                  const enabled = assigned.has(role);
                  const lockedSelfAdmin =
                    profile.id === userId &&
                    (role === "admin" || role === "viewer");
                  return (
                    <form action={updateUserRole} key={role}>
                      <input type="hidden" name="user_id" value={profile.id} />
                      <input type="hidden" name="role" value={role} />
                      <input
                        type="hidden"
                        name="enabled"
                        value={String(!enabled)}
                      />
                      <button
                        className={enabled ? "role-chip selected" : "role-chip"}
                        disabled={lockedSelfAdmin}
                        title={
                          lockedSelfAdmin
                            ? "Không thể tự đổi tài khoản quản trị sang quyền chỉ đọc"
                            : undefined
                        }
                      >
                        {roleLabels[role]}
                      </button>
                    </form>
                  );
                })}
              </div>
              <form action={updatePersonnelScope} className="person-scope-form">
                <input type="hidden" name="profile_id" value={profile.id} />
                <fieldset>
                  <legend>Loại phòng được phân công</legend>
                  {(roomTypes ?? []).map((roomType) => (
                    <div className="person-room-scope" key={roomType.id}>
                      <label className="check-label">
                        <input
                          name="room_type_ids"
                          type="checkbox"
                          value={roomType.id}
                          defaultChecked={assignedScopes.has(roomType.id)}
                        />
                        {roomType.name}
                      </label>
                      <label className="check-label">
                        <input
                          name="email_room_type_ids"
                          type="checkbox"
                          value={roomType.id}
                          defaultChecked={emailScopes.has(roomType.id)}
                        />
                        Nhận email thông báo (Người xem)
                      </label>
                    </div>
                  ))}
                </fieldset>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="allow_basic_medical_access"
                    value="true"
                    defaultChecked={profile.allow_basic_medical_access}
                  />
                  Cho phép tạo lịch Y cơ sở (Giảng viên/Trợ giảng)
                </label>
                <button className="button button-secondary">Lưu phạm vi</button>
              </form>
              <form action={toggleProfile}>
                <input type="hidden" name="id" value={profile.id} />
                <input
                  type="hidden"
                  name="active"
                  value={String(!profile.is_active)}
                />
                <button
                  className="table-action"
                  disabled={profile.id === userId && profile.is_active}
                >
                  {profile.is_active ? "Khóa tài khoản" : "Kích hoạt tài khoản"}
                </button>
              </form>
            </article>
          );
        })}
      </div>
      {!filteredProfiles.length ? (
        <p className="panel-empty">Không tìm thấy nhân sự phù hợp.</p>
      ) : null}
      <PaginationLinks
        currentPage={currentPage}
        totalItems={filteredProfiles.length}
        pathname="/admin/personnel"
        query={{ q: query.q, role: query.role, status: query.status }}
      />
    </AdminShell>
  );
}
