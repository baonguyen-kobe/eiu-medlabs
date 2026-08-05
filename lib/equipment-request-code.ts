import {
  formatTimestampRecordCode,
  timestampRecordCodeBounds,
} from "@/lib/timestamp-record-code";

export function formatEquipmentRequestCode(createdAt: string) {
  return formatTimestampRecordCode(createdAt);
}

export function equipmentRequestCodeBounds(value: string) {
  return timestampRecordCodeBounds(value);
}
