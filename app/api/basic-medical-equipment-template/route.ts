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
      { error: "Không có quyền tải template." },
      { status: 403 },
    );
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.utils.book_new();
  const template = XLSX.utils.json_to_sheet([
    {
      "Tên thiết bị và vật tư": "Máy đo huyết áp",
      "Tên thương mại": "Omron HEM-7120",
      Loại: "Thiết bị",
      "Nước SX": "Nhật Bản",
      Hãng: "Omron",
      Model: "HEM-7120",
      ĐVT: "Cái",
    },
  ]);
  const guide = XLSX.utils.aoa_to_sheet([
    ["Cột", "Bắt buộc", "Hướng dẫn"],
    ["Tên thiết bị và vật tư", "Có", "Tên dùng để quản lý và tìm kiếm"],
    ["Tên thương mại", "Không", "Tên sản phẩm hoặc quy cách thương mại"],
    ["Loại", "Không", "Ví dụ: Thiết bị, Dụng cụ, Vật tư"],
    ["Nước SX", "Không", "Tên quốc gia hiển thị"],
    ["Hãng", "Không", "Hãng sản xuất"],
    ["Model", "Không", "Mã model"],
    ["ĐVT", "Có", "Ví dụ: Cái, Bộ, Hộp, Chai"],
  ]);
  template["!cols"] = [
    { wch: 36 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
  ];
  guide["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(workbook, template, "Danh mục thiết bị");
  XLSX.utils.book_append_sheet(workbook, guide, "Hướng dẫn");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="template-thiet-bi-y-co-so.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
