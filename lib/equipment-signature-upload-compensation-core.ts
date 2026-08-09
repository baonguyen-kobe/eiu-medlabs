export const EQUIPMENT_SIGNATURE_CLEANUP_OWNED =
  "EQUIPMENT_SIGNATURE_CLEANUP_OWNED";

export type EquipmentSignatureUploadCompensationResult =
  "not-needed" | "deleted" | "marked" | "marker-failed";

export function isEquipmentSignatureCleanupOwnedError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === EQUIPMENT_SIGNATURE_CLEANUP_OWNED
  );
}

export async function compensateCleanupOwnedSignatureUpload({
  createdByThisAttempt,
  finalizeError,
  deleteObject,
  markForCleanup,
}: {
  createdByThisAttempt: boolean;
  finalizeError: unknown;
  deleteObject: () => Promise<void>;
  markForCleanup: () => Promise<void>;
}) {
  if (
    !createdByThisAttempt ||
    !isEquipmentSignatureCleanupOwnedError(finalizeError)
  ) {
    return "not-needed" as const;
  }

  try {
    await deleteObject();
    return "deleted" as const;
  } catch {
    try {
      await markForCleanup();
      return "marked" as const;
    } catch {
      return "marker-failed" as const;
    }
  }
}
