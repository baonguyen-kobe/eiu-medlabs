import {
  isExportTkbRow,
  normalizeImportRowHeaders,
} from "@/lib/import-template";

export type ImportValueRow = Record<string, unknown>;

export type ImportFormatIssue = {
  field: string;
  message: string;
};

function normalizeLookupText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}

export function normalizeCourseLookupKey(value: unknown): string {
  return normalizeLookupText(value).replace(/[^a-z0-9]+/g, "");
}

export function normalizeLecturerLookupKey(value: unknown): string {
  const tokens = normalizeLookupText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return "";
  return (
    tokens
      .slice(0, -1)
      .map((token) => token[0])
      .join("") + tokens.at(-1)
  );
}

const excelEpoch = Date.UTC(1899, 11, 30);
const millisecondsPerDay = 86_400_000;

function validIsoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function excelSerialToDate(value: number): string | null {
  if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null;
  const candidate = new Date(
    excelEpoch + Math.floor(value) * millisecondsPerDay,
  );
  return validIsoDate(
    candidate.getUTCFullYear(),
    candidate.getUTCMonth() + 1,
    candidate.getUTCDate(),
  );
}

export function normalizeImportDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return validIsoDate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }
  if (typeof value === "number") return excelSerialToDate(value);

  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return excelSerialToDate(Number(text));

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return validIsoDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const dayFirstMatch = text.match(
    /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s+.*)?$/,
  );
  if (!dayFirstMatch) return null;
  const parsedYear = Number(dayFirstMatch[3]);
  return validIsoDate(
    parsedYear < 100 ? 2000 + parsedYear : parsedYear,
    Number(dayFirstMatch[2]),
    Number(dayFirstMatch[1]),
  );
}

function minutesToTime(totalMinutes: number): string | null {
  if (!Number.isFinite(totalMinutes)) return null;
  const roundedMinutes = Math.round(totalMinutes);
  if (roundedMinutes < 0 || roundedMinutes >= 24 * 60) return null;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeExportTkbStart(value: unknown): string | null {
  const slot = Number(String(value ?? "").trim());
  if (!Number.isInteger(slot) || slot < 1) return null;
  return minutesToTime(7 * 60 + slot * 30);
}

function normalizeExportTkbEnd(
  startValue: unknown,
  durationValue: unknown,
): string | null {
  const slot = Number(String(startValue ?? "").trim());
  const duration = Number(String(durationValue ?? "").trim());
  if (
    !Number.isInteger(slot) ||
    slot < 1 ||
    !Number.isInteger(duration) ||
    duration < 1
  ) {
    return null;
  }
  return minutesToTime(7 * 60 + (slot + duration) * 30);
}

function normalizeExportTkbRoomCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^lab(?=\s*[-_.]?\s*\d)\s*[-_.]?\s*/i, "");
}

export function normalizeImportTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return minutesToTime(value.getHours() * 60 + value.getMinutes());
  }
  if (typeof value === "number") {
    return value >= 0 && value < 1 ? minutesToTime(value * 24 * 60) : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^(?:0(?:\.\d+)?|\.\d+)$/.test(text)) {
    return minutesToTime(Number(text) * 24 * 60);
  }

  const timeMatch = text.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  }

  const twelveHourMatch = text.match(
    /^(0?\d|1[0-2]):([0-5]\d)\s*([AP])\.?M\.?$/i,
  );
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]) % 12;
    if (twelveHourMatch[3].toUpperCase() === "P") hours += 12;
    return minutesToTime(hours * 60 + Number(twelveHourMatch[2]));
  }

  const isoTimeMatch = text.match(/T([01]\d|2[0-3]):([0-5]\d)/);
  return isoTimeMatch ? `${isoTimeMatch[1]}:${isoTimeMatch[2]}` : null;
}

export function normalizeImportRowValues(row: ImportValueRow): ImportValueRow {
  const exportTkb = isExportTkbRow(row);
  const normalizedRow = normalizeImportRowHeaders(row);
  const scheduleDate = normalizeImportDate(normalizedRow.schedule_date);
  const startTime = exportTkb
    ? normalizeExportTkbStart(normalizedRow.start_time)
    : normalizeImportTime(normalizedRow.start_time);
  const endTime = exportTkb
    ? normalizeExportTkbEnd(normalizedRow.start_time, normalizedRow.end_time)
    : normalizeImportTime(normalizedRow.end_time);
  const combinedRoom = exportTkb
    ? String(normalizedRow.room_code ?? "").trim()
    : "";
  const roomParts = combinedRoom.match(/^(.+)\.([^.]+)$/);
  const roomCode = exportTkb
    ? normalizeExportTkbRoomCode(roomParts?.[1] ?? combinedRoom)
    : String(normalizedRow.room_code ?? "").trim();
  return {
    ...normalizedRow,
    schedule_date: scheduleDate ?? normalizedRow.schedule_date ?? "",
    start_time: startTime ?? normalizedRow.start_time ?? "",
    end_time: endTime ?? normalizedRow.end_time ?? "",
    room_code: roomCode,
    building_code: roomParts?.[2]?.trim() ?? normalizedRow.building_code ?? "",
  };
}

export function getImportFormatIssues(
  row: ImportValueRow,
): ImportFormatIssue[] {
  const issues: ImportFormatIssue[] = [];
  const dateValue = String(row.schedule_date ?? "").trim();
  const startValue = String(row.start_time ?? "").trim();
  const endValue = String(row.end_time ?? "").trim();
  const scheduleDate = normalizeImportDate(row.schedule_date);
  const startTime = normalizeImportTime(row.start_time);
  const endTime = normalizeImportTime(row.end_time);

  if (!dateValue) {
    issues.push({ field: "schedule_date", message: "Thiếu ngày học" });
  } else if (!scheduleDate) {
    issues.push({
      field: "schedule_date",
      message: "Ngày không hợp lệ; dùng dd/mm/yyyy, yyyy-mm-dd hoặc ngày Excel",
    });
  }
  if (!startValue) {
    issues.push({ field: "start_time", message: "Thiếu giờ bắt đầu" });
  } else if (!startTime) {
    issues.push({ field: "start_time", message: "Giờ bắt đầu không hợp lệ" });
  }
  if (!endValue) {
    issues.push({ field: "end_time", message: "Thiếu giờ kết thúc" });
  } else if (!endTime) {
    issues.push({ field: "end_time", message: "Giờ kết thúc không hợp lệ" });
  }
  if (startTime && endTime && endTime <= startTime) {
    issues.push({
      field: "end_time",
      message: "Giờ kết thúc phải sau giờ bắt đầu",
    });
  }

  for (const [field, label] of [
    ["course_code", "mã môn học"],
    ["course_name", "tên môn học"],
    ["room_code", "mã phòng"],
    ["building_code", "mã tòa nhà"],
  ] as const) {
    if (!String(row[field] ?? "").trim()) {
      issues.push({ field, message: `Thiếu ${label}` });
    }
  }
  const studentCount = Number(String(row.student_count ?? "").trim());
  if (!Number.isInteger(studentCount) || studentCount < 1) {
    issues.push({
      field: "student_count",
      message: "Số sinh viên phải là số nguyên từ 1 trở lên",
    });
  }
  return issues;
}

export function formatImportDate(value: unknown): string {
  const normalized = normalizeImportDate(value);
  if (!normalized) return String(value ?? "");
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}
