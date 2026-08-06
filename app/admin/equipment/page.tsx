import { redirect } from "next/navigation";
import {
  EquipmentCatalogManager,
  type EquipmentCatalogItem,
} from "@/components/equipment-catalog-manager";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getViewer } from "@/lib/viewer";
import { createEquipmentCatalogItem } from "./actions";

export default async function EquipmentCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const {
    supabase,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
  } = await getViewer();
  if (!roles.some((role) => ["admin", "staff"].includes(role))) {
    redirect("/dashboard");
  }
  const catalogPromise = (async () => {
    const rows: EquipmentCatalogItem[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("equipment_catalog")
        .select(
          "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
        )
        .order("item_name")
        .range(from, from + pageSize - 1);
      if (error) break;
      rows.push(...((data ?? []) as EquipmentCatalogItem[]));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  })();
  const [data, query] = await Promise.all([catalogPromise, searchParams]);

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypes.map(({ code }) => code)}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      title="Danh mục thiết bị"
      description="Thiết bị và vật tư dùng cho phiếu đăng ký Skills lab."
    >
      {query.notice || query.error ? (
        <p className={query.error ? "form-error" : "form-success"}>
          {query.error ?? query.notice}
        </p>
      ) : null}

      <form
        action={createEquipmentCatalogItem}
        className="data-panel catalog-inline-form equipment-catalog-create-form"
      >
        <div className="equipment-catalog-create-heading">
          <strong>Thêm thiết bị thủ công</strong>
        </div>
        <div className="form-grid equipment-catalog-create-grid">
          <label>
            Tên thiết bị và vật tư *
            <input name="item_name" required />
          </label>
          <label>
            Tên thương mại
            <input name="commercial_name" />
          </label>
          <label>
            Loại
            <input name="item_type" />
          </label>
          <label>
            Nước SX
            <input name="country_of_origin" />
          </label>
          <label>
            Hãng
            <input name="manufacturer" />
          </label>
          <label>
            Model
            <input name="model" />
          </label>
          <label>
            ĐVT *
            <input name="unit" required />
          </label>
        </div>
        <button className="button button-primary">Thêm vào danh mục</button>
      </form>

      <EquipmentCatalogManager initialItems={data} />
    </WorkspaceShell>
  );
}
