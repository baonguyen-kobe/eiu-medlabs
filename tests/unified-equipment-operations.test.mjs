import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("equipment operations stays unified and filters its managed domains", async () => {
  const [page, list, access, shell] = await Promise.all([
    source("app/equipment/requests/page.tsx"),
    source("components/equipment-request-list.tsx"),
    source("lib/workspace-access.ts"),
    source("components/workspace-shell.tsx"),
  ]);

  assert.match(page, /equipmentOperationsDomains/);
  assert.match(page, /canUseEquipmentOperations/);
  assert.match(page, /\.in\("request_domain", manageableDomains\)/);
  assert.doesNotMatch(page, /basic-medical\/equipment-operations/);
  assert.match(access, /canManageEquipmentRequestDomain/);
  assert.match(shell, /canUseEquipmentOperations/);
  assert.match(shell, /href: "\/equipment\/requests"/);

  for (const header of [
    "Phạm vi",
    "Môn học",
    "Ngày",
    "Thời gian",
    "Phòng/Lab",
    "Thiết bị",
  ]) {
    assert.match(list, new RegExp(`<th>${header}</th>`));
  }
  assert.match(list, /equipment-status-heading">Trạng thái/);
  assert.match(list, /const \[domainFilter, setDomainFilter\]/);
  assert.match(list, /Tất cả phạm vi/);
  assert.match(list, /value="nursing_skills"/);
  assert.match(list, /value="basic_medical"/);
  assert.match(list, /domainLabel\(request\)/);
  assert.match(list, /request\.request_domain === domainFilter/);
  assert.match(list, /setCurrentPage\(1\)/);
});

test("unified operations retains domain-specific content and safety", async () => {
  const [list, actions] = await Promise.all([
    source("components/equipment-request-list.tsx"),
    source("app/equipment/actions.ts"),
  ]);

  assert.match(list, /item\.basic_medical_equipment_catalog/);
  assert.match(list, /item\.equipment_catalog/);
  assert.match(list, /Bài TN-TH #/);
  assert.match(list, /Giảng viên giảng dạy\/hướng dẫn/);
  assert.match(list, /Giảng viên phụ trách/);
  assert.match(list, /canAddItemsForRequest[\s\S]*?"nursing_skills"/);
  assert.match(list, /Hủy phiếu thiết bị\?/);
  assert.match(list, /Hủy phiếu/);
  assert.match(list, /trạng thái Đã hủy/);
  assert.match(actions, /request\.request_domain !== "nursing_skills"/);
  assert.match(actions, /soft_cancel_equipment_request/);
});

test("handover PDF and route apply domain-aware catalog and scope authorization", async () => {
  const [pdf, route] = await Promise.all([
    source("lib/equipment-handover-pdf.ts"),
    source("app/api/equipment-requests/[requestId]/handover/route.ts"),
  ]);

  assert.match(pdf, /request\.request_domain === "basic_medical"/);
  assert.match(pdf, /basic_medical_equipment_catalog/);
  assert.match(pdf, /Y cơ sở/);
  assert.match(pdf, /Giảng viên giảng dạy\/hướng dẫn/);
  assert.match(pdf, /Tên bài TN-TH/);
  assert.match(route, /canManageEquipmentRequestDomain/);
  assert.match(route, /profile_room_types/);
  assert.match(route, /request\.request_domain/);
});

test("Root requester keeps a real Basic Medical lecturer and gets an explicit assignment error", async () => {
  const [registrationPage, actions, schema] = await Promise.all([
    source("components/basic-medical-equipment-registration-page.tsx"),
    source("app/basic-medical/registrations/actions.ts"),
    source("supabase/schemas/20_operations_integrity_master_batch.sql"),
  ]);

  assert.match(registrationPage, /rootAdminAssignedToSession/);
  assert.match(registrationPage, /isRootAdministrator/);
  assert.match(registrationPage, /!selectedHasRootAssignment/);
  assert.match(actions, /ROOT_ADMIN_OPERATIONAL_ASSIGNMENT_FORBIDDEN/);
  assert.match(actions, /đang phân công Root Admin làm giảng viên/);
  assert.match(actions, /target_responsible_lecturer_id: null/);
  assert.match(schema, /list_basic_medical_instructors/);
  assert.match(schema, /private\.is_operationally_assignable\(profiles\.id\)/);
});
