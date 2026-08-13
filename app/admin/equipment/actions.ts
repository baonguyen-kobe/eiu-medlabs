"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  findDuplicateCommercialName,
  matchCatalogImportRows,
  normalizedCommercialName,
} from "@/lib/equipment-catalog-identity";
import { createClient } from "@/lib/supabase/server";

export type EquipmentCatalogInput = {
  id?: string;
  item_name: string;
  commercial_name: string | null;
  item_type: string | null;
  country_of_origin: string | null;
  manufacturer: string | null;
  model: string | null;
  unit: string;
};

export type EquipmentCatalogActionResult = {
  ok: boolean;
  message: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeHeaderKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

const missingCommercialNameMessage = "Vui lòng nhập Tên thương mại.";
const duplicateCommercialNameMessage =
  "Tên thương mại đã tồn tại trong danh mục.";
const duplicateImportCommercialNameMessage =
  "File import có Tên thương mại bị trùng. Vui lòng kiểm tra lại file.";

function catalogErrorMessage(error: unknown, fallback: string) {
  return (
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505" &&
      duplicateCommercialNameMessage) ||
    fallback
  );
}

async function requireCatalogManager() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"]);
  if (!roles?.length) redirect("/dashboard");
  return supabase;
}

async function readAllCatalogRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const rows: Array<
    EquipmentCatalogInput & { id: string; is_active: boolean }
  > = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("equipment_catalog")
      .select(
        "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
      )
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function parseCatalogRow(
  raw: Record<string, unknown>,
): EquipmentCatalogInput | null {
  const normalized = new Map(
    Object.entries(raw).map(([key, value]) => [normalizeHeaderKey(key), value]),
  );
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      if (normalized.has(key)) return cleanText(normalized.get(key));
    }
    return null;
  };
  const itemName = pick("tenthietbivavattu", "tenthietbi", "itemname");
  const commercialName = pick("tenthuongmai", "commercialname");
  const unit = pick("dvt", "donvitinh", "unit");
  if (
    !itemName &&
    !unit &&
    Object.values(raw).every((value) => !cleanText(value))
  ) {
    return null;
  }
  if (!itemName || !commercialName || !unit) {
    throw new Error(
      "Mỗi dòng phải có Tên thiết bị và vật tư, Tên thương mại cùng ĐVT.",
    );
  }
  return {
    item_name: itemName,
    commercial_name: commercialName,
    item_type: pick("loai", "itemtype"),
    country_of_origin: pick("nuocsx", "nuocsanxuat", "countryoforigin"),
    manufacturer: pick("hang", "hangsanxuat", "manufacturer"),
    model: pick("model"),
    unit,
  };
}

export async function createEquipmentCatalogItem(formData: FormData) {
  const supabase = await requireCatalogManager();
  const itemName = cleanText(formData.get("item_name"));
  const commercialName = cleanText(formData.get("commercial_name"));
  const unit = cleanText(formData.get("unit"));
  if (!itemName || !commercialName || !unit) {
    redirect(
      `/admin/equipment?error=${encodeURIComponent(
        !commercialName
          ? missingCommercialNameMessage
          : "Vui lòng nhập Tên thiết bị và vật tư cùng ĐVT.",
      )}`,
    );
  }
  const { error } = await supabase.from("equipment_catalog").insert({
    item_name: itemName,
    commercial_name: commercialName,
    item_type: cleanText(formData.get("item_type")),
    country_of_origin: cleanText(formData.get("country_of_origin")),
    manufacturer: cleanText(formData.get("manufacturer")),
    model: cleanText(formData.get("model")),
    unit,
  });
  revalidatePath("/admin/equipment");
  redirect(
    `/admin/equipment?${
      error
        ? `error=${encodeURIComponent(
            catalogErrorMessage(error, "Không thể thêm thiết bị."),
          )}`
        : "notice=%C4%90%C3%A3+th%C3%AAm+thi%E1%BA%BFt+b%E1%BB%8B"
    }`,
  );
}

