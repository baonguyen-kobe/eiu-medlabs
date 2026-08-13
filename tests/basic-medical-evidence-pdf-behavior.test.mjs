import assert from "node:assert/strict";
import test from "node:test";
import { createBasicMedicalEvidencePdf } from "../lib/basic-medical-evidence-pdf.ts";

const validSignature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function evidenceWith(checks) {
  return {
    confirmation_id: "10000000-0000-0000-0000-000000000001",
    registration_id_snapshot: "10000000-0000-0000-0000-000000000002",
    class_schedule_id_snapshot: "10000000-0000-0000-0000-000000000003",
    signer_id: "10000000-0000-0000-0000-000000000004",
    signature_data: validSignature,
    schedule_date_snapshot: "2042-08-11",
    start_time_snapshot: "08:00:00",
    end_time_snapshot: "10:00:00",
    room_id_snapshot: "10000000-0000-0000-0000-000000000005",
    teaching_lecturer_id_snapshot: "10000000-0000-0000-0000-000000000006",
    course_code_snapshot: "YCS-101",
    course_name_snapshot: "Thực hành Y cơ sở bằng tiếng Việt",
    room_code_snapshot: "P.101",
    building_code_snapshot: "A",
    room_name_snapshot: "Phòng thực hành điều dưỡng",
    teaching_lecturer_name_snapshot: "Nguyễn Thị Giảng Viên",
    signer_name_snapshot: "Nguyễn Thị Người Ký",
    display_snapshots_available: true,
    signed_at: "2042-08-11T03:15:00.000Z",
    invalidated_at: null,
    invalidated_reason: null,
    equipment_checks: checks,
  };
}

function equipmentCheck(index, suffix = "") {
  return {
    inventory_id: `20000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    item_name_snapshot: `Thiết bị thực hành ${index} ${suffix}`,
    commercial_name_snapshot: `Tên thương mại ${index} ${suffix}`,
    unit_snapshot: "bộ",
    total_before: 8,
    good_before: 7,
    damaged_before: 1,
    newly_damaged_quantity: index % 2,
    total_after: 8,
    good_after: 7 - (index % 2),
    damaged_after: 1 + (index % 2),
  };
}

async function assertValidPdf(evidence) {
  const output = await createBasicMedicalEvidencePdf(evidence);
  assert.ok(Buffer.isBuffer(output));
  assert.ok(output.length > 1_000);
  assert.deepEqual(output.subarray(0, 4), Buffer.from("%PDF"));
  return output;
}

test("generator produces a valid Vietnamese snapshot PDF with a real PNG signature", async () => {
  await assertValidPdf(evidenceWith([equipmentCheck(1)]));
});

test("generator produces a valid PDF for an empty equipment snapshot", async () => {
  await assertValidPdf(evidenceWith([]));
});

test("generator paginates long wrapped equipment snapshots without throwing", async () => {
  const longText =
    "Thiết bị Y cơ sở có tên hiển thị dài để kiểm tra xuống dòng an toàn ".repeat(
      5,
    );
  const output = await assertValidPdf(
    evidenceWith(
      Array.from({ length: 80 }, (_, index) =>
        equipmentCheck(index + 1, longText),
      ),
    ),
  );
  assert.ok(
    (output.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 1,
  );
});
