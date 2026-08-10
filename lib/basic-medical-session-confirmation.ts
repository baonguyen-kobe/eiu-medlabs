export type BasicMedicalSessionConfirmation = {
  confirmationId: string;
  signedAt: string;
  damagedItemCount: number;
};

export function parseBasicMedicalSessionConfirmation(
  value: unknown,
): BasicMedicalSessionConfirmation | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  if (
    typeof row.confirmation_id !== "string" ||
    !row.confirmation_id ||
    typeof row.signed_at !== "string" ||
    !row.signed_at ||
    !Array.isArray(row.damaged_items)
  ) {
    return null;
  }

  return {
    confirmationId: row.confirmation_id,
    signedAt: row.signed_at,
    damagedItemCount: row.damaged_items.length,
  };
}