export async function updateEquipmentCatalogItems(
  inputRows: EquipmentCatalogInput[],
): Promise<EquipmentCatalogActionResult> {
  const supabase = await requireCatalogManager();
  if (!inputRows.length || inputRows.length > 1000) {
    return { ok: false, message: "Danh sách chỉnh sửa không hợp lệ." };
  }
  const rows = inputRows.map((row) => ({
    id: String(row.id ?? ""),
    item_name: cleanText(row.item_name),
    commercial_name: cleanText(row.commercial_name),
    item_type: cleanText(row.item_type),
    country_of_origin: cleanText(row.country_of_origin),
    manufacturer: cleanText(row.manufacturer),
    model: cleanText(row.model),
    unit: cleanText(row.unit),
  }));
  if (
    rows.some(
      (row) =>
        !uuidPattern.test(row.id) ||
        !row.item_name ||
        !row.commercial_name ||
        !row.unit,
    )
  ) {
    return {
      ok: false,
      message:
        "Tên thiết bị, Tên thương mại, ĐVT hoặc mã dòng chỉnh sửa không hợp lệ.",
    };
  }
  const ids = [...new Set(rows.map(({ id }) => id))];
  if (ids.length !== rows.length) {
    return { ok: false, message: "Danh sách chỉnh sửa bị trùng dòng." };
  }
  if (findDuplicateCommercialName(rows)) {
    return { ok: false, message: duplicateCommercialNameMessage };
  }
  const { data: existing, error: existingError } = await supabase
    .from("equipment_catalog")
    .select("id,commercial_name")
    .in("id", ids);
  if (existingError || existing?.length !== ids.length) {
    return {
      ok: false,
      message: "Có thiết bị không còn tồn tại trong danh mục.",
    };
  }
  let catalogRows: Awaited<ReturnType<typeof readAllCatalogRows>>;
  try {
    catalogRows = await readAllCatalogRows(supabase);
  } catch {
    return { ok: false, message: "Không thể kiểm tra danh mục thiết bị." };
  }
  const existingByCommercialName = new Map(
    catalogRows.map((row) => [
      normalizedCommercialName(row.commercial_name),
      row.id,
    ]),
  );
  if (
    rows.some(
      (row) =>
        existingByCommercialName.has(
          normalizedCommercialName(row.commercial_name),
        ) &&
        existingByCommercialName.get(
          normalizedCommercialName(row.commercial_name),
        ) !== row.id,
    )
  ) {
    return { ok: false, message: duplicateCommercialNameMessage };
  }
  const { error } = await supabase
    .from("equipment_catalog")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? duplicateCommercialNameMessage
          : "Không thể lưu chỉnh sửa danh mục.",
    };
  }
  revalidatePath("/admin/equipment");
  return { ok: true, message: `Đã lưu ${rows.length} dòng thiết bị.` };
}

export async function disableEquipmentCatalogItems(
  rawIds: string[],
): Promise<EquipmentCatalogActionResult> {
  const supabase = await requireCatalogManager();
  const ids = [...new Set(rawIds)].filter((id) => uuidPattern.test(id));
  if (!ids.length || ids.length > 1000) {
    return { ok: false, message: "Vui lòng chọn thiết bị cần ngừng sử dụng." };
  }
  const { data, error } = await supabase
    .from("equipment_catalog")
    .update({ is_active: false })
    .in("id", ids)
    .select("id");
  if (error || !data?.length) {
    return {
      ok: false,
      message: "Không thể ngừng sử dụng các thiết bị đã chọn.",
    };
  }
  revalidatePath("/admin/equipment");
  return { ok: true, message: `Đã ngừng sử dụng ${data.length} thiết bị.` };
}

export async function setEquipmentCatalogActive(
  rawIds: string[],
  active: boolean,
): Promise<EquipmentCatalogActionResult> {
  const supabase = await requireCatalogManager();
  const ids = [...new Set(rawIds)].filter((id) => uuidPattern.test(id));
  if (!ids.length || ids.length > 1000) {
    return { ok: false, message: "Vui lòng chọn thiết bị cần cập nhật." };
  }
  const { data, error } = await supabase
    .from("equipment_catalog")
    .update({ is_active: active })
    .in("id", ids)
    .select("id");
  if (error || !data?.length) {
    return { ok: false, message: "Không thể cập nhật trạng thái thiết bị." };
  }
  revalidatePath("/admin/equipment");
  return {
    ok: true,
    message: active
      ? `Đã kích hoạt ${data.length} thiết bị.`
      : `Đã ngừng sử dụng ${data.length} thiết bị.`,
  };
}

