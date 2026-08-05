import { NextResponse } from "next/server";
import {
  equipmentImportDisplayHeaders,
  equipmentImportSamples,
  toEquipmentImportDisplayRow,
} from "@/lib/equipment-import-template";

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ format: string }> },
) {
  const { format } = await context.params;
  const displayRows = equipmentImportSamples.map(toEquipmentImportDisplayRow);
  const baseName = "template-import-phieu-thiet-bi";

  if (format === "csv") {
    const rows = [
      equipmentImportDisplayHeaders.map(escapeCsv).join(","),
      ...displayRows.map((row) =>
        equipmentImportDisplayHeaders
          .map((header) => escapeCsv(row[header]))
          .join(","),
      ),
    ];
    return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.utils.book_new();
    const templateSheet = XLSX.utils.json_to_sheet(displayRows, {
      header: equipmentImportDisplayHeaders,
    });
    templateSheet["!cols"] = equipmentImportDisplayHeaders.map(
      (header, index) => ({
        wch: Math.min(
          36,
          Math.max(header.length + 2, index === 15 || index === 21 ? 30 : 16),
        ),
      }),
    );
    templateSheet["!autofilter"] = {
      ref: `A1:${XLSX.utils.encode_col(equipmentImportDisplayHeaders.length - 1)}3`,
    };

    const instructions = XLSX.utils.aoa_to_sheet([
      ["MEDLABS CALENDAR — HƯỚNG DẪN IMPORT PHIẾU THIẾT BỊ"],
      [],
      ["Nội dung", "Quy tắc nhập liệu"],
      [
        "Mỗi dòng",
        "Là một thiết bị/vật tư. Các dòng có cùng Mã phiếu nguồn được gom vào cùng một phiếu.",
      ],
      [
        "Mã phiếu nguồn",
        "Bắt buộc đủ 12 chữ số theo YYMMDDHHMMSS, ví dụ 260803090005. Mã này đồng thời xác định ngày giờ tạo phiếu cũ.",
      ],
      [
        "Người đăng ký",
        "Nhập email để đối chiếu chính xác với Nhân sự; nếu để trống email thì tên phải khớp duy nhất. Số điện thoại gồm đúng 10 chữ số; để trống sẽ lấy từ Nhân sự.",
      ],
      [
        "Giảng viên phụ trách",
        "Nhập email hoặc tên khớp duy nhất với giảng viên thuộc Kỹ năng Điều dưỡng. Có thể là chính người đăng ký.",
      ],
      [
        "Lớp Skills lab",
        "Hệ thống dò theo Mã môn học + Ngày học + Giờ bắt đầu học + Phòng/Lab. Phòng nhập dạng 322.B10.",
      ],
      [
        "Ngày và giờ",
        "Ngày: dd/mm/yyyy, yyyy-mm-dd hoặc ô ngày Excel. Giờ: HH:mm theo 24 giờ. Import dữ liệu cũ giữ nguyên giờ lịch sử.",
      ],
      ["Trạng thái", "Chỉ dùng: Mới, Đã soạn, Đã giao, Đã trả, Hoàn Thành."],
      [
        "Thiết bị/vật tư",
        "Dò theo Tên thiết bị và vật tư + Tên thương mại + Model trong Danh mục thiết bị. Nếu tên thiết bị là duy nhất thì có thể để trống Tên thương mại và Model.",
      ],
      [
        "Số lượng",
        "Số nguyên từ 1 trở lên. Kỹ năng/Bài thực hành là bắt buộc cho từng dòng.",
      ],
      [
        "Thông tin lặp lại",
        "Các cột từ Người đăng ký đến Ghi chú chung phải giống nhau ở mọi dòng cùng Mã phiếu nguồn.",
      ],
      [
        "Giới hạn và thông báo",
        "Tối đa 500 dòng mỗi file. Import dữ liệu cũ không gửi email thông báo.",
      ],
      [],
      [
        "Lưu ý",
        "Hai dòng ví dụ trong sheet Dữ liệu import thuộc cùng một phiếu. Hãy xóa hoặc thay toàn bộ dữ liệu ví dụ trước khi import.",
      ],
    ]);
    instructions["!cols"] = [{ wch: 28 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(workbook, templateSheet, "Dữ liệu import");
    XLSX.utils.book_append_sheet(workbook, instructions, "Hướng dẫn");
    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(output, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }

  return NextResponse.json(
    { error: "Định dạng không được hỗ trợ." },
    { status: 404 },
  );
}
