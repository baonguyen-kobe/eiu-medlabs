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

test("Wave 2 uses a page-based Basic Medical registration form", async () => {
  const [registerPage, registrationPage, list, form, basicMedicalPage] =
    await Promise.all([
      source("app/equipment/register/page.tsx"),
      source("app/basic-medical/registrations/page.tsx"),
      source("components/basic-medical-registration-list.tsx"),
      source("components/basic-medical-equipment-request-form.tsx"),
      source("components/basic-medical-equipment-registration-page.tsx"),
    ]);

  assert.match(registrationPage, /\.eq\("request_domain", "basic_medical"\)/);
  assert.match(registrationPage, /\.in\("source_identity_id", sessionIds\)/);
  assert.match(registrationPage, /equipmentRequestsBySession/);
  assert.match(list, /Phiếu thiết bị đã hủy/);
  assert.match(list, /Xem phiếu thiết bị/);
  assert.match(list, /Đăng ký thiết bị/);
  assert.match(registerPage, /BasicMedicalEquipmentRegistrationPage/);
  assert.match(basicMedicalPage, /\.in\("source_identity_id", sourceIds\)/);
  assert.match(basicMedicalPage, /requestsBySession/);
  assert.match(form, /SearchableCombobox/);
  assert.match(form, /schedule-form equipment-request-form/);
  assert.match(form, /form-section-number/);
  assert.match(form, /equipment-items-table/);
  assert.match(form, /value=\{session\.lesson_title\} readOnly/);
  assert.match(form, /equipmentRegistrant\.fullName/);
  assert.match(form, /formatDate\(scheduleDate\)/);
  assert.match(form, /className="equipment-late-warning" role="alert"/);
  assert.match(form, /<\/table>\s*<\/div>\s*<button[\s\S]*?\+ Thêm dòng/);
  assert.doesNotMatch(form, /createPortal/);
  assert.match(
    list,
    /<Link[\s\S]*?href=\{`\/equipment\/register\?domain=basic_medical&session=\$\{session\.id\}`\}/,
  );
  assert.doesNotMatch(list, /activeEquipmentRequest/);
});

test("equipment registration route preserves Skills default and adds Basic Medical access", async () => {
  const [page, shell, access] = await Promise.all([
    source("app/equipment/register/page.tsx"),
    source("components/workspace-shell.tsx"),
    source("lib/workspace-access.ts"),
  ]);

  assert.match(page, /query\.domain === "basic_medical"/);
  assert.match(page, /: canUseSkills\s*\?\s*"nursing_skills"/);
  assert.match(page, /BasicMedicalEquipmentRegistrationPage/);
  assert.match(access, /canUseBasicMedicalEquipmentRegistration/);
  assert.match(shell, /canUseBasicMedicalEquipmentRegistration/);
  assert.match(shell, /canUseSkillsEquipment \|\| canUseBasicMedicalEquipment/);
  assert.equal((shell.match(/label: "Đăng ký thiết bị"/g) ?? []).length, 1);
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
  assert.match(requests, /type EquipmentRequestWorkflowStatus/);
  assert.match(requests, /value: "cancelled"/);
  assert.match(actions, /equipmentRequestWorkflowStatuses\.map/);
  assert.match(actions, /status: EquipmentRequestWorkflowStatus/);
  const list = await source("components/equipment-request-list.tsx");
  assert.match(list, /status: EquipmentRequestWorkflowStatus/);
  assert.match(
    values,
    /type EquipmentImportStatus = Exclude<EquipmentRequestStatus, "cancelled">/,
  );
  assert.doesNotMatch(values, /\["cancelled", "cancelled"\]/);
});
