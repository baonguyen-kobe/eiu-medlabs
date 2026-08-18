import {
  equipmentImportHeaders,
  normalizeEquipmentImportRowHeaders,
  type EquipmentImportHeader,
} from "@/lib/equipment-import-template";
import { normalizeImportDate, normalizeImportTime } from "@/lib/import-values";
import type { EquipmentRequestStatus } from "@/lib/equipment-requests";

export type EquipmentImportRow = Record<string, unknown>;

export type EquipmentImportFormatIssue = {
  field: EquipmentImportHeader;
  message: string;
};

export function normalizeEquipmentLookupText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEquipmentLookupKey(value: unknown) {
  return normalizeEquipmentLookupText(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeDateTimeTime(value: unknown) {
  if (typeof value === "number" && value >= 1) {
    return normalizeImportTime(value - Math.floor(value));
  }
  const direct = normalizeImportTime(value);
  if (direct) return direct;
  const match = String(value ?? "").match(/(?:^|\s)([0-2]?\d:[0-5]\d)/);
  return match ? normalizeImportTime(match[1]) : null;
}

export function normalizeEquipmentRoom(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^LAB(?=\s*[-_.]?\s*\d)\s*[-_.]?\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[-_/]+(?=[A-Z]\d+$)/, ".");
}

export function normalizeEquipmentRequestCode(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
}

const statusAliases = new Map<string, EquipmentRequestStatus>([
  ["moi", "new"],
  ["new", "new"],
  ["dasoan", "preparing"],
  ["preparing", "preparing"],
  ["dagiao", "handed_over"],
  ["xacnhandagiao", "handed_over"],
  ["handedover", "handed_over"],
  ["datra", "returned"],
  ["returned", "returned"],
  ["hoanthanh", "completed"],
  ["completed", "completed"],
]);

export function normalizeEquipmentStatus(
  value: unknown,
): EquipmentRequestStatus | null {
  return statusAliases.get(normalizeEquipmentLookupKey(value)) ?? null;
}

export const equipmentStatusDisplayLabels: Record<
  EquipmentRequestStatus,
  string
> = {
  new: "Mới",
  preparing: "Đã soạn",
  handed_over: "Xác nhận đã giao",
  returned: "Đã trả",
  completed: "Hoàn Thành",
};

export function equipmentRequestCreatedAtFromCode(value: unknown) {
  const code = normalizeEquipmentRequestCode(value);
  const match = code.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const local = `20${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}` ===
    code
    ? date.toISOString()
    : null;
}

export function equipmentImportDateTime(
  dateValue: unknown,
  timeValue: unknown,
) {
  const date = normalizeImportDate(dateValue);
  const time = normalizeDateTimeTime(timeValue);
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeEquipmentImportRow(row: EquipmentImportRow) {
  const mapped = normalizeEquipmentImportRowHeaders(row);
  const receiveDate = normalizeImportDate(mapped.receive_date);
  const returnDate = normalizeImportDate(mapped.return_date);
  const scheduleDate = normalizeImportDate(mapped.schedule_date);
  const receiveTime = normalizeDateTimeTime(
    mapped.receive_time || mapped.receive_date,
  );
  const returnTime = normalizeDateTimeTime(
    mapped.return_time || mapped.return_date,
  );
  const classStartTime = normalizeDateTimeTime(mapped.class_start_time);
  const status = normalizeEquipmentStatus(mapped.status);

  return {
    ...mapped,
    source_code: normalizeEquipmentRequestCode(mapped.source_code),
    registrant_name: String(mapped.registrant_name ?? "").trim(),
    registrant_email: String(mapped.registrant_email ?? "")
      .trim()
      .toLowerCase(),
    phone: String(mapped.phone ?? "").replace(/\D/g, ""),
    responsible_name: String(mapped.responsible_name ?? "").trim(),
    responsible_email: String(mapped.responsible_email ?? "")
      .trim()
      .toLowerCase(),
    course_code: String(mapped.course_code ?? "")
      .trim()
      .toUpperCase(),
    semester: String(mapped.semester ?? "")
      .trim()
      .toUpperCase(),
    schedule_date: scheduleDate ?? mapped.schedule_date ?? "",
    class_start_time: classStartTime ?? mapped.class_start_time ?? "",
    room: normalizeEquipmentRoom(mapped.room),
    receive_date: receiveDate ?? mapped.receive_date ?? "",
    receive_time: receiveTime ?? mapped.receive_time ?? "",
    return_date: returnDate ?? mapped.return_date ?? "",
    return_time: returnTime ?? mapped.return_time ?? "",
    status: status ?? String(mapped.status ?? "").trim(),
    request_note: String(mapped.request_note ?? "").trim(),
    skill_name: String(mapped.skill_name ?? "").trim(),
    item_name: String(mapped.item_name ?? "").trim(),
    commercial_name: String(mapped.commercial_name ?? "").trim(),
    model: String(mapped.model ?? "").trim(),
    quantity: String(mapped.quantity ?? "").trim(),
    item_note: String(mapped.item_note ?? "").trim(),
  } satisfies EquipmentImportRow;
}

export function getEquipmentImportFormatIssues(
  input: EquipmentImportRow,
): EquipmentImportFormatIssue[] {
  const row = normalizeEquipmentImportRow(input);
  const issues: EquipmentImportFormatIssue[] = [];
  const requiredText: Array<[EquipmentImportHeader, string]> = [
    ["source_code", "mã phiếu nguồn"],
    ["course_code", "mã môn học"],
    ["room", "phòng/Lab"],
    ["skill_name", "kỹ năng/bài thực hành"],
    ["item_name", "tên thiết bị và vật tư"],
  ];
  for (const [field, label] of requiredText) {
    if (!String(row[field] ?? "").trim()) {
      issues.push({ field, message: `Thiếu ${label}` });
    }
  }
  if (!equipmentRequestCreatedAtFromCode(row.source_code)) {
    issues.push({
      field: "source_code",
      message: "Mã phiếu phải có 12 chữ số theo dạng YYMMDDHHMMSS",
    });
  }
  if (!row.registrant_email && !row.registrant_name) {
    issues.push({
      field: "registrant_email",
      message: "Cần có email hoặc tên người đăng ký",
    });
  }
  if (!row.responsible_email && !row.responsible_name) {
    issues.push({
      field: "responsible_email",
      message: "Cần có email hoặc tên giảng viên phụ trách",
    });
  }
  if (row.phone && !/^\d{10}$/.test(String(row.phone))) {
    issues.push({
      field: "phone",
      message: "Số điện thoại phải có đúng 10 chữ số",
    });
  }
  if (!normalizeImportDate(row.schedule_date)) {
    issues.push({ field: "schedule_date", message: "Ngày học không hợp lệ" });
  }
  if (
    row.semester &&
    !["HK1", "HK2", "HK3", "HK4"].includes(String(row.semester))
  ) {
    issues.push({
      field: "semester",
      message: "Học kỳ phải là HK1, HK2, HK3 hoặc HK4",
    });
  }
  if (!normalizeImportTime(row.class_start_time)) {
    issues.push({
      field: "class_start_time",
      message: "Giờ bắt đầu học không hợp lệ",
    });
  }
  if (!normalizeImportDate(row.receive_date)) {
    issues.push({ field: "receive_date", message: "Ngày nhận không hợp lệ" });
  }
  if (!normalizeImportTime(row.receive_time)) {
    issues.push({ field: "receive_time", message: "Giờ nhận không hợp lệ" });
  }
  if (!normalizeImportDate(row.return_date)) {
    issues.push({ field: "return_date", message: "Ngày trả không hợp lệ" });
  }
  if (!normalizeImportTime(row.return_time)) {
    issues.push({ field: "return_time", message: "Giờ trả không hợp lệ" });
  }
  const receiveAt = equipmentImportDateTime(row.receive_date, row.receive_time);
  const returnAt = equipmentImportDateTime(row.return_date, row.return_time);
  if (receiveAt && returnAt && returnAt < receiveAt) {
    issues.push({
      field: "return_time",
      message: "Thời gian trả phải sau hoặc bằng thời gian nhận",
    });
  }
  if (!normalizeEquipmentStatus(row.status)) {
    issues.push({
      field: "status",
      message:
        "Trạng thái phải là Mới, Đã soạn, Đã giao, Đã trả hoặc Hoàn Thành",
    });
  }
  const quantity = Number(row.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    issues.push({
      field: "quantity",
      message: "Số lượng phải là số nguyên từ 1 trở lên",
    });
  }
  return issues;
}

export function hasAllEquipmentImportHeaders(row: EquipmentImportRow) {
  return equipmentImportHeaders.every((header) => header in row);
}
