export const EQUIPMENT_SIGNATURE_CLEANUP_OWNED =
  "EQUIPMENT_SIGNATURE_CLEANUP_OWNED";

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
}: {
  createdByThisAttempt: boolean;
  finalizeError: unknown;
  deleteObject: () => Promise<void>;
}) {
  if (
    !createdByThisAttempt ||
    !isEquipmentSignatureCleanupOwnedError(finalizeError)
  ) {
    return false;
  }

  await deleteObject();
  return true;
}
