export const importHeaders = [
  "schedule_date",
  "start_time",
  "end_time",
  "course_code",
  "course_name",
  "student_count",
  "room_code",
  "building_code",
  "lecturer_email",
  "lecturer_name",
  "note",
] as const;

export type ImportHeader = (typeof importHeaders)[number];

export const importHeaderLabels: Record<ImportHeader, string> = {
  schedule_date: "Ngày học",
  start_time: "Giờ bắt đầu",
  end_time: "Giờ kết thúc",
  course_code: "Mã môn học",
  course_name: "Tên môn học",
  student_count: "Số sinh viên",
  room_code: "Mã phòng",
  building_code: "Mã tòa nhà",
  lecturer_email: "Email giảng viên",
  lecturer_name: "Tên giảng viên",
  note: "Ghi chú",
};

export const importDisplayHeaders = importHeaders.map(
  (header) => importHeaderLabels[header],
);

function normalizeImportHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const importHeaderByAlias = new Map<string, ImportHeader>();
for (const header of importHeaders) {
  importHeaderByAlias.set(normalizeImportHeader(header), header);
  importHeaderByAlias.set(
    normalizeImportHeader(importHeaderLabels[header]),
    header,
  );
}

const exportTkbAliases: Record<string, ImportHeader> = {
  mamh: "course_code",
  tenmonhoc: "course_name",
  giobatdau: "start_time",
  gioketthuc: "end_time",
  phong: "room_code",
  giangvien: "lecturer_name",
  siso: "student_count",
  thoigianhoc: "schedule_date",
};

for (const [alias, header] of Object.entries(exportTkbAliases)) {
  importHeaderByAlias.set(alias, header);
}

export function isExportTkbRow(row: Record<string, unknown>) {
  const headers = new Set(Object.keys(row).map(normalizeImportHeader));
  return (
    headers.has("mamh") &&
    headers.has("giobatdau") &&
    headers.has("gioketthuc") &&
    headers.has("thoigianhoc")
  );
}

export function normalizeImportRowHeaders(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const header = importHeaderByAlias.get(normalizeImportHeader(key));
    if (header) normalized[header] = value;
  }
  return normalized;
}

export function toDisplayImportRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    importHeaders.map((header) => [
      importHeaderLabels[header],
      row[header] ?? "",
    ]),
  );
}

export const importSamples = [
  {
    schedule_date: "03/08/2026",
    start_time: "07:30",
    end_time: "11:30",
    course_code: "NUR 101",
    course_name: "Thăm khám thể chất",
    student_count: 30,
    room_code: "105",
    building_code: "B5",
    lecturer_email: "giangvien@campus.local",
    lecturer_name: "Nguyễn Ngọc Diễm",
    note: "Dòng mẫu — có thể xóa trước khi import",
  },
  {
    schedule_date: "04/08/2026",
    start_time: "13:30",
    end_time: "16:30",
    course_code: "NUR 205",
    course_name: "Điều dưỡng nội khoa",
    student_count: 25,
    room_code: "201",
    building_code: "A2",
    lecturer_email: "",
    lecturer_name: "",
    note: "Có thể để trống giảng viên",
  },
];

export const exportTkbHeaders = [
  "Mã MH",
  "Tên môn học",
  "Nhóm tổ",
  "Số tín chỉ",
  "Lớp",
  "Thứ",
  "Giờ bắt đầu",
  "Giờ kết thúc",
  "Phòng",
  "Giảng viên",
  "Sĩ số",
  "Thời gian học",
] as const;

export const exportTkbSamples = [
  {
    "Mã MH": "BSC 112",
    "Tên môn học": "Giáo dục sức khỏe trong thực hành điều dưỡng",
    "Nhóm tổ": "",
    "Số tín chỉ": "",
    Lớp: "",
    Thứ: "",
    "Giờ bắt đầu": 1,
    "Giờ kết thúc": 8,
    Phòng: "322.B10",
    "Giảng viên": "N.T.M.Dung",
    "Sĩ số": 25,
    "Thời gian học": "19/08/26 đến 19/08/26",
  },
];
