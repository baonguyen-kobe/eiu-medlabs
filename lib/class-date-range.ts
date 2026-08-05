import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { businessToday } from "@/lib/business-time";

export type ClassRangeMode = "default" | "week" | "month" | "day" | "custom";

export type ClassDateRange = {
  from: string;
  to: string;
  mode: ClassRangeMode;
  anchor: string;
  error?: string;
};

function validDate(value?: string) {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function defaultRange(error?: string): ClassDateRange {
  const today = businessToday();
  return {
    from: format(startOfMonth(addMonths(today, -1)), "yyyy-MM-dd"),
    to: format(endOfMonth(addMonths(today, 1)), "yyyy-MM-dd"),
    mode: "default",
    anchor: format(today, "yyyy-MM-dd"),
    error,
  };
}

export function resolveClassDateRange(params: {
  period?: string;
  date?: string;
  from?: string;
  to?: string;
}): ClassDateRange {
  const mode = params.period as ClassRangeMode | undefined;
  if (!mode || mode === "default") return defaultRange();

  if (mode === "custom") {
    const from = validDate(params.from);
    const to = validDate(params.to);
    if (!from || !to || isAfter(from, to)) {
      return defaultRange(
        "Khoảng ngày không hợp lệ; hệ thống đã dùng phạm vi mặc định.",
      );
    }
    if (isAfter(to, addMonths(from, 6))) {
      return defaultRange("Mỗi lần chỉ được lọc tối đa 6 tháng.");
    }
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
      mode,
      anchor: format(from, "yyyy-MM-dd"),
    };
  }

  const anchor = validDate(params.date) ?? businessToday();
  if (mode === "week") {
    const from = startOfWeek(anchor, { weekStartsOn: 1 });
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(endOfWeek(anchor, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      mode,
      anchor: format(anchor, "yyyy-MM-dd"),
    };
  }
  if (mode === "month") {
    return {
      from: format(startOfMonth(anchor), "yyyy-MM-dd"),
      to: format(endOfMonth(anchor), "yyyy-MM-dd"),
      mode,
      anchor: format(anchor, "yyyy-MM-dd"),
    };
  }
  if (mode === "day") {
    const date = format(anchor, "yyyy-MM-dd");
    return { from: date, to: date, mode, anchor: date };
  }
  return defaultRange();
}
