/**
 * Converts the two staged values from the room-inventory editor only after
 * both prompts have completed. Callers must handle `null` (Cancel) before
 * calling this function, so Cancel can never be reinterpreted as zero.
 */
export function parseBasicMedicalInventoryQuantityEdit(totalRaw, damagedRaw) {
  const totalText = totalRaw.trim();
  const damagedText = damagedRaw.trim();
  if (!/^\d+$/.test(totalText) || !/^\d+$/.test(damagedText)) {
    return { ok: false, message: "Số lượng phải là số nguyên không âm." };
  }
  const totalQuantity = Number(totalText);
  const damagedQuantity = Number(damagedText);
  if (
    !Number.isSafeInteger(totalQuantity) ||
    !Number.isSafeInteger(damagedQuantity) ||
    damagedQuantity > totalQuantity
  ) {
    return {
      ok: false,
      message: "Số lượng Hư phải là số nguyên không vượt quá Tổng.",
    };
  }
  return { ok: true, totalQuantity, damagedQuantity };
}
