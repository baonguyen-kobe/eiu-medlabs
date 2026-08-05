import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId)
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"]);
  if (!roles?.length)
    return NextResponse.json(
      { error: "Không có quyền export." },
      { status: 403 },
    );
  const [catalogResult, inventoryResult] = await Promise.all([
    supabase
      .from("basic_medical_equipment_catalog")
      .select(
        "item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
      )
      .order("item_name")
      .limit(10000),
    supabase
      .from("basic_medical_room_inventory")
      .select(
        "total_quantity,good_quantity,damaged_quantity,is_active,room:rooms(room_code,building_code,room_name),catalog:basic_medical_equipment_catalog(item_name,commercial_name,unit)",
      )
      .order("created_at")
      .limit(10000),
  ]);
  const error = catalogResult.error ?? inventoryResult.error;
  if (error)
    return NextResponse.json(
      { error: "Không thể đọc danh sách thiết bị." },
      { status: 500 },
    );
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.utils.book_new();
  const catalogSheet = XLSX.utils.json_to_sheet(
    (catalogResult.data ?? []).map((item) => ({
      "Tên thiết bị và vật tư": item.item_name,
      "Tên thương mại": item.commercial_name ?? "",
      Loại: item.item_type ?? "",
      "Nước SX": item.country_of_origin ?? "",
      Hãng: item.manufacturer ?? "",
      Model: item.model ?? "",
      ĐVT: item.unit,
      "Trạng thái": item.is_active ? "Đang sử dụng" : "Ngừng sử dụng",
    })),
  );
  const inventorySheet = XLSX.utils.json_to_sheet(
    (inventoryResult.data ?? []).map((item) => {
      const room = item.room as unknown as {
        room_code: string;
        building_code: string;
        room_name: string | null;
      } | null;
      const catalog = item.catalog as unknown as {
        item_name: string;
        commercial_name: string | null;
        unit: string;
      } | null;
      return {
        "Số phòng": room?.room_code ?? "",
        "Tòa nhà": room?.building_code ?? "",
        "Tên phòng": room?.room_name ?? "",
        "Tên thiết bị": catalog?.item_name ?? "",
        "Tên thương mại": catalog?.commercial_name ?? "",
        ĐVT: catalog?.unit ?? "",
        Tổng: item.total_quantity,
        Tốt: item.good_quantity,
        Hư: item.damaged_quantity,
        "Trạng thái": item.is_active ? "Đang sử dụng" : "Ngừng sử dụng",
      };
    }),
  );
  XLSX.utils.book_append_sheet(workbook, catalogSheet, "Danh mục thiết bị");
  XLSX.utils.book_append_sheet(workbook, inventorySheet, "Thiết bị theo phòng");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="thiet-bi-y-co-so.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
