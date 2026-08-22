import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const migrationPath =
  "supabase/migrations/20260822110000_basic_medical_equipment_request_wave_1.sql";
const schemaPath =
  "supabase/schemas/25_basic_medical_equipment_request_wave_1.sql";
const blockerMigrationPath =
  "supabase/migrations/20260822130000_basic_medical_equipment_request_blockers.sql";
const blockerSchemaPath =
  "supabase/schemas/26_basic_medical_equipment_request_blockers.sql";
const skillsCompatibilityMigrationPath =
  "supabase/migrations/20260822140000_equipment_request_skills_compatibility.sql";
const skillsCompatibilitySchemaPath =
  "supabase/schemas/27_equipment_request_skills_compatibility.sql";
const outboxCompatibilityMigrationPath =
  "supabase/migrations/20260822150000_equipment_request_create_outbox_compatibility.sql";
const outboxCompatibilitySchemaPath =
  "supabase/schemas/28_equipment_request_create_outbox_compatibility.sql";

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Wave 1 shared equipment lifecycle keeps migration/schema parity", async () => {
  const [migration, schema] = await Promise.all([
    source(migrationPath),
    source(schemaPath),
  ]);

  assert.equal(migration, schema);
  assert.match(
    migration,
    /equipment_request_domain as enum \('nursing_skills', 'basic_medical'\)/,
  );
  assert.match(migration, /source_identity_id uuid/);
  assert.match(
    migration,
    /equipment_requests_domain_source_identity_key[\s\S]*\(request_domain, source_identity_id\)/,
  );
  assert.match(migration, /EQUIPMENT_REQUEST_DOMAIN_OR_SOURCE_IMMUTABLE/);
  assert.match(migration, /EQUIPMENT_REQUEST_LIVE_SOURCE_IMMUTABLE/);
});

test("Wave 1 create correction preserves Skills-only transactional outbox", async () => {
  const [migration, schema] = await Promise.all([
    source(outboxCompatibilityMigrationPath),
    source(outboxCompatibilitySchemaPath),
  ]);

  assert.equal(migration, schema);
  assert.match(migration, /private\.enqueue_equipment_request_outbox_event/);
  assert.match(migration, /late_approval_requested/);
  assert.match(migration, /'created'/);
  assert.match(migration, /if source_row\.session_id is null then/);
  assert.doesNotMatch(
    migration,
    /if source_row\.session_id is not null then\s+perform private\.enqueue_equipment_request_outbox_event/,
  );
});

test("Wave 1 Skills edit form locks its immutable class source", async () => {
  const form = await source("components/equipment-request-form.tsx");

  assert.match(form, /const isEditMode = initialData\?\.mode === "edit"/);
  assert.match(
    form,
    /type="hidden"\s+name="class_schedule_id"\s+value=\{initialData\.classId\}/,
  );
  assert.match(
    form,
    /name=\{isEditMode \? undefined : "class_schedule_id"\}\s+required=\{!isEditMode\}\s+disabled=\{isEditMode\}/,
  );
  assert.match(form, /value=\{isEditMode \? initialData\.classId : classId\}/);
  assert.match(
    form,
    /\{isEditMode \? null : \(\s*<Link\s+className="button button-secondary create-class-button"/,
  );
});

test("Wave 1 catalog and tombstone guards are domain-specific", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /basic_medical_catalog_item_id uuid/);
  assert.match(
    migration,
    /num_nonnulls\(catalog_item_id, basic_medical_catalog_item_id\) = 1/,
  );
  assert.match(migration, /EQUIPMENT_REQUEST_SKILLS_CATALOG_REQUIRED/);
  assert.match(migration, /EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED/);
  assert.match(
    migration,
    /BASIC_MEDICAL_SESSION_REMOVAL_BLOCKED_BY_ACTIVE_EQUIPMENT_REQUEST/,
  );
  assert.match(migration, /app\.basic_medical_equipment_tombstone/);
  assert.match(migration, /BASIC_MEDICAL_EQUIPMENT_REQUEST_HISTORY_IMMUTABLE/);
});

test("Wave 1 Basic Medical edits reconcile by immutable session identity", async () => {
  const [migration, actions, page, form] = await Promise.all([
    source(migrationPath),
    source("app/basic-medical/new/actions.ts"),
    source("app/basic-medical/new/page.tsx"),
    source("components/basic-medical-registration-form.tsx"),
  ]);

  assert.match(migration, /BASIC_MEDICAL_SESSION_ID_DUPLICATE/);
  assert.match(migration, /BASIC_MEDICAL_SESSION_ID_FOREIGN/);
  assert.match(migration, /where id=existing_session\.class_schedule_id/);
  assert.match(migration, /set session_number=session_number_value/);
  assert.match(actions, /session_id: session\.sessionId \?\? null/);
  assert.match(page, /sessionId: mode === "edit" \? session\.id : undefined/);
  assert.match(form, /sessionId: s\.sessionId/);
});

test("Wave 1 blocker correction stays declarative and preserves domain contracts", async () => {
  const [migration, schema] = await Promise.all([
    source(blockerMigrationPath),
    source(blockerSchemaPath),
  ]);

  assert.equal(migration, schema);
  assert.match(migration, /BASIC_MEDICAL_SAVE_FORBIDDEN/);
  assert.match(migration, /allow_basic_medical_access/);
  assert.match(migration, /session_number = session_number \+ 1000000/);
  assert.match(migration, /enqueue_equipment_request_outbox_event/);
  assert.match(migration, /equipment_request\.hard_deleted/);
});

test("Wave 1 Skills compatibility correction stays declarative", async () => {
  const [migration, schema] = await Promise.all([
    source(skillsCompatibilityMigrationPath),
    source(skillsCompatibilitySchemaPath),
  ]);

  assert.equal(migration, schema);
  assert.match(migration, /private\.has_role\('teaching_assistant'\)/);
  assert.match(migration, /private\.has_room_type\(skills_room_type_id\)/);
  assert.match(migration, /EQUIPMENT_REQUEST_DOMAIN_OR_SOURCE_IMMUTABLE/);
  assert.match(migration, /Ngày trả phải bằng hoặc sau ngày học/);
});
