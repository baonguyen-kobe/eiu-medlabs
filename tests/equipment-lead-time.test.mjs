import assert from "node:assert/strict";
import test from "node:test";
import {
  EQUIPMENT_MIN_LEAD_TIME_MS,
  equipmentLeadTime,
  equipmentReceiveAt,
  formatEquipmentLeadTime,
  lateEquipmentWarning,
} from "../lib/equipment-lead-time.ts";

test("đúng 24 giờ không cần duyệt đăng ký trễ", () => {
  const now = new Date("2026-08-04T01:00:00.000Z");
  const receiveAt = new Date(now.getTime() + EQUIPMENT_MIN_LEAD_TIME_MS);
  assert.deepEqual(equipmentLeadTime(receiveAt, now), {
    remainingMs: EQUIPMENT_MIN_LEAD_TIME_MS,
    isExpired: false,
    requiresLateApproval: false,
  });
});

test("trên 0 nhưng dưới 24 giờ cần duyệt", () => {
  const now = new Date("2026-08-04T01:00:00.000Z");
  const remainingMs = (18 * 60 + 30) * 60_000;
  const result = equipmentLeadTime(new Date(now.getTime() + remainingMs), now);
  assert.equal(result.requiresLateApproval, true);
  assert.equal(formatEquipmentLeadTime(result.remainingMs), "18 giờ 30 phút");
  assert.equal(
    lateEquipmentWarning(result.remainingMs),
    "Thời gian chuẩn bị còn 18 giờ 30 phút, thấp hơn quy định tối thiểu 24 giờ. Phiếu này cần được phê duyệt.",
  );
});

test("thời gian nhận đã đến hoặc đã qua không hợp lệ", () => {
  const now = new Date("2026-08-04T01:00:00.000Z");
  assert.equal(equipmentLeadTime(now, now).isExpired, true);
  assert.equal(
    equipmentLeadTime(new Date(now.getTime() - 1), now).isExpired,
    true,
  );
});

test("ngày giờ nhận được hiểu theo múi giờ Việt Nam", () => {
  assert.equal(
    equipmentReceiveAt("2026-08-05", "09:00")?.toISOString(),
    "2026-08-05T02:00:00.000Z",
  );
  assert.equal(equipmentReceiveAt("05/08/2026", "09:00"), null);
});
