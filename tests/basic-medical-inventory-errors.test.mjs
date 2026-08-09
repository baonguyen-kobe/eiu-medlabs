import assert from "node:assert/strict";
import test from "node:test";

import { basicMedicalInventoryErrorMessage } from "../lib/basic-medical-inventory-errors.ts";

const fallback = "Không thể cập nhật thiết bị trong phòng.";

test("preserves known Basic Medical inventory validation messages", () => {
  for (const message of [
    "Số lượng Tổng/Tốt/Hư không hợp lệ.",
    "Phòng Y cơ sở không hợp lệ.",
    "Thiết bị Y cơ sở không hợp lệ.",
    "Không tìm thấy phân bổ thiết bị.",
    "Thiết bị đã có lịch sử; hãy ngừng sử dụng và tạo phân bổ mới.",
    "Thiết bị này đã được phân bổ cho phòng.",
    "Không tìm thấy thiết bị trong phòng.",
  ]) {
    assert.equal(basicMedicalInventoryErrorMessage(message, fallback), message);
  }
});

test("preserves only the controlled dynamic quantity message", () => {
  const message = "Số lượng Tốt và Hư phải có tổng bằng 12.";

  assert.equal(basicMedicalInventoryErrorMessage(message, fallback), message);
  assert.equal(
    basicMedicalInventoryErrorMessage(
      "Số lượng Tốt và Hư phải có tổng bằng 12; details: secret.",
      fallback,
    ),
    fallback,
  );
});

test("hides unexpected database details", () => {
  assert.equal(
    basicMedicalInventoryErrorMessage(
      'duplicate key value violates unique constraint "inventory_room_id_key"',
      fallback,
    ),
    fallback,
  );
});
