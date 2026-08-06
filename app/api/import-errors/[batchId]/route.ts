import { NextResponse } from "next/server";
import { importHeaderLabels, importHeaders } from "@/lib/import-template";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { batchId } = await params;
  const { data: rows, error } = await supabase
    .from("import_rows")
    .select("row_number, validation_status, raw_data, errors, warnings")
    .eq("import_batch_id", batchId)
    .in("validation_status", ["error", "duplicate", "conflict", "system_error"])
    .order("row_number");

  if (error) {
    return NextResponse.json(
      { message: "Không thể đọc phiên import này." },
      { status: 403 },
    );
  }

  const headers = [
    "Dòng nguồn",
    ...importHeaders.map((header) => importHeaderLabels[header]),
    "Trạng thái kiểm tra",
    "Lỗi kiểm tra",
    "Cảnh báo kiểm tra",
  ];
  const lines = [
    headers.map(csvCell).join(","),
    ...(rows ?? []).map((row) => {
      const raw = row.raw_data as Record<string, unknown>;
      return [
        row.row_number,
        ...importHeaders.map((header) => raw[header] ?? ""),
        row.validation_status === "duplicate"
          ? "Trùng"
          : row.validation_status === "conflict"
            ? "Xung đột"
            : row.validation_status === "system_error"
              ? "Lỗi hệ thống"
              : "Lỗi dữ liệu",
        (row.errors as string[]).join("; "),
        (row.warnings as string[]).join("; "),
      ]
        .map(csvCell)
        .join(",");
    }),
  ];

  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-errors-${batchId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
