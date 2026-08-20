import assert from "node:assert/strict";
import test from "node:test";
import { isClassStartInFuture } from "../lib/business-time.ts";

test("isClassStartInFuture correctly validates class start against Asia/Ho_Chi_Minh business time", () => {
  // Mock current time: 2026-08-19 10:00:00 UTC+7 (which is 2026-08-19 03:00:00Z)
  const now = new Date("2026-08-19T03:00:00Z"); // 10:00 in +07:00

  // 1. Today 09:59 (1 minute before class at 10:00) -> claimable
  const nowBefore = new Date("2026-08-19T02:59:00Z"); // 09:59 in +07:00
  assert.equal(
    isClassStartInFuture("2026-08-19", "10:00", nowBefore),
    true,
    "Class at 10:00 evaluated at 09:59 should be claimable",
  );

  // 2. Today 10:00 (exact start time) -> NOT claimable
  assert.equal(
    isClassStartInFuture("2026-08-19", "10:00", now),
    false,
    "Class at 10:00 evaluated at exact 10:00 should NOT be claimable",
  );

  // 3. Today 10:01 (1 minute after class start) -> NOT claimable
  const nowAfter = new Date("2026-08-19T03:01:00Z"); // 10:01 in +07:00
  assert.equal(
    isClassStartInFuture("2026-08-19", "10:00", nowAfter),
    false,
    "Class at 10:00 evaluated at 10:01 should NOT be claimable",
  );

  // 4. Future date (e.g. tomorrow 2026-08-20 07:30) -> claimable
  assert.equal(
    isClassStartInFuture("2026-08-20", "07:30", now),
    true,
    "Tomorrow class should be claimable",
  );

  // 5. Past date (e.g. yesterday 2026-08-18 15:00) -> NOT claimable
  assert.equal(
    isClassStartInFuture("2026-08-18", "15:00", now),
    false,
    "Yesterday class should NOT be claimable",
  );

  // 6. Invalid inputs return false
  assert.equal(isClassStartInFuture("", "10:00", now), false);
  assert.equal(isClassStartInFuture("2026-08-19", "", now), false);
  assert.equal(isClassStartInFuture("invalid-date", "10:00", now), false);
});
