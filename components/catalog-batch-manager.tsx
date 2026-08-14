"use client";

import { useMemo, useState, useTransition } from "react";
import {
  deleteCourse,
  deleteRoom,
  setCoursesActive,
  setRoomsActive,
  updateCatalogCourse,
  updateCatalogCoursesBatch,
  updateCatalogRoom,
  updateCatalogRoomsBatch,
} from "@/app/admin/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

type RoomType = { id: string; name: string; is_active: boolean };
type CatalogItem = {
  id: string;
  room_code?: string;
  building_code?: string;
  room_name?: string | null;
  course_code?: string;
  course_name?: string;
  room_type_id: string;
  capacity?: number | null;
  is_active: boolean;
  room_types: { name: string } | null;
};

type Draft = {
  code: string;
  building: string;
  name: string;
  capacity: string;
  roomTypeId: string;
};

function toDraft(kind: "rooms" | "courses", item: CatalogItem): Draft {
  return {
    code: kind === "rooms" ? (item.room_code ?? "") : (item.course_code ?? ""),
    building: item.building_code ?? "",
    name: kind === "rooms" ? (item.room_name ?? "") : (item.course_name ?? ""),
    capacity: item.capacity == null ? "" : String(item.capacity),
    roomTypeId: item.room_type_id,
  };
}

