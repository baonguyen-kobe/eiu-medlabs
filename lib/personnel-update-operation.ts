export type PersonnelUpdateOperation = {
  operation_id: string;
  previous_email: string;
  requested_email: string;
  expected_version: number;
};

export function parsePersonnelUpdateOperation(
  value: unknown,
): PersonnelUpdateOperation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  if (
    typeof row.operation_id !== "string" ||
    !row.operation_id ||
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

  return {
    operation_id: row.operation_id,
    previous_email: row.previous_email,
    requested_email: row.requested_email,
    expected_version: row.expected_version,
  };
}
