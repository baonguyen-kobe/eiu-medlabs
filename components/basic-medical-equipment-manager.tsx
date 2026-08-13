"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustBasicMedicalInventoryCondition,
  deleteBasicMedicalCatalogItems,
  saveBasicMedicalRoomInventory,
  searchBasicMedicalCatalogCandidates,
  setBasicMedicalCatalogActive,
  updateBasicMedicalCatalogItems,
  type BasicMedicalCatalogInput,
} from "@/app/basic-medical/equipment/actions";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type {
  BasicMedicalConditionLogItem,
  BasicMedicalEquipmentCatalogItem,
  BasicMedicalRoomInventoryItem,
} from "@/lib/basic-medical-equipment";
import { parseBasicMedicalInventoryQuantityEdit } from "@/lib/basic-medical-inventory-edit.mjs";

type Tab = "inventory" | "rooms" | "damaged" | "logs";
type Room = {
  id: string;
  room_code: string;
  building_code: string;
  room_name: string | null;
};
type Notice = { ok: boolean; message: string } | null;

const logDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const conditionEventLabels = {
  damage_report: "Báo Hư",
  condition_adjustment: "Điều chỉnh Tốt/Hư",
  stock_adjustment: "Điều chỉnh tồn kho",
} as const;

function roomLabel(
  room?: Pick<Room, "room_code" | "building_code" | "room_name"> | null,
) {
  return room
    ? `${room.room_code}.${room.building_code}${room.room_name ? ` · ${room.room_name}` : ""}`
    : "—";
}

export function BasicMedicalEquipmentManager({
  activeTab,
  catalog,
  inventories,
  rooms,
  logs,
  canManage,
}: {
  activeTab: Tab;
  catalog: BasicMedicalEquipmentCatalogItem[];
  inventories: BasicMedicalRoomInventoryItem[];
  rooms: Room[];
  logs: BasicMedicalConditionLogItem[];
  canManage: boolean;
}) {
  return (
    <>
      {activeTab === "inventory" ? (
        <InventoryTab catalog={catalog} canManage={canManage} />
      ) : null}
      {activeTab === "rooms" ? (
        <RoomInventoryTab
          catalog={catalog}
          inventories={inventories}
          rooms={rooms}
          canManage={canManage}
        />
      ) : null}
      {activeTab === "damaged" ? (
        <DamagedTab
          inventories={inventories.filter((item) => item.damaged_quantity > 0)}
          canManage={canManage}
        />
      ) : null}
      {activeTab === "logs" ? <LogsTab logs={logs} /> : null}
    </>
  );
}

