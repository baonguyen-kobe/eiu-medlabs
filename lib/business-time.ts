import { parseISO } from "date-fns";

export const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function businessTodayString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(now);
}

export function businessToday(now = new Date()): Date {
  return parseISO(businessTodayString(now));
}

export function formatBusinessDate(date: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function isWithinOperatingHours(startTime: string, endTime: string) {
  const start = startTime.slice(0, 5);
  const end = endTime.slice(0, 5);
  return (
    (start >= "07:30" && end <= "11:30" && end > start) ||
    (start >= "12:30" && end <= "16:30" && end > start)
  );
}

function halfHourOptions(fromMinutes: number, toMinutes: number) {
  const values: string[] = [];
  for (let minutes = fromMinutes; minutes <= toMinutes; minutes += 30) {
    values.push(
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return values;
}

export const BASIC_MEDICAL_START_TIMES = halfHourOptions(7 * 60, 20 * 60 + 30);
export const BASIC_MEDICAL_END_TIMES = halfHourOptions(7 * 60 + 30, 21 * 60);

export function isValidBasicMedicalSessionTime(
  startTime: string,
  endTime: string,
) {
  return (
    BASIC_MEDICAL_START_TIMES.includes(startTime) &&
    BASIC_MEDICAL_END_TIMES.includes(endTime) &&
    endTime > startTime
  );
}

export function isClassStartInFuture(
  scheduleDate: string,
  startTime: string,
  now = new Date(),
): boolean {
  if (!scheduleDate || !startTime) return false;
  const time = startTime.slice(0, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    return false;
  }
  const classStart = new Date(`${scheduleDate}T${time}:00+07:00`);
  return classStart.getTime() > now.getTime();
}