export async function deleteEquipmentCatalogItems(
  rawIds: string[],
): Promise<EquipmentCatalogActionResult> {
  const supabase = await requireCatalogManager();
  const ids = [...new Set(rawIds)].filter((id) => uuidPattern.test(id));
  if (!ids.length || ids.length > 1000) {
    return { ok: false, message: "Vui lòng chọn thiết bị cần xóa." };
  }
  const { data, error } = await supabase
    .from("equipment_catalog")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23503"
          ? "Không thể xóa thiết bị đã được sử dụng trong phiếu. Bạn có thể ngừng sử dụng thiết bị đó."
          : "Không thể xóa các thiết bị đã chọn.",
    };
  }
  revalidatePath("/admin/equipment");
  return { ok: true, message: `Đã xóa ${data?.length ?? 0} thiết bị.` };
}

export async function importEquipmentCatalog(formData: FormData) {
  const supabase = await requireCatalogManager();
  const requestedMode = String(formData.get("mode") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/equipment?error=Vui+l%C3%B2ng+ch%E1%BB%8Dn+file+import");
  }
  if (file.size > 10 * 1024 * 1024) {
    redirect(
      "/admin/equipment?error=File+import+kh%C3%B4ng+%C4%91%C6%B0%E1%BB%A3c+v%C6%B0%E1%BB%A3t+qu%C3%A1+10+MB",
    );
  }
  if (
    !/\.(csv|xlsx)$/i.test(file.name) ||
    !["all", "new"].includes(requestedMode)
  ) {
    redirect(
      "/admin/equipment?error=Ch%E1%BB%89+h%E1%BB%97+tr%E1%BB%A3+file+CSV+ho%E1%BA%B7c+XLSX",
    );
  }
  const mode: "all" | "new" = requestedMode === "all" ? "all" : "new";

  try {
    const XLSX = await import("@e965/xlsx");
    const fileBuffer = await file.arrayBuffer();
    const workbook = /\.csv$/i.test(file.name)
      ? XLSX.read(new TextDecoder("utf-8").decode(fileBuffer), {
          type: "string",
          codepage: 65001,
        })
      : XLSX.read(fileBuffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      firstSheet,
      {
        defval: "",
        raw: false,
      },
    );
    if (!rawRows.length || rawRows.length > 5000) {
      throw new Error("File phải có từ 1 đến 5.000 dòng dữ liệu.");
    }
    const parsed = rawRows
      .map(parseCatalogRow)
      .filter((row): row is EquipmentCatalogInput => Boolean(row));
    if (!parsed.length) throw new Error("File không có dòng thiết bị hợp lệ.");

    if (findDuplicateCommercialName(parsed)) {
      throw new Error(duplicateImportCommercialNameMessage);
    }
    let existing: Awaited<ReturnType<typeof readAllCatalogRows>>;
    try {
      existing = await readAllCatalogRows(supabase);
    } catch {
      throw new Error("Không thể kiểm tra danh mục thiết bị.");
    }
    const payload = matchCatalogImportRows(parsed, existing, mode);
    if (!payload.length) {
      redirect(
        "/admin/equipment?notice=Kh%C3%B4ng+c%C3%B3+thi%E1%BA%BFt+b%E1%BB%8B+m%E1%BB%9Bi+%C4%91%E1%BB%83+import",
      );
    }
    const rowsToUpdate = payload.filter(
      (row): row is typeof row & { id: string } => "id" in row,
    );
    const rowsToInsert = payload
      .filter((row) => !("id" in row))
      .map((row) => ({
        item_name: row.item_name,
        commercial_name: row.commercial_name,
        item_type: row.item_type,
        country_of_origin: row.country_of_origin,
        manufacturer: row.manufacturer,
        model: row.model,
        unit: row.unit,
      }));
    if (rowsToUpdate.length) {
      const { error } = await supabase
        .from("equipment_catalog")
        .upsert(rowsToUpdate, { onConflict: "id" });
      if (error) {
        throw new Error(
          catalogErrorMessage(error, "Không thể cập nhật danh mục."),
        );
      }
    }
    if (rowsToInsert.length) {
      const { error } = await supabase
        .from("equipment_catalog")
        .insert(rowsToInsert);
      if (error) {
        throw new Error(catalogErrorMessage(error, "Không thể thêm thiết bị."));
      }
    }
    revalidatePath("/admin/equipment");
    const label = mode === "all" ? "cập nhật/thêm" : "thêm mới";
    redirect(
      `/admin/equipment?notice=${encodeURIComponent(`Đã ${label} ${payload.length} thiết bị từ ${file.name}.`)}`,
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message =
      error instanceof Error ? error.message : "Không thể đọc file import.";
    redirect(`/admin/equipment?error=${encodeURIComponent(message)}`);
  }
}
