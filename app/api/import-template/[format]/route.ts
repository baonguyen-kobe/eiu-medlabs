import { NextResponse, type NextRequest } from "next/server";
import {
  exportTkbHeaders,
  exportTkbSamples,
  importDisplayHeaders,
  importHeaderLabels,
  importHeaders,
  importSamples,
  toDisplayImportRow,
} from "@/lib/import-template";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ format: string }> },
) {
  const { format } = await context.params;
  const isSkillsLab =
    request.nextUrl.searchParams.get("scope") !== "basic_medical";
  const displayHeaders = isSkillsLab
    ? [...exportTkbHeaders]
    : importDisplayHeaders;
  const displayRows: Record<string, unknown>[] = isSkillsLab
    ? exportTkbSamples
    : importSamples.map(toDisplayImportRow);

  if (format === "csv") {
    const rows = [
      displayHeaders.map(escapeCsv).join(","),
      ...displayRows.map((sample) =>
        displayHeaders.map((header) => escapeCsv(sample[header])).join(","),
      ),
    ];
    return new NextResponse(`\uFEFF${rows.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${isSkillsLab ? "skills-lab-export-tkb-template" : "basic-medical-import-template"}.csv"`,
      },
    });
  }

  if (format === "xlsx") {
    const XLSX = await import("@e965/xlsx");
    const workbook = XLSX.utils.book_new();
    const templateSheet = XLSX.utils.json_to_sheet(displayRows, {
      header: displayHeaders,
    });
    const field = (header: (typeof importHeaders)[number]) =>
      importHeaderLabels[header];
    const instructionRows = isSkillsLab
      ? [
          ["MEDLABS CALENDAR — HƯỚNG DẪN IMPORT LỊCH SKILLS LAB"],
          [],
          ["Cột", "Bắt buộc", "Định dạng / ghi chú"],
          ["A · Mã MH", "Có", "Mã môn học, ví dụ BSC 112"],
          ["B · Tên môn học", "Có", "Tên đầy đủ của môn học"],
          ["C–F", "Không", "Giữ nguyên từ file Export_TKB; hệ thống bỏ qua"],
          [
            "G · Giờ bắt đầu",
            "Có",
            "1 = 07:30; mỗi đơn vị tiếp theo cộng 30 phút. Ví dụ 11 = 12:30",
          ],
          [
            "H · Giờ kết thúc",
            "Có",
            "Là số đơn vị thời lượng; mỗi đơn vị = 30 phút. Ví dụ 8 = 4 giờ",
          ],
          ["I · Phòng", "Có", "Mã phòng và tòa nhà, ví dụ 322.B10"],
          [
            "J · Giảng viên",
            "Không",
            "Viết tắt chữ cái đầu, phần tên viết đầy đủ; ví dụ N.T.M.Dung",
          ],
          ["K · Sĩ số", "Có", "Số nguyên từ 1 trở lên"],
          [
            "L · Thời gian học",
            "Có",
            "Lấy ngày đầu tiên; chấp nhận dạng 19/08/26 đến 19/08/26",
          ],
          [],
          [
            "Lưu ý",
            "Không tự tạo nhân sự mới. Không tìm thấy giảng viên chỉ là cảnh báo; không tìm thấy phòng là lỗi chặn.",
          ],
        ]
      : [
          ["MEDLABS CALENDAR — HƯỚNG DẪN IMPORT LỊCH HỌC"],
          [],
          ["Trường", "Bắt buộc", "Định dạng / ghi chú"],
          [
            field("schedule_date"),
            "Có",
            "Chấp nhận ô ngày Excel, dd/mm/yyyy hoặc yyyy-mm-dd",
          ],
          [
            field("start_time"),
            "Có",
            "Chấp nhận ô giờ Excel hoặc HH:mm theo giờ 24h",
          ],
          [
            field("end_time"),
            "Có",
            `Chấp nhận ô giờ Excel hoặc HH:mm; phải sau ${field("start_time").toLocaleLowerCase("vi")}`,
          ],
          [field("course_code"), "Có", "Mã môn học"],
          [field("course_name"), "Có", "Tên môn học"],
          [field("student_count"), "Có", "Số nguyên từ 1 trở lên"],
          [field("room_code"), "Có", "Ví dụ 105"],
          [field("building_code"), "Có", "Ví dụ B5"],
          [field("lecturer_email"), "Không", "Dùng để đối chiếu giảng viên"],
          [
            field("lecturer_name"),
            "Không",
            "Chỉ đối chiếu khi tên khớp duy nhất",
          ],
          [field("note"), "Không", "Ghi chú tự do"],
          [],
          [
            "Lưu ý",
            "Không tự tạo nhân sự mới. Không tìm thấy giảng viên chỉ là cảnh báo; không tìm thấy phòng là lỗi chặn.",
          ],
        ];
    const instructions = XLSX.utils.aoa_to_sheet(instructionRows);
    templateSheet["!cols"] = displayHeaders.map((header) => ({
      wch: Math.max(header.length + 2, 16),
    }));
    instructions["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 74 }];
    XLSX.utils.book_append_sheet(workbook, templateSheet, "Dữ liệu lịch");
    XLSX.utils.book_append_sheet(workbook, instructions, "Hướng dẫn");
    const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(output, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${isSkillsLab ? "skills-lab-export-tkb-template" : "basic-medical-import-template"}.xlsx"`,
      },
    });
  }

  return NextResponse.json(
    { error: "Định dạng không được hỗ trợ." },
    { status: 404 },
  );
}
