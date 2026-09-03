import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("updateEquipmentRequest prevalidation preserves historical responsible lecturer", () => {
  const source = readFileSync(
    new URL("../app/equipment/actions.ts", import.meta.url),
    "utf8",
  );

  // Assertion A: updateEquipmentRequest's request SELECT contains responsible_lecturer_id between registrant_id and status in exact field list
  assert.match(
    source,
    /"id,class_schedule_id,registrant_id,responsible_lecturer_id,status,semester,receive_at,late_approval_status,late_registration_reason"/,
  );

  // Assertion B: source contains exactly the preservation comparison
  assert.match(
    source,
    /const preservesResponsibleLecturer =\s*responsibleId === request\.responsible_lecturer_id;/,
  );

  // Assertion C: responsible rejection is guarded by !preservesResponsibleLecturer before responsibleId !== request.registrant_id and !eligibleLecturerIds.has(responsibleId)
  assert.match(
    source,
    /if\s*\(\s*!preservesResponsibleLecturer\s*&&\s*responsibleId !== request\.registrant_id\s*&&\s*!eligibleLecturerIds\.has\(responsibleId\)\s*\)\s*\{\s*return\s*\{\s*ok:\s*false,\s*message:\s*"Giảng viên phụ trách không hợp lệ\."\s*\};\s*\}/,
  );
});