function InventoryTab({
  catalog: initialCatalog,
  canManage,
}: {
  catalog: BasicMedicalEquipmentCatalogItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initialCatalog);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, BasicMedicalEquipmentCatalogItem>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; message: string }>,
    after?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="basic-medical-equipment-content">
      {notice ? (
        <p
          className={
            notice.ok ? "action-feedback success" : "action-feedback error"
          }
        >
          {notice.message}
        </p>
      ) : null}
      <section className="data-panel equipment-catalog-panel basic-medical-catalog-panel">
        <div className="equipment-catalog-filters basic-medical-catalog-filters">
          <span className="equipment-catalog-count">
            {catalog.length} thiết bị
          </span>
        </div>
        {canManage ? (
          <div className="equipment-catalog-toolbar">
            <div className="equipment-catalog-mode-buttons">
              <button
                className={`button equipment-catalog-edit${editing ? " active" : ""}`}
                type="button"
                disabled={isPending}
                onClick={() => {
                  setEditing((value) => !value);
                  setDrafts(
                    Object.fromEntries(
                      catalog.map((item) => [item.id, { ...item }]),
                    ),
                  );
                  setSelected(new Set());
                }}
              >
                Sửa
              </button>
              <button
                className="button equipment-catalog-disable"
                type="button"
                disabled={!selected.size || isPending}
                onClick={() =>
                  run(
                    () => setBasicMedicalCatalogActive([...selected], false),
                    () =>
                      setCatalog((rows) =>
                        rows.map((row) =>
                          selected.has(row.id)
                            ? { ...row, is_active: false }
                            : row,
                        ),
                      ),
                  )
                }
              >
                Ngừng sử dụng
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={!selected.size || isPending}
                onClick={() =>
                  run(
                    () => setBasicMedicalCatalogActive([...selected], true),
                    () =>
                      setCatalog((rows) =>
                        rows.map((row) =>
                          selected.has(row.id)
                            ? { ...row, is_active: true }
                            : row,
                        ),
                      ),
                  )
                }
              >
                Kích hoạt
              </button>
              <button
                className="button equipment-catalog-delete"
                type="button"
                disabled={!selected.size || isPending}
                onClick={() =>
                  run(
                    () => deleteBasicMedicalCatalogItems([...selected]),
                    () =>
                      setCatalog((rows) =>
                        rows.filter((row) => !selected.has(row.id)),
                      ),
                  )
                }
              >
                Xóa
              </button>
            </div>
          </div>
        ) : null}
        <div className="responsive-table equipment-catalog-table-wrap">
          <table className="data-table basic-medical-catalog-table">
            <thead>
              <tr>
                {canManage ? (
                  <th aria-label="Chọn">
                    <input
                      aria-label="Chọn tất cả thiết bị trên trang"
                      type="checkbox"
                      checked={
                        catalog.length > 0 &&
                        catalog.every((row) => selected.has(row.id))
                      }
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          catalog.forEach((row) =>
                            event.target.checked
                              ? next.add(row.id)
                              : next.delete(row.id),
                          );
                          return next;
                        })
                      }
                    />
                  </th>
                ) : null}
                <th>Tên thiết bị và vật tư</th>
                <th>Tên thương mại</th>
                <th>Loại</th>
                <th>Nước SX</th>
                <th>Hãng</th>
                <th>Model</th>
                <th>ĐVT</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((item) => {
                const draft = drafts[item.id] ?? item;
                return (
                  <tr key={item.id}>
                    {canManage ? (
                      <td>
                        <input
                          aria-label={`Chọn ${item.item_name}`}
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                        />
                      </td>
                    ) : null}
                    {(
                      [
                        "item_name",
                        "commercial_name",
                        "item_type",
                        "country_of_origin",
                        "manufacturer",
                        "model",
                        "unit",
                      ] as const
                    ).map((key) => (
                      <td key={key}>
                        {editing ? (
                          <input
                            aria-label={`${key} của ${item.item_name}`}
                            value={draft[key] ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: {
                                  ...draft,
                                  [key]: event.target.value,
                                },
                              }))
                            }
                          />
                        ) : (
                          item[key] || "—"
                        )}
                      </td>
                    ))}
                    <td>
                      <span
                        className={`request-status request-status-${item.is_active ? "green" : "gray"}`}
                      >
                        {item.is_active ? "Đang sử dụng" : "Ngừng sử dụng"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!catalog.length ? (
          <p className="panel-empty">
            Không có thiết bị phù hợp với bộ lọc hiện tại.
          </p>
        ) : null}
        {editing ? (
          <div className="form-actions">
            <button
              className="button button-primary"
              disabled={isPending}
              type="button"
              onClick={() => {
                const changed = catalog
                  .filter(
                    (item) =>
                      JSON.stringify(item) !== JSON.stringify(drafts[item.id]),
                  )
                  .map((item) => drafts[item.id] as BasicMedicalCatalogInput);
                run(
                  () => updateBasicMedicalCatalogItems(changed),
                  () => {
                    setCatalog(Object.values(drafts));
                    setEditing(false);
                  },
                );
              }}
            >
              Lưu chỉnh sửa
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RoomInventoryTab({
  catalog,
  inventories,
  rooms,
  canManage,
}: {
  catalog: BasicMedicalEquipmentCatalogItem[];
  inventories: BasicMedicalRoomInventoryItem[];
  rooms: Room[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="basic-medical-equipment-content">
      {notice ? (
        <p
          className={
            notice.ok ? "action-feedback success" : "action-feedback error"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}
      <section className="data-panel basic-medical-room-inventory-section">
        <header className="panel-heading">
          <div>
            <h2>Thiết bị theo phòng</h2>
            <p>
              Phân bổ số lượng Tổng, Tốt và Hư riêng cho từng phòng Y cơ sở.
            </p>
          </div>
        </header>
        <div className="basic-medical-section-filters">
          <span className="equipment-catalog-count">
            {inventories.length} thiết bị trong phòng
          </span>
        </div>
        {canManage ? (
          <RoomInventoryForm
            rooms={rooms}
            catalog={catalog.filter((item) => item.is_active)}
            onSave={(input) => run(() => saveBasicMedicalRoomInventory(input))}
            pending={isPending}
          />
        ) : null}
        <div className="responsive-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Phòng</th>
                <th>Tên thiết bị</th>
                <th>Tên thương mại</th>
                <th>ĐVT</th>
                <th>Tổng</th>
                <th>Tốt</th>
                <th>Hư</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {inventories.map((item) => (
                <tr key={item.id}>
                  <td>{roomLabel(item.room)}</td>
                  <td>
                    <strong>{item.catalog?.item_name}</strong>
                  </td>
                  <td>{item.catalog?.commercial_name || "—"}</td>
                  <td>{item.catalog?.unit}</td>
                  <td>{item.total_quantity}</td>
                  <td>{item.good_quantity}</td>
                  <td>{item.damaged_quantity}</td>
                  {canManage ? (
                    <td>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => {
                          const totalRaw = prompt(
                            "Tổng số lượng",
                            String(item.total_quantity),
                          );
                          if (totalRaw === null) return;
                          const damagedRaw = prompt(
                            "Số lượng Hư",
                            String(item.damaged_quantity),
                          );
                          if (damagedRaw === null) return;
                          const staged = parseBasicMedicalInventoryQuantityEdit(
                            totalRaw,
                            damagedRaw,
                          );
                          if (
                            !staged.ok ||
                            staged.totalQuantity === undefined ||
                            staged.damagedQuantity === undefined
                          ) {
                            setNotice({
                              ok: false,
                              message:
                                staged.message ?? "Số lượng không hợp lệ.",
                            });
                            return;
                          }
                          run(() =>
                            saveBasicMedicalRoomInventory({
                              inventoryId: item.id,
                              roomId: item.room_id,
                              catalogItemId: item.catalog_item_id,
                              totalQuantity: staged.totalQuantity,
                              damagedQuantity: staged.damagedQuantity,
                              note: "Cập nhật tại danh sách thiết bị Y cơ sở",
                            }),
                          );
                        }}
                      >
                        Sửa số lượng
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!inventories.length ? (
          <p className="panel-empty">
            Chưa có thiết bị được phân bổ cho phòng phù hợp.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function RoomInventoryForm({
  rooms,
  catalog,
  onSave,
  pending,
}: {
  rooms: Room[];
  catalog: BasicMedicalEquipmentCatalogItem[];
  onSave: (input: {
    roomId: string;
    catalogItemId: string;
    totalQuantity: number;
    damagedQuantity: number;
    note?: string;
  }) => void;
  pending: boolean;
}) {
  const [roomId, setRoomId] = useState("");
  const [catalogItemId, setCatalogItemId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState(catalog.slice(0, 30));
  const [total, setTotal] = useState(0);
  const [damaged, setDamaged] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const rows = await searchBasicMedicalCatalogCandidates(candidateQuery);
        setCandidates(rows as BasicMedicalEquipmentCatalogItem[]);
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [candidateQuery]);
  return (
    <div className="basic-medical-inventory-form">
      <div className="basic-medical-inventory-form-heading">
        <strong>Phân bổ thiết bị vào phòng</strong>
        <span>Nhập tổng số lượng và số lượng đang hư.</span>
      </div>
      <label>
        <span>Phòng *</span>
        <select
          aria-label="Chọn phòng phân bổ thiết bị"
          value={roomId}
          onChange={(event) => setRoomId(event.target.value)}
        >
          <option value="">Chọn phòng</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {roomLabel(room)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Thiết bị *</span>
        <SearchableCombobox
          ariaLabel="Chọn thiết bị phân bổ vào phòng"
          value={catalogItemId}
          onChange={setCatalogItemId}
          onQueryChange={setCandidateQuery}
          placeholder="Gõ để tìm trong toàn bộ danh mục…"
          emptyLabel="Chọn thiết bị"
          options={candidates.map((item) => ({
            value: item.id,
            label: `${item.item_name}${item.commercial_name ? ` · ${item.commercial_name}` : ""}`,
            keywords: [item.item_type, item.manufacturer, item.model]
              .filter(Boolean)
              .join(" "),
          }))}
        />
      </label>
      <label>
        <span>Tổng số lượng *</span>
        <input
          aria-label="Tổng số lượng"
          type="number"
          min="0"
          value={total}
          onChange={(event) => {
            const value = event.target.value;
            setTotal(value ? Number(value) : 0);
          }}
        />
      </label>
      <label>
        <span>Số lượng hư *</span>
        <input
          aria-label="Số lượng Hư"
          type="number"
          min="0"
          max={total}
          value={damaged}
          onChange={(event) => {
            const value = event.target.value;
            setDamaged(value ? Number(value) : 0);
          }}
        />
      </label>
      <button
        className="button button-primary"
        type="button"
        disabled={pending || !roomId || !catalogItemId || damaged > total}
        onClick={() =>
          onSave({
            roomId,
            catalogItemId,
            totalQuantity: total,
            damagedQuantity: damaged,
            note: "Phân bổ thiết bị vào phòng",
          })
        }
      >
        Thêm vào phòng
      </button>
    </div>
  );
}

function DamagedTab({
  inventories,
  canManage,
}: {
  inventories: BasicMedicalRoomInventoryItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  function adjust(item: BasicMedicalRoomInventoryItem) {
    const good = Number(prompt("Số lượng Tốt", String(item.good_quantity)));
    const damaged = Number(
      prompt("Số lượng Hư", String(item.damaged_quantity)),
    );
    const note = prompt("Lý do điều chỉnh")?.trim() ?? "";
    if (
      !Number.isInteger(good) ||
      !Number.isInteger(damaged) ||
      good < 0 ||
      damaged < 0
    )
      return;
    startTransition(async () => {
      const result = await adjustBasicMedicalInventoryCondition({
        inventoryId: item.id,
        goodQuantity: good,
        damagedQuantity: damaged,
        note,
      });
      setNotice(result);
      if (result.ok) router.refresh();
    });
  }
  return (
    <section className="data-panel basic-medical-list-panel">
      {notice ? (
        <p
          className={
            notice.ok ? "action-feedback success" : "action-feedback error"
          }
        >
          {notice.message}
        </p>
      ) : null}
      <div className="basic-medical-list-filters">
        <span className="equipment-catalog-count">
          {inventories.length} thiết bị hư
        </span>
      </div>
      <div className="responsive-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tên thiết bị</th>
              <th>Phòng</th>
              <th>ĐVT</th>
              <th>Số lượng Tốt</th>
              <th>Số lượng Hư</th>
              <th>Người báo hư</th>
              <th>Ngày báo hư gần nhất</th>
              {canManage ? <th>Điều chỉnh</th> : null}
            </tr>
          </thead>
          <tbody>
            {inventories.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.catalog?.item_name}</strong>
                  <br />
                  <small>{item.catalog?.commercial_name}</small>
                </td>
                <td>{roomLabel(item.room)}</td>
                <td>{item.catalog?.unit}</td>
                <td>{item.good_quantity}</td>
                <td>
                  <strong>{item.damaged_quantity}</strong>
                </td>
                <td>{item.last_damage_reporter?.full_name || "—"}</td>
                <td>
                  {item.last_damage_reported_at
                    ? logDateTimeFormatter.format(
                        new Date(item.last_damage_reported_at),
                      )
                    : "—"}
                </td>
                {canManage ? (
                  <td>
                    <button
                      className="button button-warning"
                      type="button"
                      disabled={isPending}
                      onClick={() => adjust(item)}
                    >
                      Sửa Tốt/Hư
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!inventories.length ? (
        <p className="panel-empty">Không có thiết bị đang được báo Hư.</p>
      ) : null}
    </section>
  );
}

function LogsTab({ logs }: { logs: BasicMedicalConditionLogItem[] }) {
  return (
    <section className="data-panel basic-medical-list-panel">
      <div className="basic-medical-list-filters">
        <span className="equipment-catalog-count">{logs.length} thay đổi</span>
      </div>
      <div className="responsive-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Loại thay đổi</th>
              <th>Thiết bị</th>
              <th>Phòng</th>
              <th>Trước thay đổi</th>
              <th>Sau thay đổi</th>
              <th>Người thực hiện</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((item) => (
              <tr key={item.id}>
                <td>
                  {logDateTimeFormatter.format(new Date(item.created_at))}
                </td>
                <td>{conditionEventLabels[item.event_type]}</td>
                <td>{item.inventory?.catalog?.item_name}</td>
                <td>{roomLabel(item.inventory?.room)}</td>
                <td>
                  {item.good_before} Tốt · {item.damaged_before} Hư
                </td>
                <td>
                  {item.good_after} Tốt · {item.damaged_after} Hư
                </td>
                <td>{item.actor?.full_name}</td>
                <td>{item.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!logs.length ? (
        <p className="panel-empty">Chưa có lịch sử thay đổi phù hợp.</p>
      ) : null}
    </section>
  );
}
