export const BASIC_MEDICAL_EDIT_OPTION_LIMIT = 200;

const BASIC_MEDICAL_REGISTRATION_CODE_PATTERN = /^YC-\d{6}-\d{6}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BasicMedicalRegistrationLookupKey =
  { kind: "id"; value: string } | { kind: "code"; value: string };

type EditableRegistration = {
  created_by: string;
};

export function parseBasicMedicalRegistrationLookupKey(
  value: string,
): BasicMedicalRegistrationLookupKey | null {
  const trimmed = value.trim();
  if (UUID_PATTERN.test(trimmed)) {
    return { kind: "id", value: trimmed.toLowerCase() };
  }

  const normalizedCode = trimmed.toUpperCase();
  return BASIC_MEDICAL_REGISTRATION_CODE_PATTERN.test(normalizedCode)
    ? { kind: "code", value: normalizedCode }
    : null;
}

export function canEditBasicMedicalRegistration(
  registration: EditableRegistration,
  userId: string,
  roles: string[],
) {
  return (
    registration.created_by === userId ||
    roles.some((role) => role === "admin" || role === "staff")
  );
}

export function resolveEditableBasicMedicalRegistration<
  T extends EditableRegistration,
>(registration: T | null, userId: string, roles: string[]) {
  return registration &&
    canEditBasicMedicalRegistration(registration, userId, roles)
    ? registration
    : null;
}

export function boundBasicMedicalEditOptions<T>(options: T[]) {
  return options.slice(0, BASIC_MEDICAL_EDIT_OPTION_LIMIT);
}

export function buildBasicMedicalEditLookupHref(value: string) {
  const lookupKey = parseBasicMedicalRegistrationLookupKey(value);
  if (!lookupKey) return null;

  const params = new URLSearchParams({
    mode: "edit",
    registration: lookupKey.value,
  });
  return `/basic-medical/new?${params.toString()}`;
}
