import "server-only";

export function isBasicMedicalConfirmationEvidenceEnabled() {
  return process.env.BASIC_MEDICAL_CONFIRMATION_EVIDENCE_ENABLED === "true";
}
