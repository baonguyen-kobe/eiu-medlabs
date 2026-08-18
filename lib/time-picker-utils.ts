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

export function isValidTime(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  const hour = match[1];
  const minute = match[2];
  const hourNum = parseInt(hour, 10);
  return hourNum >= 7 && hourNum <= 19 && (minute === "00" || minute === "30");
}