export function CatalogBatchManager({
  kind,
  initialItems,
  roomTypes,
}: {
  kind: "rooms" | "courses";
  initialItems: CatalogItem[];
  roomTypes: RoomType[];
}) {
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeConfirmation, setActiveConfirmation] = useState<boolean | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const allSelected = items.length > 0 && selected.length === items.length;
  const editingItems = useMemo(
    () => items.filter((item) => editing.includes(item.id)),
    [editing, items],
  );

  function beginEdit(ids: string[]) {
    const nextItems = items.filter((item) => ids.includes(item.id));
    setEditing(nextItems.map((item) => item.id));
    setDrafts(
      Object.fromEntries(
        nextItems.map((item) => [item.id, toDraft(kind, item)]),
      ),
    );
  }

  function updateDraft(id: string, field: keyof Draft, value: string) {
    setDrafts((valueById) => ({
      ...valueById,
      [id]: { ...valueById[id], [field]: value },
    }));
  }

  function toggle(id: string) {
    setSelected((value) =>
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );
  }

  function applyActive(active: boolean) {
    if (!selected.length || pending) return;
    startTransition(async () => {
      try {
        if (kind === "rooms") await setRoomsActive(selected, active);
        else await setCoursesActive(selected, active);
        setItems((value) =>
          value.map((item) =>
            selected.includes(item.id) ? { ...item, is_active: active } : item,
          ),
        );
        setNotice(
          active
            ? "Đã kích hoạt các mục đã chọn."
            : "Đã ngừng dùng các mục đã chọn.",
        );
        setSelected([]);
      } catch {
        setNotice("Không thể cập nhật danh mục. Dữ liệu không thay đổi.");
      }
    });
  }

  const itemLabel = kind === "rooms" ? "phòng" : "môn học";

  function save() {
    if (!editingItems.length || pending) return;
    startTransition(async () => {
      try {
        if (kind === "rooms") {
          const input = editingItems.map((item) => {
            const draft = drafts[item.id];
            return {
              id: item.id,
              roomCode: draft.code,
              buildingCode: draft.building,
              roomName: draft.name,
              capacity: draft.capacity ? Number(draft.capacity) : null,
              roomTypeId: draft.roomTypeId,
            };
          });
          if (
            input.some(
              (room) =>
                room.capacity !== null &&
                (!Number.isInteger(room.capacity) || room.capacity < 1),
            )
          ) {
            setNotice("Sức chứa phải là số nguyên từ 1 trở lên hoặc để trống.");
            return;
          }
          if (input.length === 1) await updateCatalogRoom(input[0]);
          else await updateCatalogRoomsBatch(input);
        } else {
          const input = editingItems.map((item) => {
            const draft = drafts[item.id];
            return {
              id: item.id,
              courseCode: draft.code,
              courseName: draft.name,
              roomTypeId: draft.roomTypeId,
            };
          });
          if (input.length === 1) await updateCatalogCourse(input[0]);
          else await updateCatalogCoursesBatch(input);
        }
        setItems((value) =>
          value.map((item) => {
            const draft = drafts[item.id];
            if (!draft || !editing.includes(item.id)) return item;
            return {
              ...item,
              room_code: kind === "rooms" ? draft.code : item.room_code,
              building_code:
                kind === "rooms" ? draft.building : item.building_code,
              room_name: kind === "rooms" ? draft.name || null : item.room_name,
              course_code: kind === "courses" ? draft.code : item.course_code,
              course_name: kind === "courses" ? draft.name : item.course_name,
              capacity:
                kind === "rooms"
                  ? draft.capacity
                    ? Number(draft.capacity)
                    : null
                  : item.capacity,
              room_type_id: draft.roomTypeId,
              room_types: {
                name:
                  roomTypes.find((type) => type.id === draft.roomTypeId)
                    ?.name ?? "",
              },
            };
          }),
        );
        setEditing([]);
        setDrafts({});
        setNotice("Đã lưu thay đổi.");
      } catch (error) {
        setNotice(
          error instanceof Error &&
            error.message.includes("INVALID_ROOM_CAPACITY")
            ? "Sức chứa phải là số nguyên từ 1 trở lên hoặc để trống."
            : "Không thể lưu. Mọi thay đổi trong lô đã được từ chối an toàn.",
        );
      }
    });
  }

  function remove() {
    const item = deleteTarget;
    if (!item || pending) return;
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("id", item.id);
        if (kind === "rooms") await deleteRoom(formData);
        else await deleteCourse(formData);
        setItems((value) =>
          value.filter((candidate) => candidate.id !== item.id),
        );
        setSelected((value) => value.filter((id) => id !== item.id));
        setDeleteTarget(null);
        setNotice("Đã xóa mục.");
      } catch {
        setNotice("Không thể xóa mục có dữ liệu liên quan.");
      }
    });
  }

  return (
    <div className="data-panel catalog-data-panel">
      <div className="equipment-catalog-toolbar">
        <span>{selected.length} mục được chọn</span>
        <button
          className="button button-secondary"
          type="button"
          disabled={!selected.length || pending}
          onClick={() => setActiveConfirmation(false)}
        >
          Ngừng dùng
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={!selected.length || pending}
          onClick={() => beginEdit(selected)}
        >
          Sửa mục đã chọn
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={!selected.length || pending}
          onClick={() => setActiveConfirmation(true)}
        >
          Kích hoạt
        </button>
      </div>
      {notice ? (
        <p className="action-feedback" role="status">
          {notice}
        </p>
      ) : null}
      <ConfirmDialog
        open={activeConfirmation !== null}
        title={`${activeConfirmation ? "Kích hoạt" : "Ngừng sử dụng"} ${selected.length} ${itemLabel}?`}
        description="Thao tác chỉ áp dụng một lần cho đúng các mục đang chọn."
        tone={activeConfirmation ? "primary" : "danger"}
        pending={pending}
        onCancel={() => setActiveConfirmation(null)}
        onConfirm={() => {
          if (activeConfirmation === null) return;
          applyActive(activeConfirmation);
          setActiveConfirmation(null);
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Xóa ${itemLabel} này?`}
        description="Thao tác chỉ thành công khi không có dữ liệu liên quan."
        tone="danger"
        pending={pending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={remove}
      />
      <div
        className="responsive-table"
        role="region"
        aria-label={
          kind === "rooms"
            ? "Danh mục phòng; vuốt ngang để xem đầy đủ"
            : "Danh mục môn học; vuốt ngang để xem đầy đủ"
        }
        tabIndex={0}
      >
        <table className="data-table catalog-data-table">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="Chọn tất cả mục đang xem"
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? [] : items.map((item) => item.id))
                  }
                />
              </th>
              <th>Mã</th>
              <th>Tên</th>
              <th>Loại</th>
              {kind === "rooms" ? <th>Sức chứa</th> : null}
              <th>Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`Chọn ${kind === "rooms" ? item.room_code : item.course_code}`}
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </td>
                <td className="mono">
                  {kind === "rooms"
                    ? `${item.room_code}.${item.building_code}`
                    : item.course_code}
                </td>
                <td>
                  {kind === "rooms"
                    ? (item.room_name ?? "—")
                    : item.course_name}
                </td>
                <td>{item.room_types?.name ?? "—"}</td>
                {kind === "rooms" ? <td>{item.capacity ?? "—"}</td> : null}
                <td>
                  <span
                    className={`status-pill ${item.is_active ? "is-active" : ""}`}
                  >
                    {item.is_active ? "Đang dùng" : "Ngừng dùng"}
                  </span>
                </td>
                <td className="catalog-row-actions">
                  <button
                    className="table-action"
                    type="button"
                    disabled={pending}
                    onClick={() => beginEdit([item.id])}
                  >
                    Sửa
                  </button>
                  <button
                    className="table-action delete-action"
                    type="button"
                    disabled={pending}
                    onClick={() => setDeleteTarget(item)}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingItems.length ? (
        <form className="admin-create-form" action={save}>
          <p className="field-note">
            {editingItems.length > 1
              ? "Chỉnh sửa từng mục đã chọn; toàn bộ lô được kiểm tra và lưu nguyên tử."
              : "Chỉnh sửa mục đã chọn."}
          </p>
          {editingItems.map((item) => {
            const draft = drafts[item.id];
            return (
              <fieldset key={item.id}>
                <legend>
                  {kind === "rooms"
                    ? `${item.room_code}.${item.building_code}`
                    : item.course_code}
                </legend>
                <label>
                  Mã
                  <input
                    value={draft?.code ?? ""}
                    required
                    onChange={(event) =>
                      updateDraft(item.id, "code", event.target.value)
                    }
                  />
                </label>
                {kind === "rooms" ? (
                  <label>
                    Tòa nhà
                    <input
                      value={draft?.building ?? ""}
                      required
                      onChange={(event) =>
                        updateDraft(item.id, "building", event.target.value)
                      }
                    />
                  </label>
                ) : null}
                <label>
                  Tên
                  <input
                    value={draft?.name ?? ""}
                    required={kind === "courses"}
                    onChange={(event) =>
                      updateDraft(item.id, "name", event.target.value)
                    }
                  />
                </label>
                {kind === "rooms" ? (
                  <label>
                    Sức chứa
                    <input
                      type="number"
                      min="1"
                      value={draft?.capacity ?? ""}
                      onChange={(event) =>
                        updateDraft(item.id, "capacity", event.target.value)
                      }
                    />
                  </label>
                ) : null}
                <label>
                  Loại
                  <select
                    value={draft?.roomTypeId ?? ""}
                    onChange={(event) =>
                      updateDraft(item.id, "roomTypeId", event.target.value)
                    }
                  >
                    {roomTypes
                      .filter((type) => type.is_active)
                      .map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                  </select>
                </label>
              </fieldset>
            );
          })}
          <button className="button button-primary" disabled={pending}>
            Lưu
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={pending}
            onClick={() => {
              setEditing([]);
              setDrafts({});
            }}
          >
            Hủy
          </button>
        </form>
      ) : null}
    </div>
  );
}
