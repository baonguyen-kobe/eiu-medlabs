import { AdminShell } from "@/components/admin-shell";
import {
  createRoom,
  createRoomType,
  importRooms,
  toggleRoomType,
} from "@/app/admin/actions";
import { CatalogTabs } from "@/components/catalog-tabs";
import { CatalogImportActions } from "@/components/catalog-import-actions";
import { PaginationLinks } from "@/components/pagination-links";
import { requireAdmin } from "@/lib/admin";
import { normalizePage, paginationRange } from "@/lib/pagination";
import { CatalogBatchManager } from "@/components/catalog-batch-manager";

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; page?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const query = await searchParams;
  const currentPage = normalizePage(query.page);
  const { from, to } = paginationRange(currentPage);
  const [{ data: rooms, count }, { data: roomTypes }] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        "id, room_code, building_code, room_name, room_type_id, capacity, is_active, room_types (name)",
        { count: "exact" },
      )
      .order("building_code")
      .order("room_code")
      .range(from, to),
    supabase
      .from("room_types")
      .select("id, code, name, is_active")
      .order("name"),
  ]);
  return (
    <AdminShell
      title="Danh mục phòng"
      description="Quản lý mã phòng, tòa nhà và sức chứa dùng khi xếp lịch."
      active="/admin/rooms"
      actions={<CatalogImportActions action={importRooms} catalog="rooms" />}
    >
      <CatalogTabs active="/admin/rooms" />
      {query.notice ? (
        <p className="action-feedback success">{query.notice}</p>
      ) : null}
      {query.error ? (
        <p className="action-feedback error">{query.error}</p>
      ) : null}
      <details className="catalog-manual-add">
        <summary>+ Thêm phòng</summary>
        <form
          action={createRoom}
          className="admin-create-form admin-create-room"
        >
          <label>
            Mã phòng
            <input name="room_code" required placeholder="301" />
          </label>
          <label>
            Tòa nhà
            <input name="building_code" required placeholder="A3" />
          </label>
          <label>
            Tên phòng
            <input name="room_name" placeholder="Phòng học 301" />
          </label>
          <label>
            Loại phòng
            <select name="room_type_id" required defaultValue="">
              <option value="" disabled>
                Chọn Loại phòng
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
          <label>
            Sức chứa
            <input name="capacity" type="number" min="1" />
          </label>
          <button className="button button-primary">Thêm phòng</button>
        </form>
      </details>
      <CatalogBatchManager
        kind="rooms"
        initialItems={(rooms ?? []).map((room) => ({
          ...room,
          room_types: room.room_types as unknown as { name: string } | null,
        }))}
        roomTypes={roomTypes ?? []}
      />
      <PaginationLinks
        currentPage={currentPage}
        totalItems={count ?? 0}
        pathname="/admin/rooms"
      />
      <details className="admin-create-personnel room-type-manager">
        <summary>Quản lý Loại phòng</summary>
        <form action={createRoomType} className="admin-create-form">
          <label>
            Tên Loại phòng
            <input name="name" required />
          </label>
          <label>
            Mã kỹ thuật
            <input name="code" required placeholder="basic_medical" />
          </label>
          <button className="button button-primary">Thêm Loại phòng</button>
        </form>
        <div
          className="responsive-table"
          role="region"
          aria-label="Danh sách Loại phòng"
          tabIndex={0}
        >
          <table className="data-table catalog-data-table room-type-data-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Mã</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(roomTypes ?? []).map((roomType) => (
                <tr key={roomType.id}>
                  <td
                    className="room-type-name-cell"
                    data-mobile-label="Tên Loại phòng"
                  >
                    <strong>{roomType.name}</strong>
                  </td>
                  <td
                    className="room-type-code-cell mono"
                    data-mobile-label="Mã"
                  >
                    {roomType.code}
                  </td>
                  <td
                    className="room-type-status-cell"
                    data-mobile-label="Trạng thái"
                  >
                    {roomType.is_active ? "Đang dùng" : "Ngừng dùng"}
                  </td>
                  <td
                    className="room-type-action-cell"
                    data-mobile-label="Thao tác"
                  >
                    <form action={toggleRoomType}>
                      <input type="hidden" name="id" value={roomType.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={String(!roomType.is_active)}
                      />
                      <button className="table-action">
                        {roomType.is_active ? "Ngừng dùng" : "Kích hoạt"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </AdminShell>
  );
}
