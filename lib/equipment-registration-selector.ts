export const EQUIPMENT_REGISTER_SELECTOR_LIMIT = 200;

export type ScheduleDiscoveryQuery =
  { kind: "date"; value: string } | { kind: "course_code"; value: string };

export function parseScheduleDiscoveryQuery(
  value: string | undefined,
): ScheduleDiscoveryQuery | null {
  const query = value?.trim().replace(/[%_]/g, "").slice(0, 80) ?? "";
  if (!query) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(query)) {
    return { kind: "date", value: query };
  }
  return { kind: "course_code", value: query };
}

export function matchesScheduleDiscoveryQuery(
  schedule: { schedule_date: string; course_code_snapshot: string },
  query: ScheduleDiscoveryQuery,
) {
  return query.kind === "date"
    ? schedule.schedule_date === query.value
    : schedule.course_code_snapshot
        .toLocaleLowerCase("vi")
        .includes(query.value.toLocaleLowerCase("vi"));
}

export function scheduleSelectorOptions<Option>(
  initialOptions: Option[],
  discoveredOptions: Option[],
  discoveryQuery: ScheduleDiscoveryQuery | null,
) {
  return discoveryQuery ? discoveredOptions : initialOptions;
}

export function prependSelectedOption<Option extends { id: string }>(
  options: Option[],
  selectedOption: Option | null | undefined,
) {
  if (!selectedOption || options.some(({ id }) => id === selectedOption.id)) {
    return options;
  }
  return [selectedOption, ...options];
}
