"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
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
import { PaginationControls } from "@/components/pagination-controls";
import { Search } from "@/components/icons";
import { SearchableCombobox } from "@/components/searchable-combobox";
import type {
  BasicMedicalConditionLogItem,
  BasicMedicalEquipmentCatalogItem,
  BasicMedicalRoomInventoryItem,
} from "@/lib/basic-medical-equipment";
import { TABLE_PAGE_SIZE, totalPagesFor } from "@/lib/pagination";

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

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d");
}

function includesQuery(values: unknown[], query: string) {
  const normalized = normalize(query.trim());
  return (
    !normalized || values.some((value) => normalize(value).includes(normalized))
  );
}

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
          rooms={rooms}
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
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<
    "item_name" | "commercial_name" | "item_type" | "unit"
  >("item_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<
    Record<string, BasicMedicalEquipmentCatalogItem>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(
    () =>
      catalog
        .filter((item) =>
          includesQuery(
            [
              item.item_name,
              item.commercial_name,
              item.item_type,
              item.country_of_origin,
              item.manufacturer,
              item.model,
              item.unit,
            ],
            deferredQuery,
          ),
        )
        .filter(
          (item) =>
            !statusFilter ||
            (statusFilter === "active" ? item.is_active : !item.is_active),
        )
        .toSorted((left, right) => {
          const compared = String(left[sortKey] ?? "").localeCompare(
            String(right[sortKey] ?? ""),
            "vi",
            { numeric: true, sensitivity: "base" },
          );
          return sortDirection === "asc" ? compared : -compared;
        }),
    [catalog, deferredQuery, sortDirection, sortKey, statusFilter],
  );
  const safePage = Math.min(
    page,
    totalPagesFor(visible.length, TABLE_PAGE_SIZE),
  );
  const pageRows = visible.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );

  function sort(key: typeof sortKey) {
    setPage(1);
    if (sortKey === key)
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

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
          <label className="data-search equipment-catalog-search">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Tìm danh mục thiết bị Y cơ sở"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm thiết bị, tên thương mại, loại, hãng, model…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <select
            aria-label="Lọc trạng thái danh mục"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang sử dụng</option>
            <option value="inactive">Ngừng sử dụng</option>
          </select>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setQuery("");
              setStatusFilter("");
              setPage(1);
            }}
          >
            Xóa bộ lọc
          </button>
          <span className="equipment-catalog-count">
            {visible.length}/{catalog.length} thiết bị
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
                        pageRows.length > 0 &&
                        pageRows.every((row) => selected.has(row.id))
                      }
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          pageRows.forEach((row) =>
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
                <SortHead
                  label="Tên thiết bị và vật tư"
                  active={sortKey === "item_name"}
                  direction={sortDirection}
                  onClick={() => sort("item_name")}
                />
                <SortHead
                  label="Tên thương mại"
                  active={sortKey === "commercial_name"}
                  direction={sortDirection}
                  onClick={() => sort("commercial_name")}
                />
                <SortHead
                  label="Loại"
                  active={sortKey === "item_type"}
                  direction={sortDirection}
                  onClick={() => sort("item_type")}
                />
                <th>Nước SX</th>
                <th>Hãng</th>
                <th>Model</th>
                <SortHead
                  label="ĐVT"
                  active={sortKey === "unit"}
                  direction={sortDirection}
                  onClick={() => sort("unit")}
                />
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((item) => {
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
        {!visible.length ? (
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
        <PaginationControls
          currentPage={safePage}
          totalItems={visible.length}
          onPageChange={setPage}
        />
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
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [roomFilter, setRoomFilter] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const inventoryRows = inventories.filter(
    (item) =>
      (!roomFilter || item.room_id === roomFilter) &&
      includesQuery(
        [
          item.catalog?.item_name,
          item.catalog?.commercial_name,
          item.catalog?.item_type,
          item.room?.room_code,
          item.room?.building_code,
          item.room?.room_name,
        ],
        deferredQuery,
      ),
  );
  const safePage = Math.min(
    page,
    totalPagesFor(inventoryRows.length, TABLE_PAGE_SIZE),
  );
  const pageRows = inventoryRows.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );

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
          <label className="basic-medical-room-search-field">
            <span>Tìm kiếm</span>
            <span className="data-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Tìm thiết bị, tên thương mại, phòng…"
                autoComplete="off"
                spellCheck={false}
              />
            </span>
          </label>
          <label>
            <span>Phòng</span>
            <select
              aria-label="Lọc thiết bị theo phòng"
              value={roomFilter}
              onChange={(event) => {
                setRoomFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả phòng</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {roomLabel(room)}
                </option>
              ))}
            </select>
          </label>
          <span className="equipment-catalog-count">
            {inventoryRows.length}/{inventories.length} thiết bị trong phòng
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
              {pageRows.map((item) => (
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
                          const total = Number(
                            prompt(
                              "Tổng số lượng",
                              String(item.total_quantity),
                            ),
                          );
                          const damaged = Number(
                            prompt(
                              "Số lượng Hư",
                              String(item.damaged_quantity),
                            ),
                          );
                          if (
                            Number.isInteger(total) &&
                            Number.isInteger(damaged)
                          )
                            run(() =>
                              saveBasicMedicalRoomInventory({
                                inventoryId: item.id,
                                roomId: item.room_id,
                                catalogItemId: item.catalog_item_id,
                                totalQuantity: total,
                                damagedQuantity: damaged,
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
        {!inventoryRows.length ? (
          <p className="panel-empty">
            Chưa có thiết bị được phân bổ cho phòng phù hợp.
          </p>
        ) : null}
        <PaginationControls
          currentPage={safePage}
          totalItems={inventoryRows.length}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}

function SortHead({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th>
      <button type="button" className="table-sort-button" onClick={onClick}>
        {label} {active ? (direction === "asc" ? "A–Z" : "Z–A") : "↕"}
      </button>
    </th>
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
  rooms,
  canManage,
}: {
  inventories: BasicMedicalRoomInventoryItem[];
  rooms: Room[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [room, setRoom] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const rows = inventories
    .filter(
      (item) =>
        (!room || item.room_id === room) &&
        includesQuery(
          [
            item.catalog?.item_name,
            item.catalog?.commercial_name,
            item.room?.room_code,
            item.last_damage_reporter?.full_name,
          ],
          deferredQuery,
        ),
    )
    .toSorted((a, b) =>
      String(b.last_damage_reported_at).localeCompare(
        String(a.last_damage_reported_at),
      ),
    );
  const safePage = Math.min(page, totalPagesFor(rows.length, TABLE_PAGE_SIZE));
  const pageRows = rows.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );
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
        <label className="data-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Tìm thiết bị hư Y cơ sở"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm thiết bị, phòng, người báo hư…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <select
          aria-label="Lọc thiết bị hư theo phòng"
          value={room}
          onChange={(event) => {
            setRoom(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả phòng</option>
          {rooms.map((item) => (
            <option key={item.id} value={item.id}>
              {roomLabel(item)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setQuery("");
            setRoom("");
            setPage(1);
          }}
        >
          Xóa bộ lọc
        </button>
        <span className="equipment-catalog-count">
          {rows.length} thiết bị hư
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
            {pageRows.map((item) => (
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
      {!rows.length ? (
        <p className="panel-empty">Không có thiết bị đang được báo Hư.</p>
      ) : null}
      <PaginationControls
        currentPage={safePage}
        totalItems={rows.length}
        onPageChange={setPage}
      />
    </section>
  );
}

function LogsTab({ logs }: { logs: BasicMedicalConditionLogItem[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const rows = logs.filter(
    (item) =>
      (!type || item.event_type === type) &&
      includesQuery(
        [
          item.inventory?.catalog?.item_name,
          item.inventory?.room?.room_code,
          item.actor?.full_name,
          item.note,
        ],
        deferredQuery,
      ),
  );
  const safePage = Math.min(page, totalPagesFor(rows.length, TABLE_PAGE_SIZE));
  const pageRows = rows.slice(
    (safePage - 1) * TABLE_PAGE_SIZE,
    safePage * TABLE_PAGE_SIZE,
  );
  return (
    <section className="data-panel basic-medical-list-panel">
      <div className="basic-medical-list-filters">
        <label className="data-search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Tìm log thiết bị Y cơ sở"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Tìm thiết bị, phòng, người thay đổi, ghi chú…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <select
          aria-label="Lọc loại thay đổi thiết bị"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả thay đổi</option>
          <option value="damage_report">Báo Hư</option>
          <option value="condition_adjustment">Điều chỉnh Tốt/Hư</option>
          <option value="stock_adjustment">Điều chỉnh tồn kho</option>
        </select>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setQuery("");
            setType("");
            setPage(1);
          }}
        >
          Xóa bộ lọc
        </button>
        <span className="equipment-catalog-count">{rows.length} thay đổi</span>
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
            {pageRows.map((item) => (
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
      {!rows.length ? (
        <p className="panel-empty">Chưa có lịch sử thay đổi phù hợp.</p>
      ) : null}
      <PaginationControls
        currentPage={safePage}
        totalItems={rows.length}
        onPageChange={setPage}
      />
    </section>
  );
}
