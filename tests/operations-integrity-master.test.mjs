import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("operations integrity migration has declarative parity", async () => {
  const [migration, schema] = await Promise.all([
    read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    read("supabase/schemas/20_operations_integrity_master_batch.sql"),
  ]);
  for (const contract of [
    "cancel_basic_medical_session",
    "invalidate_basic_medical_session_confirmation",
    "ROOT_ADMIN_OPERATIONAL_ASSIGNMENT_FORBIDDEN",
    "class_schedule_operational_lecturer",
    "staff_shift_pattern_operational_assignee",
    "equipment_request_operational_responsible",
    "list_scoped_lecturers",
    "list_scoped_import_lecturers",
    "list_basic_medical_instructors",
    "list_operational_shift_assignees",
    "can_manage_email_notifications",
    "personnel_password_operations",
    "PASSWORD_OPERATION_SERVICE_REQUIRED",
    "reconcile_personnel_password_operation",
    "begin_personnel_password_auth_update",
    "personnel_password_auth_evidence",
    "delete from private.personnel_password_auth_evidence",
    "auth_update_started",
    "PASSWORD_OPERATION_STILL_IN_PROGRESS",
    "list_recoverable_personnel_password_operations",
    "personnel_password_operation_is_stale",
    "PASSWORD_OPERATION_RECONCILIATION_UNSAFE",
    "BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED",
    "rooms_capacity_real_or_unknown",
  ]) {
    assert.match(migration, new RegExp(contract));
    assert.match(schema, new RegExp(contract));
  }
});

test("local operational fixtures never assign Root to new work", async () => {
  const [schedules, shifts] = await Promise.all([
    read("supabase/demo-schedules.sql"),
    read("supabase/demo-shifts.sql"),
  ]);
  assert.match(
    schedules,
    /'40000000-0000-0000-0000-000000000014',[\s\S]{0,500}'20000000-0000-0000-0000-000000000001',\s*\(select id from public\.profiles where email = 'importer@campus\.local'\),\s*null,/,
  );
  assert.match(
    shifts,
    /'50000000-0000-0000-0000-000000000002',\s*\(select id from public\.profiles where email = 'staff@campus\.local'\)/,
  );
});

