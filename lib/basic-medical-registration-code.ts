import { formatTimestampRecordCode } from "@/lib/timestamp-record-code";

export function formatBasicMedicalRegistrationCode(value: string) {
  return /^YC-\d{6}-\d{6}$/i.test(value.trim())
    ? value.trim().toUpperCase()
    : formatTimestampRecordCode(value);
}

export function normalizeBasicMedicalRegistrationCode(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^YC-\d{6}-\d{6}$/.test(normalized) ? normalized : null;
}
