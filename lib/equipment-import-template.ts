export const equipmentImportHeaders = [
  "source_code",
  "registrant_name",
  "registrant_email",
  "phone",
  "responsible_name",
  "responsible_email",
  "course_code",
  "semester",
  "schedule_date",
  "class_start_time",
  "room",
  "receive_date",
  "receive_time",
  "return_date",
  "return_time",
  "status",
  "request_note",
  "skill_name",
  "item_name",
  "commercial_name",
  "model",
  "quantity",
  "item_note",
] as const;

export type EquipmentImportHeader = (typeof equipmentImportHeaders)[number];

export const equipmentImportHeaderLabels: Record<
  EquipmentImportHeader,
  string
> = {
  source_code: "Mã phiếu nguồn",
  registrant_name: "Người đăng ký",
  registrant_email: "Email người đăng ký",
  phone: "Số điện thoại",
  responsible_name: "Giảng viên phụ trách",
  responsible_email: "Email giảng viên phụ trách",
  course_code: "Mã môn học",
  semester: "Học kỳ",
  schedule_date: "Ngày học",
  class_start_time: "Giờ bắt đầu học",
  room: "Phòng/Lab",
  receive_date: "Ngày nhận",
  receive_time: "Giờ nhận",
  return_date: "Ngày trả",
  return_time: "Giờ trả",
  status: "Trạng thái",
  request_note: "Ghi chú chung",
  skill_name: "Kỹ năng/Bài thực hành",
  item_name: "Tên thiết bị và vật tư",
  commercial_name: "Tên thương mại",
  model: "Model",
  quantity: "Số lượng",
  item_note: "Ghi chú thiết bị",
};

export const equipmentImportDisplayHeaders = equipmentImportHeaders.map(
  (header) => equipmentImportHeaderLabels[header],
);

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const headerByAlias = new Map<string, EquipmentImportHeader>();
for (const header of equipmentImportHeaders) {
  headerByAlias.set(normalizeHeader(header), header);
  headerByAlias.set(
    normalizeHeader(equipmentImportHeaderLabels[header]),
    header,
  );
}

const legacyAliases: Record<string, EquipmentImportHeader> = {
  iddexuat: "source_code",
  maphieu: "source_code",
  tennguoidangky: "registrant_name",
  email: "registrant_email",
  sodienthoai: "phone",
  giangvienphutrach: "responsible_name",
  mamonhoc: "course_code",
  hocky: "semester",
  hocki: "semester",
  ngayhoc: "schedule_date",
  giohoc: "class_start_time",
  phonglab: "room",
  ngaynhan: "receive_date",
  gionhan: "receive_time",
  ngaytra: "return_date",
  giotra: "return_time",
  trangthai: "status",
  ghichu: "request_note",
  kynang: "skill_name",
  baithuchanh: "skill_name",
  tenthietbivattu: "item_name",
  tenthuongmai: "commercial_name",
  soluong: "quantity",
  ghichuthietbi: "item_note",
};

for (const [alias, header] of Object.entries(legacyAliases)) {
  headerByAlias.set(alias, header);
}

export function normalizeEquipmentImportRowHeaders(
  row: Record<string, unknown>,
) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const header = headerByAlias.get(normalizeHeader(key));
    if (header) normalized[header] = value;
  }
  return normalized;
}

export function toEquipmentImportDisplayRow(row: Record<string, unknown>) {
  return Object.fromEntries(
    equipmentImportHeaders.map((header) => [
      equipmentImportHeaderLabels[header],
      row[header] ?? "",
    ]),
  );
}

export const equipmentImportSamples = [
  {
    source_code: "260803090005",
    registrant_name: "Nguyễn Văn A",
    registrant_email: "nguyenvana@eiu.edu.vn",
    phone: "0901000001",
    responsible_name: "Nguyễn Văn A",
    responsible_email: "nguyenvana@eiu.edu.vn",
    course_code: "BSC 112",
    semester: "HK1",
    schedule_date: "19/08/2026",
    class_start_time: "07:30",
    room: "322.B10",
    receive_date: "18/08/2026",
    receive_time: "16:00",
    return_date: "19/08/2026",
    return_time: "11:00",
    status: "Mới",
    request_note: "Dòng ví dụ — xóa hoặc thay dữ liệu trước khi import",
    skill_name: "Đo dấu hiệu sinh tồn",
    item_name: "Máy đo huyết áp",
    commercial_name: "Omron HEM-7120",
    model: "HEM-7120",
    quantity: 2,
    item_note: "Kèm vòng bít người lớn",
  },
  {
    source_code: "260803090005",
    registrant_name: "Nguyễn Văn A",
    registrant_email: "nguyenvana@eiu.edu.vn",
    phone: "0901000001",
    responsible_name: "Nguyễn Văn A",
    responsible_email: "nguyenvana@eiu.edu.vn",
    course_code: "BSC 112",
    semester: "HK1",
    schedule_date: "19/08/2026",
    class_start_time: "07:30",
    room: "322.B10",
    receive_date: "18/08/2026",
    receive_time: "16:00",
    return_date: "19/08/2026",
    return_time: "11:00",
    status: "Mới",
    request_note: "Dòng ví dụ — cùng mã phiếu sẽ được gom chung",
    skill_name: "Đo dấu hiệu sinh tồn",
    item_name: "Ống nghe",
    commercial_name: "Littmann Classic III",
    model: "Classic III",
    quantity: 2,
    item_note: "",
  },
];