test("integrity UI paths use canonical operations and app dialogs", async () => {
  const [
    registrationActions,
    registrationList,
    inventory,
    basicMedicalCatalog,
    basicMedicalCatalogPage,
    rooms,
    email,
    catalog,
  ] = await Promise.all([
    read("app/basic-medical/registrations/actions.ts"),
    read("components/basic-medical-registration-list.tsx"),
    read("components/basic-medical-equipment-manager.tsx"),
    read("components/basic-medical-equipment-manager.tsx"),
    read("app/basic-medical/equipment/page.tsx"),
    read("app/admin/actions.ts"),
    read("app/email-notifications/actions.ts"),
    read("components/catalog-batch-manager.tsx"),
  ]);
  assert.match(registrationActions, /cancel_basic_medical_session/);
  assert.match(
    await read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    /BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED/,
  );
  assert.match(
    await read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    /'schedule_cancelled'/,
  );
  assert.match(
    await read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    /grant select \(invalidated_at, invalidated_by, invalidated_by_name_snapshot, invalidated_reason\)/,
  );
  assert.match(
    await read("app/dashboard/actions.ts"),
    /cancel_basic_medical_session/,
  );
  assert.doesNotMatch(
    await read("app/dashboard/actions.ts"),
    /target_reason:\s*null/,
  );
  assert.match(
    registrationActions,
    /invalidate_basic_medical_session_confirmation/,
  );
  assert.match(registrationActions, /!reason/);
  assert.match(registrationList, /Vô hiệu hóa xác nhận buổi học/);
  assert.doesNotMatch(inventory, /\bprompt\s*\(/);
  assert.match(inventory, /InventoryAdjustmentDialog/);
  assert.match(
    basicMedicalCatalog,
    /Ngừng sử dụng \$\{selected\.size\} thiết bị\?/,
  );
  assert.match(basicMedicalCatalog, /<ConfirmDialog/);
  assert.match(basicMedicalCatalogPage, /Tên thương mại \*/);
  assert.match(rooms, /Sức chứa phải là số nguyên từ 1 trở lên/);
  assert.match(email, /can_manage_email_notifications/);
  assert.match(catalog, /<ConfirmDialog/);
  assert.doesNotMatch(catalog, /window\.confirm/);
});

test("review correction UI coverage keeps capability, calendar, Root, and reconciliation boundaries explicit", async () => {
  const [
    dashboard,
    basicMedicalSchedules,
    classSchedules,
    staffShifts,
    personnelPage,
    personnelList,
    catalogImport,
    adminActions,
  ] = await Promise.all([
    read("components/dashboard.tsx"),
    read("app/basic-medical/schedules/page.tsx"),
    read("app/class-schedules/page.tsx"),
    read("app/staff-shifts/page.tsx"),
    read("app/admin/personnel/page.tsx"),
    read("components/personnel-management-list.tsx"),
    read("components/catalog-reconciliation-import.tsx"),
    read("app/admin/actions.ts"),
  ]);

  for (const source of [basicMedicalSchedules, classSchedules]) {
    assert.match(source, /rootOperationalAssignment/);
    assert.match(source, /rootOperationalAssigneeIds/);
    assert.match(source, /system_security_principals/);
    assert.match(source, /createAdminClient/);
  }
  assert.match(dashboard, /adminCancelBasicMedicalSession/);
  assert.match(dashboard, /adminInvalidateBasicMedicalSessionConfirmation/);
  assert.match(dashboard, /Lý do hủy buổi học \*/);
  assert.match(dashboard, /Lý do vô hiệu hóa \*/);
  assert.match(dashboard, /activeConfirmation/);
  assert.match(dashboard, /isRootAdministrator/);
  assert.match(dashboard, /!isRootAdministrator/);
  assert.match(dashboard, /Root Admin không thể được phân công vận hành/);
  assert.match(staffShifts, /list_operational_shift_assignees/);
  assert.match(staffShifts, /historicalPeople/);
  assert.match(staffShifts, /createAdminClient/);
  assert.match(classSchedules, /list_operational_shift_assignees/);
  assert.doesNotMatch(classSchedules, /directoryRoles/);
  assert.match(dashboard, /shiftAssignees\.map/);
  assert.match(adminActions, /auth_update_outcome_unknown/);
  assert.match(adminActions, /let updateThrew = false/);
  assert.match(
    adminActions,
    /if \(updateThrew\)[\s\S]*mark_personnel_password_reconciliation_required/,
  );
  assert.doesNotMatch(personnelPage, /last_error/);
  assert.doesNotMatch(personnelList, /last_error/);
  assert.match(personnelPage, /personnel_password_operations/);
  assert.match(personnelPage, /authority\.is_root_administrator/);
  assert.match(personnelList, /Đối soát/);
  assert.match(personnelList, /reconcilePersonnelPasswordOperation/);
  assert.match(catalogImport, /maxFileBytes = 10 \* 1024 \* 1024/);
  assert.match(catalogImport, /maxRows = 5_000/);
  assert.match(catalogImport, /\.\(csv\|xlsx\)/);
  assert.match(
    adminActions,
    /canonicalEmail = authUser\.user\.email\?\.trim\(\)/,
  );
  assert.match(adminActions, /PASSWORD_RESET_AUTH_OUTCOME_UNCHANGED/);
  assert.match(adminActions, /PASSWORD_CHANGE_AUTH_OUTCOME_UNCHANGED/);
  assert.match(adminActions, /assertRoomCapacityInput/);
});

test("catalog reconciliation is previewed and atomically applied in both domains", async () => {
  const [migration, schema, skillsActions, basicActions, importUi] =
    await Promise.all([
      read(
        "supabase/migrations/20260813161000_catalog_reconciliation_preview_apply.sql",
      ),
      read("supabase/schemas/21_catalog_reconciliation_preview_apply.sql"),
      read("app/admin/equipment/actions.ts"),
      read("app/basic-medical/equipment/actions.ts"),
      read("components/catalog-reconciliation-import.tsx"),
    ]);
  assert.equal(migration, schema);
  for (const contract of [
    "preview_catalog_reconciliation",
    "apply_catalog_reconciliation",
    "CATALOG_RECONCILIATION_STALE_PREVIEW",
    "share row exclusive mode",
    "catalog.reconciled",
  ]) {
    assert.match(migration, new RegExp(contract));
  }
  assert.match(
    await read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    /create or replace function public\.apply_catalog_room_import[\s\S]*INVALID_ROOM_CAPACITY/,
  );
  assert.match(skillsActions, /previewEquipmentCatalogReconciliation/);
  assert.match(basicActions, /previewBasicMedicalCatalogReconciliation/);
  assert.match(skillsActions, /CATALOG_RECONCILIATION_PREVIEW_FAILED/);
  assert.match(basicActions, /CATALOG_RECONCILIATION_PREVIEW_FAILED/);
  assert.match(skillsActions, /requestedMode !== "new"/);
  assert.match(basicActions, /mode !== "new"/);
  assert.match(importUi, /Preview đối soát/);
  assert.match(importUi, /router\.refresh\(\)/);
  for (const localMessage of [
    "Vui lòng chọn file CSV hoặc XLSX.",
    "Chỉ hỗ trợ file CSV hoặc XLSX.",
    "File đối soát không được lớn hơn 10 MB.",
    "Mỗi dòng cần có Tên thiết bị, Tên thương mại và ĐVT.",
  ]) {
    assert.match(importUi, new RegExp(localMessage));
  }
  assert.match(
    importUi,
    /const rowCountErrorMessage = "File phải có từ 1 đến 5000 dòng dữ liệu\."/,
  );
  assert.match(
    importUi,
    /function localParserErrorMessage\(error: unknown\)[\s\S]*return genericImportErrorMessage/,
  );
  assert.match(importUi, /setNotice\(localParserErrorMessage\(error\)\)/);
  assert.doesNotMatch(importUi, /setNotice\(error\.message\)/);
  assert.match(migration, /catalog_item_id_snapshot/);
  assert.match(migration, /'referenced',referenced/);
});

test("password saga settlement is server-admin only and shift UI uses its canonical directory", async () => {
  const [migration, adminActions, shiftPage] = await Promise.all([
    read(
      "supabase/migrations/20260813160000_operations_integrity_master_batch.sql",
    ),
    read("app/admin/actions.ts"),
    read("app/staff-shifts/page.tsx"),
  ]);
  assert.match(migration, /PASSWORD_OPERATION_SERVICE_REQUIRED/);
  assert.match(
    adminActions,
    /adminClient\.rpc\(\s*"record_personnel_password_auth_result"/,
  );
  assert.match(adminActions, /mark_personnel_password_reconciliation_required/);
  assert.match(adminActions, /PASSWORD_AUTH_CHANGED_RECONCILIATION_REQUIRED/);
  assert.match(
    adminActions,
    /auth_result_recording_failed[\s\S]*markPersonnelPasswordReconciliationRequired/,
  );
  assert.match(shiftPage, /list_operational_shift_assignees/);
  assert.doesNotMatch(shiftPage, /list_active_people/);
});

test("Root equipment responsibility never reintroduces Root through registrant defaults", async () => {
  const [registerPage, form, actions] = await Promise.all([
    read("app/equipment/register/page.tsx"),
    read("components/equipment-request-form.tsx"),
    read("app/equipment/actions.ts"),
  ]);
  assert.match(registerPage, /system_security_principals/);
  assert.match(registerPage, /registrantIsOperationallyAssignable/);
  assert.match(registerPage, /requiresResponsibleLecturerReplacement/);
  assert.match(
    form,
    /registrantIsOperationallyAssignable \? registrantId : ""/,
  );
  assert.match(form, /Tài khoản Root Admin không thể được phân công vận hành/);
  assert.doesNotMatch(
    form,
    /defaultValue=\{initialData\?\.responsibleLecturerId \?\? registrantId\}/,
  );
  assert.match(actions, /responsible_lecturer_id/);
});
