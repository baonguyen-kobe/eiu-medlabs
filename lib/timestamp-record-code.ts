const timestampCodeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatTimestampRecordCode(createdAt: string) {
  const parts = timestampCodeFormatter.formatToParts(new Date(createdAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}${part("hour")}${part("minute")}${part("second")}`;
}

export function timestampRecordCodeBounds(value: string) {
  const code = value.replace(/\D/g, "");
  if (!/^\d{12}$/.test(code)) return null;
  const [, year, month, day, hour, minute, second] =
    code.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/) ?? [];
  const start = new Date(
    `20${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`,
  );
  if (Number.isNaN(start.getTime())) return null;
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + 1000).toISOString(),
  };
}
