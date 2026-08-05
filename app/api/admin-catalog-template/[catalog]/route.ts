import { NextResponse, type NextRequest } from "next/server";
import {
  adminCatalogTemplates,
  buildCourseTemplateSamples,
  buildPersonnelTemplateSamples,
  isAdminCatalogTemplate,
  personnelRoleDisplayNames,
} from "@/lib/admin-catalog-template";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ catalog: string }> },
) {
  const { catalog } = await context.params;
  if (!isAdminCatalogTemplate(catalog)) {
    return NextResponse.json(
      { error: "Danh mục không hợp lệ." },
      { status: 404 },
    );
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const allowedRoles = catalog === "equipment" ? ["admin", "staff"] : ["admin"];
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", allowedRoles);
  if (!roles?.length) {
    return NextResponse.json(
      { error: "Không có quyền tải template." },
      { status: 403 },
    );
  }

  let roomTypes: Array<{ code: string; name: string }> = [];
  if (catalog === "courses" || catalog === "rooms" || catalog === "personnel") {
    const { data, error } = await supabase
      .from("room_types")
      .select("code,name")
      .eq("is_active", true)
      .order("name");
    if (error) {
      return NextResponse.json(
        { error: "Không thể tải danh sách Loại phòng." },
        { status: 500 },
      );
    }
    roomTypes = data ?? [];
  }

  const definition = adminCatalogTemplates[catalog];
  const samples =
    catalog === "personnel"
      ? buildPersonnelTemplateSamples(roomTypes)
      : catalog === "courses"
        ? buildCourseTemplateSamples(roomTypes)
        : definition.samples;
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(samples, {
    header: definition.headers,
  });
  sheet["!cols"] = definition.widths.map((wch) => ({ wch }));
  sheet["!rows"] = [{ hpt: 28 }];
  sheet["!autofilter"] = {
    ref: `A1:${XLSX.utils.encode_col(definition.headers.length - 1)}${samples.length + 1}`,
  };
  XLSX.utils.book_append_sheet(workbook, sheet, definition.sheetName);

  const instructionRows: Array<Array<string>> = [
    [
      `MEDLABS CALENDAR — HƯỚNG DẪN IMPORT ${definition.sheetName.toUpperCase()}`,
    ],
    [],
    ["Trường", "Bắt buộc", "Định dạng / ghi chú"],
    ...definition.instructions,
  ];
  if (catalog === "courses" || catalog === "rooms" || catalog === "personnel") {
    instructionRows.push(
      [],
      ["Loại phòng có thể sử dụng"],
      ...roomTypes.map(({ name }) => [name]),
    );
  }
  if (catalog === "personnel") {
    instructionRows.push(
      [],
      ["Vai trò có thể sử dụng"],
      ...personnelRoleDisplayNames.map((role) => [role]),
      [],
      ["Quy tắc riêng cho Người xem"],
      [
        "1",
        "Vai trò",
        "Chỉ nhập Người xem; không kết hợp Người xem với bất kỳ vai trò nào khác",
      ],
      [
        "2",
        "Loại phòng",
        "Nhập một hoặc nhiều Loại phòng mà tài khoản được phép xem",
      ],
      [
        "3",
        "Loại phòng nhận email",
        "Để trống nếu chỉ xem và không nhận email. Nếu nhận email, chỉ nhập một phần hoặc toàn bộ tên đã có trong cột Loại phòng",
      ],
      [
        "4",
        "Ví dụ không nhận email",
        "Vai trò = Người xem; Loại phòng = Kỹ năng Điều dưỡng; Loại phòng nhận email = để trống",
      ],
      [
        "5",
        "Ví dụ có nhận email",
        "Vai trò = Người xem; Loại phòng = Kỹ năng Điều dưỡng, Y cơ sở; Loại phòng nhận email = Kỹ năng Điều dưỡng",
      ],
    );
  }
  const instructions = XLSX.utils.aoa_to_sheet(instructionRows);
  instructions["!cols"] = [{ wch: 38 }, { wch: 26 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Hướng dẫn");
  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
  });

  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${definition.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
