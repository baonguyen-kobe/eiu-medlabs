export const EQUIPMENT_REGISTER_SELECTOR_LIMIT = 200;

export function prependSelectedOption<Option extends { id: string }>(
  options: Option[],
  selectedOption: Option | null | undefined,
) {
  if (!selectedOption || options.some(({ id }) => id === selectedOption.id)) {
    return options;
  }
  return [selectedOption, ...options];
}
