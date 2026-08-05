export const EQUIPMENT_MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

export type EquipmentLeadTime = {
  remainingMs: number;
  isExpired: boolean;
  requiresLateApproval: boolean;
};

export function equipmentReceiveAt(
  receiveDate: string,
  receiveTime: string,
): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(receiveDate) ||
    !/^\d{2}:\d{2}$/.test(receiveTime)
  ) {
    return null;
  }
  const value = new Date(`${receiveDate}T${receiveTime}:00+07:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function equipmentLeadTime(
  receiveAt: Date,
  now: Date = new Date(),
): EquipmentLeadTime {
  const remainingMs = receiveAt.getTime() - now.getTime();
  return {
    remainingMs,
    isExpired: remainingMs <= 0,
    requiresLateApproval:
      remainingMs > 0 && remainingMs < EQUIPMENT_MIN_LEAD_TIME_MS,
  };
}

export function formatEquipmentLeadTime(remainingMs: number) {
  const totalMinutes = Math.max(0, Math.floor(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} giờ ${minutes} phút`;
}

export function lateEquipmentWarning(remainingMs: number) {
  return `Thời gian chuẩn bị còn ${formatEquipmentLeadTime(remainingMs)}, thấp hơn quy định tối thiểu 24 giờ. Phiếu này cần được phê duyệt.`;
}
