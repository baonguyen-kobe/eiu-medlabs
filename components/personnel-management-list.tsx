"use client";

import { useMemo, useState, useTransition } from "react";
import {
  savePersonnelChanges,
  type SavePersonnelResult,
} from "@/app/admin/actions";
import { getNameInitials } from "@/lib/person-name";
import type { AppRole } from "@/lib/viewer";

export type PersonnelListItem = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  can_import_schedules: boolean;
  allow_basic_medical_access: boolean;
  access_version: number;
  roles: AppRole[];
  room_type_ids: string[];
  email_room_type_ids: string[];
};

type RoomType = { id: string; name: string; code: string };

const roleLabels: Record<AppRole, string> = {
  admin: "Quản trị viên",
  staff: "Chuyên viên",
  lecturer: "Giảng viên",
  teaching_assistant: "Trợ giảng",
  viewer: "Người xem",
};

function clone(item: PersonnelListItem): PersonnelListItem {
  return {
    ...item,
    roles: [...item.roles],
    room_type_ids: [...item.room_type_ids],
    email_room_type_ids: [...item.email_room_type_ids],
  };
}

export function PersonnelManagementList({
  initialItems,
  roomTypes,
  viewerId,
}: {
  initialItems: PersonnelListItem[];
  roomTypes: RoomType[];
  viewerId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [original, setOriginal] = useState<PersonnelListItem | null>(null);
  const [draft, setDraft] = useState<PersonnelListItem | null>(null);
  const [result, setResult] = useState<SavePersonnelResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = useMemo(
    () =>
      Boolean(
        original && draft && JSON.stringify(original) !== JSON.stringify(draft),
      ),
    [draft, original],
  );

  function open(item: PersonnelListItem) {
    setOriginal(clone(item));
    setDraft(clone(item));
    setResult(null);
  }

  function close() {
    if (pending) return;
    if (
      dirty &&
      !window.confirm("Bạn có thay đổi chưa lưu. Đóng mà không lưu?")
    )
      return;
    setOriginal(null);
    setDraft(null);
    setResult(null);
  }

  function toggleRole(role: AppRole) {
    if (!draft) return;
    if (role === "viewer") {
      const selecting = !draft.roles.includes("viewer");
      setDraft({
        ...draft,
        roles: selecting ? ["viewer"] : [],
        can_import_schedules: selecting ? false : draft.can_import_schedules,
        allow_basic_medical_access: selecting
          ? false
          : draft.allow_basic_medical_access,
      });
      return;
    }
    const next = draft.roles.includes(role)
      ? draft.roles.filter((value) => value !== role)
      : [...draft.roles.filter((value) => value !== "viewer"), role];
    const canImportRole = next.some((value) =>
      ["staff", "lecturer", "teaching_assistant"].includes(value),
    );
    setDraft({
      ...draft,
      roles: next,
      email_room_type_ids: [],
      can_import_schedules: canImportRole ? draft.can_import_schedules : false,
    });
  }

  function submit() {
    if (!draft || pending) return;
    if (!draft.is_active && original?.is_active) {
      if (
        !window.confirm(
          `Khóa tài khoản ${draft.full_name}?\n\nNgười dùng sẽ không thể đăng nhập, nhưng dữ liệu và lịch sử hoạt động vẫn được giữ lại.`,
        )
      )
        return;
    }
    const formData = new FormData();
    formData.set("id", draft.id);
    formData.set("email", draft.email);
    formData.set("full_name", draft.full_name);
    formData.set("phone", draft.phone ?? "");
    formData.set("title", draft.title ?? "");
    formData.set("access_version", String(draft.access_version));
    formData.set("can_import_schedules", String(draft.can_import_schedules));
    formData.set(
      "allow_basic_medical_access",
      String(draft.allow_basic_medical_access),
    );
    formData.set("is_active", String(draft.is_active));
    draft.roles.forEach((role) => formData.append("roles", role));
    draft.room_type_ids.forEach((id) => formData.append("room_type_ids", id));
    draft.email_room_type_ids.forEach((id) =>
      formData.append("email_room_type_ids", id),
    );
    startTransition(async () => {
      const response = await savePersonnelChanges(formData);
      setResult(response);
      if (!response.ok || !response.personnel) return;
      const saved = response.personnel as unknown as PersonnelListItem;
      setItems((current) =>
        current.map((item) => (item.id === saved.id ? clone(saved) : item)),
      );
      setOriginal(clone(saved));
      setDraft(clone(saved));
    });
  }

  return (
    <>
      <div className="personnel-table-wrap">
        <table className="personnel-table">
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th>Vai trò</th>
              <th>Quyền bổ sung</th>
              <th>Phạm vi</th>
              <th>Trạng thái</th>
              <th aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="personnel-identity">
                    <span
                      className="person-avatar initials-avatar"
                      aria-hidden="true"
                    >
                      {getNameInitials(item.full_name)}
                    </span>
                    <span>
                      <strong>{item.full_name}</strong>
                      <small>{item.email}</small>
                      {item.title ? <small>{item.title}</small> : null}
                    </span>
                  </span>
                </td>
                <td>
                  <span className="personnel-badges">
                    {item.roles.map((role) => (
                      <span className="role-chip selected" key={role}>
                        {roleLabels[role]}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  {item.can_import_schedules ? (
                    <span className="permission-badge">Nhập lịch</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className="personnel-badges">
                    {roomTypes
                      .filter((roomType) =>
                        item.room_type_ids.includes(roomType.id),
                      )
                      .map((roomType) => (
                        <span className="scope-badge" key={roomType.id}>
                          {roomType.name}
                        </span>
                      ))}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-pill ${item.is_active ? "is-active" : ""}`}
                  >
                    {item.is_active ? "Hoạt động" : "Đã khóa"}
                  </span>
                </td>
                <td>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => open(item)}
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div
          className="personnel-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && close()
          }
        >
          <section
            className="personnel-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="personnel-drawer-title"
          >
            <header>
              <div>
                <h2 id="personnel-drawer-title">Chỉnh sửa nhân sự</h2>
                <p>{draft.email}</p>
              </div>
              <button
                aria-label="Đóng"
                className="button button-secondary"
                type="button"
                onClick={close}
                disabled={pending}
              >
                ×
              </button>
            </header>
            <div className="personnel-drawer-body">
              {result ? (
                <p
                  className={`action-feedback ${result.ok ? "success" : "error"}`}
                  role="status"
                >
                  {result.message}
                </p>
              ) : null}
              <fieldset disabled={pending}>
                <legend>Thông tin cơ bản</legend>
                <label>
                  Họ và tên
                  <input
                    value={draft.full_name}
                    onChange={(event) =>
                      setDraft({ ...draft, full_name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Email đăng nhập
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) =>
                      setDraft({ ...draft, email: event.target.value })
                    }
                  />
                </label>
                <p className="field-note">
                  Thay đổi email sẽ thay đổi tên đăng nhập của người dùng.
                </p>
                <label>
                  Số điện thoại
                  <input
                    value={draft.phone ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, phone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Chức danh
                  <input
                    value={draft.title ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
              </fieldset>

              <fieldset disabled={pending}>
                <legend>Vai trò chính</legend>
                {(Object.keys(roleLabels) as AppRole[]).map((role) => (
                  <label className="check-label" key={role}>
                    <input
                      type="checkbox"
                      checked={draft.roles.includes(role)}
                      onChange={() => toggleRole(role)}
                      disabled={draft.id === viewerId && role === "admin"}
                    />
                    {roleLabels[role]}
                  </label>
                ))}
                {draft.roles.includes("viewer") ? (
                  <p className="field-note">
                    Người xem chỉ có quyền đọc và không thể kết hợp với vai trò
                    khác.
                  </p>
                ) : null}
              </fieldset>

              <fieldset disabled={pending}>
                <legend>Quyền bổ sung</legend>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={draft.can_import_schedules}
                    disabled={
                      !draft.roles.some((role) =>
                        ["staff", "lecturer", "teaching_assistant"].includes(
                          role,
                        ),
                      )
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        can_import_schedules: event.target.checked,
                      })
                    }
                  />
                  Cho phép nhập lịch
                </label>
                {!draft.roles.some((role) =>
                  ["staff", "lecturer", "teaching_assistant"].includes(role),
                ) ? (
                  <p className="field-note">
                    Quyền nhập lịch chỉ áp dụng cho Chuyên viên, Giảng viên hoặc
                    Trợ giảng.
                  </p>
                ) : null}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={draft.allow_basic_medical_access}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        allow_basic_medical_access: event.target.checked,
                      })
                    }
                  />
                  Cho phép tạo lịch Y cơ sở
                </label>
              </fieldset>

              <fieldset disabled={pending}>
                <legend>Phạm vi phụ trách</legend>
                {roomTypes.map((roomType) => {
                  const assigned = draft.room_type_ids.includes(roomType.id);
                  return (
                    <div className="person-room-scope" key={roomType.id}>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              room_type_ids: event.target.checked
                                ? [...draft.room_type_ids, roomType.id]
                                : draft.room_type_ids.filter(
                                    (id) => id !== roomType.id,
                                  ),
                              email_room_type_ids: event.target.checked
                                ? draft.email_room_type_ids
                                : draft.email_room_type_ids.filter(
                                    (id) => id !== roomType.id,
                                  ),
                            })
                          }
                        />
                        {roomType.name}
                      </label>
                      {draft.roles.includes("viewer") && assigned ? (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={draft.email_room_type_ids.includes(
                              roomType.id,
                            )}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                email_room_type_ids: event.target.checked
                                  ? [...draft.email_room_type_ids, roomType.id]
                                  : draft.email_room_type_ids.filter(
                                      (id) => id !== roomType.id,
                                    ),
                              })
                            }
                          />
                          Nhận email lịch của loại phòng này
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>

              <fieldset disabled={pending}>
                <legend>Trạng thái</legend>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    disabled={draft.id === viewerId && draft.is_active}
                    onChange={(event) =>
                      setDraft({ ...draft, is_active: event.target.checked })
                    }
                  />
                  Đang hoạt động
                </label>
              </fieldset>
            </div>
            <footer>
              <span>
                {dirty ? "Có thay đổi chưa lưu" : result?.ok ? "Đã lưu" : ""}
              </span>
              <button
                className="button button-secondary"
                type="button"
                onClick={close}
                disabled={pending}
              >
                Hủy
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={submit}
                disabled={
                  pending ||
                  !dirty ||
                  draft.roles.length === 0 ||
                  draft.room_type_ids.length === 0
                }
              >
                {pending ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
