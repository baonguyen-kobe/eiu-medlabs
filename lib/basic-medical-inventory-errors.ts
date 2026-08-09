const knownInventoryMessages = new Set([
  "Số lượng Tổng/Tốt/Hư không hợp lệ.",
  "Phòng Y cơ sở không hợp lệ.",
  "Thiết bị Y cơ sở không hợp lệ.",
  "Không tìm thấy phân bổ thiết bị.",
  "Thiết bị đã có lịch sử; hãy ngừng sử dụng và tạo phân bổ mới.",
  "Thiết bị này đã được phân bổ cho phòng.",
  "Không tìm thấy thiết bị trong phòng.",
]);

const quantityTotalMessage = /^Số lượng Tốt và Hư phải có tổng bằng \d+\.$/;

export function basicMedicalInventoryErrorMessage(
  message: string | null | undefined,
  fallback: string,
) {
  if (
    message &&
    (knownInventoryMessages.has(message) || quantityTotalMessage.test(message))
  ) {
    return message;
  }

  return fallback;
}
