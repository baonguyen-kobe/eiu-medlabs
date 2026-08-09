export type PersonnelUpdateOperation = {
  operation_id: string;
  previous_email: string;
  requested_email: string;
  expected_version: number;
};

export type PersonnelUpdateOperationBinding = {
  previousEmail: string;
  requestedEmail: string;
  expectedVersion: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parsePersonnelUpdateOperation(
  value: unknown,
  binding: PersonnelUpdateOperationBinding,
): PersonnelUpdateOperation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  if (
    typeof row.operation_id !== "string" ||
    !UUID.test(row.operation_id) ||
    typeof row.previous_email !== "string" ||
    !row.previous_email ||
    typeof row.requested_email !== "string" ||
    !row.requested_email ||
    typeof row.expected_version !== "number" ||
    !Number.isInteger(row.expected_version) ||
    row.expected_version < 1
  ) {
    return null;
  }

  const previousEmail = normalizeEmail(row.previous_email);
  const requestedEmail = normalizeEmail(row.requested_email);
  if (
    !previousEmail ||
    !requestedEmail ||
    previousEmail !== normalizeEmail(binding.previousEmail) ||
    requestedEmail !== normalizeEmail(binding.requestedEmail) ||
    row.expected_version !== binding.expectedVersion
  ) {
    return null;
  }

  return {
    operation_id: row.operation_id,
    previous_email: previousEmail,
    requested_email: requestedEmail,
    expected_version: row.expected_version,
  };
}
