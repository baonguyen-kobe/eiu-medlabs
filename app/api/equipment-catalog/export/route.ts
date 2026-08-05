import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff"]);
  if (!roles?.length) {
    return NextResponse.json(
      { error: "Không có quyền xuất danh mục." },
      { status: 403 },
    );
  }

  const catalog: Array<{
    item_name: string;
    commercial_name: string | null;
    item_type: string | null;
    country_of_origin: string | null;
    manufacturer: string | null;
    model: string | null;
    unit: string;
    is_active: boolean;
  }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("equipment_catalog")
      .select(
        "item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
      )
      .order("item_name")
      .range(from, from + pageSize - 1);
    if (error) {
      return NextResponse.json(
        { error: "Không thể đọc danh mục." },
        { status: 500 },
      );
    }
    catalog.push(...((data ?? []) as typeof catalog));
    if (!data || data.length < pageSize) break;
  }

  const XLSX = await import("@e965/xlsx");
  const rows = catalog.map((item) => ({
    "Tên thiết bị và vật tư": item.item_name,
    "Tên thương mại": item.commercial_name ?? "",
    Loại: item.item_type ?? "",
    "Nước SX": item.country_of_origin ?? "",
    Hãng: item.manufacturer ?? "",
    Model: item.model ?? "",
    ĐVT: item.unit,
    "Trạng thái": item.is_active ? "Đang sử dụng" : "Ngừng sử dụng",
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 36 },
    { wch: 30 },
    { wch: 18 },
    { wch: 16 },
    { wch: 22 },
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Danh mục thiết bị");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="danh-muc-thiet-bi-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
