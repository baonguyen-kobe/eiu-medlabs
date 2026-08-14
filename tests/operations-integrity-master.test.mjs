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
  assert.match(skillsActions, /previewEquipmentCatalogReconciliation/);
  assert.match(basicActions, /previewBasicMedicalCatalogReconciliation/);
  assert.match(skillsActions, /requestedMode !== "new"/);
  assert.match(basicActions, /mode !== "new"/);
  assert.match(importUi, /Preview đối soát/);
  assert.match(importUi, /router\.refresh\(\)/);
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
  assert.match(shiftPage, /list_operational_shift_assignees/);
  assert.doesNotMatch(shiftPage, /list_active_people/);
});
