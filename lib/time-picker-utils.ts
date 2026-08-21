export const TIME_PICKER_HOURS = [
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
] as const;

export const TIME_PICKER_MINUTES = ["00", "30"] as const;

export const MORNING_SHIFT_ALLOWED_TIMES: readonly string[] = [
  "07:00",
  "07:30",
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
];

export const AFTERNOON_SHIFT_ALLOWED_TIMES: readonly string[] = [
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
];

/**
 * Standard default half-hour options from 07:00 to 19:30.
 */
export const DEFAULT_TIME_PICKER_ALLOWED_VALUES: readonly string[] =
  TIME_PICKER_HOURS.flatMap((h) => [`${h}:00`, `${h}:30`]);

/**
 * Check if a time value is valid.
 * If `allowedValues` is provided, strictly checks presence in `allowedValues`.
 * Otherwise, verifies 24h HH:mm format between 07:00 and 19:30 (step 30 min).
 */
export function isValidTime(
  value: string | null | undefined,
  allowedValues?: readonly string[],
): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  if (allowedValues && allowedValues.length > 0) {
    return allowedValues.includes(trimmed);
  }
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = match[1];
  const minute = match[2];
  const hourNum = parseInt(hour, 10);
  return hourNum >= 7 && hourNum <= 19 && (minute === "00" || minute === "30");
}

/**
 * Extract unique hour strings ("07", "08", ...) from allowedValues or default hours.
 */
export function getHoursForAllowedValues(
  allowedValues?: readonly string[],
): readonly string[] {
  if (!allowedValues || allowedValues.length === 0) {
    return TIME_PICKER_HOURS;
  }
  const hoursSet = new Set<string>();
  for (const val of allowedValues) {
    if (val.length >= 2) {
      hoursSet.add(val.slice(0, 2));
    }
  }
  return Array.from(hoursSet).sort();
}

/**
 * Extract available minute strings ("00", "30") for a selected hour.
 */
export function getMinutesForHour(
  hour: string | null | undefined,
  allowedValues?: readonly string[],
): readonly string[] {
  if (!hour) {
    return TIME_PICKER_MINUTES;
  }
  if (!allowedValues || allowedValues.length === 0) {
    return TIME_PICKER_MINUTES;
  }
  const prefix = `${hour}:`;
  const minutes = allowedValues
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(3, 5));
  return minutes.length > 0 ? minutes : TIME_PICKER_MINUTES;
}

/**
 * Generate a friendly default invalid message based on allowed values.
 */
export function getDefaultInvalidMessage(
  allowedValues?: readonly string[],
): string {
  if (allowedValues && allowedValues.length > 0) {
    const minVal = allowedValues[0];
    const maxVal = allowedValues[allowedValues.length - 1];
    return `Vui lòng chọn hoặc nhập giờ từ ${minVal} đến ${maxVal} (bước 30 phút).`;
  }
  return "Vui lòng nhập giờ từ 07:00 đến 19:30 (bước 30 phút, ví dụ: 07:30).";
}
