import { createHash } from "node:crypto";

function withLength(value: string) {
  return `${[...value].length}:${value}`;
}

function canonicalTime(value: string) {
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
}

export function canonicalImportScheduleBusinessKey(input: {
  courseCode: string;
  roomId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
}) {
  return [
    input.courseCode.trim().toUpperCase(),
    input.roomId,
    input.scheduleDate,
    canonicalTime(input.startTime),
    canonicalTime(input.endTime),
  ]
    .map(withLength)
    .join("");
}

export function createImportScheduleHash(
  input: Parameters<typeof canonicalImportScheduleBusinessKey>[0],
) {
  return createHash("sha256")
    .update(canonicalImportScheduleBusinessKey(input), "utf8")
    .digest("hex");
}
