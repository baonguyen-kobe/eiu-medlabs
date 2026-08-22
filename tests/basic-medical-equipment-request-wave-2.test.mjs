import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Wave 2 creates Basic Medical requests through the shared guarded RPC", async () => {
  const actions = await source("app/basic-medical/registrations/actions.ts");

  assert.match(actions, /createBasicMedicalEquipmentRequest/);
  assert.match(actions, /basic_medical_registration_sessions/);
  assert.match(actions, /basic_medical_equipment_catalog/);
  assert.match(actions, /create_equipment_request_with_items/);
  assert.match(actions, /skill_name: source\.lesson_title/);
  assert.match(actions, /error\?\.code === "23505"/);
  assert.match(actions, /Buổi học này đã có phiếu đăng ký thiết bị/);
  assert.doesNotMatch(actions, /processPendingEmailOutbox/);
});

test("Wave 2 registrations map requests by active session identity", async () => {
  const [page, list, modal] = await Promise.all([
    source("app/basic-medical/registrations/page.tsx"),
    source("components/basic-medical-registration-list.tsx"),
    source("components/basic-medical-equipment-request-modal.tsx"),
  ]);

  assert.match(page, /\.eq\("request_domain", "basic_medical"\)/);
  assert.match(page, /\.in\("source_identity_id", sessionIds\)/);
  assert.match(page, /equipmentRequestsBySession/);
  assert.match(list, /Phiếu thiết bị đã hủy/);
  assert.match(list, /Xem phiếu thiết bị/);
  assert.match(list, /Đăng ký thiết bị/);
  assert.match(page, /equipmentRegistrant/);
  assert.doesNotMatch(page, /registrant:[^\n]*full_name,email,phone/);
  assert.match(modal, /SearchableCombobox/);
  assert.match(modal, /schedule-form equipment-request-form/);
  assert.match(modal, /form-section-number/);
  assert.match(modal, /equipment-items-table/);
  assert.match(modal, /value=\{session\.lesson_title\} readOnly/);
  assert.match(modal, /equipmentRegistrant\.fullName/);
  assert.doesNotMatch(modal, /registration\.registrant\?\.email/);
});

test("shared request list renders the catalog that belongs to its domain", async () => {
  const list = await source("components/equipment-request-list.tsx");

  assert.match(list, /function catalogForRequest/);
  assert.match(list, /item\.basic_medical_equipment_catalog/);
  assert.match(list, /canAddItemsForRequest/);
  assert.match(list, /request\.request_domain === "nursing_skills"/);
  assert.match(list, /function domainLabel/);
  assert.match(list, /equipmentRequestWorkflowStatuses\.map/);
  assert.match(list, /Kỹ năng Điều dưỡng/);
});

test("display, manager, and import statuses remain separate", async () => {
  const [requests, actions, values] = await Promise.all([
    source("lib/equipment-requests.ts"),
    source("app/equipment/actions.ts"),
    source("lib/equipment-import-values.ts"),
  ]);
  assert.match(requests, /equipmentRequestWorkflowStatuses/);
  assert.match(requests, /value: "cancelled"/);
  assert.match(actions, /equipmentRequestWorkflowStatuses\.map/);
  assert.match(
    values,
    /type EquipmentImportStatus = Exclude<EquipmentRequestStatus, "cancelled">/,
  );
  assert.doesNotMatch(values, /\["cancelled", "cancelled"\]/);
});
