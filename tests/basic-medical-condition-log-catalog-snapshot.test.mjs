import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [schema, migration, manager] = await Promise.all([
  readFile(
    new URL(
      "../supabase/schemas/15_basic_medical_condition_log_catalog_snapshot.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/migrations/20260812030000_snapshot_basic_medical_condition_log_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../components/basic-medical-equipment-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("condition-log catalog snapshot schema is additive, prospective, and least privilege", () => {
  assert.equal(schema, migration);
  assert.match(
    schema,
    /add column if not exists catalog_item_id_snapshot uuid,[\s\S]*add column if not exists item_name_snapshot text,[\s\S]*add column if not exists commercial_name_snapshot text,[\s\S]*add column if not exists unit_snapshot text/,
  );
  assert.doesNotMatch(
    schema,
    /update public\.basic_medical_equipment_condition_logs[\s\S]*item_name_snapshot\s*=/i,
  );
  assert.match(
    schema,
    /before insert on public\.basic_medical_equipment_condition_logs[\s\S]*snapshot_basic_medical_condition_log_catalog\(\)/,
  );
  assert.match(
    schema,
    /select\s+inventory\.catalog_item_id,[\s\S]*catalog\.item_name,[\s\S]*catalog\.commercial_name,[\s\S]*catalog\.unit[\s\S]*into\s+new\.catalog_item_id_snapshot,[\s\S]*new\.item_name_snapshot/,
  );
  assert.match(
    schema,
    /revoke all on function private\.snapshot_basic_medical_condition_log_catalog\(\)[\s\S]*from public, anon, authenticated/,
  );
});

test("log search returns only stored names and marks unknown legacy names", () => {
  assert.match(
    schema,
    /'item_name', coalesce\(logs\.item_name_snapshot, 'Tên lịch sử không được ghi nhận'\)/,
  );

  const logsBranchStart = schema.indexOf(
    "from public.basic_medical_equipment_condition_logs logs",
  );
  assert.notEqual(logsBranchStart, -1);
  const logsBranch = schema.slice(logsBranchStart);

  assert.match(
    logsBranch,
    /extensions\.unaccent\(coalesce\(logs\.item_name_snapshot, ''\)\)/,
  );
  assert.doesNotMatch(
    logsBranch,
    /join public\.basic_medical_equipment_catalog\s+catalog/,
  );
  assert.match(schema, /security definer set search_path = ''/);
  assert.match(
    schema,
    /revoke all on function public\.search_basic_medical_equipment\([\s\S]*\) from public, anon;[\s\S]*grant execute[\s\S]*to authenticated/,
  );
  assert.match(manager, /item\.inventory\?\.catalog\?\.item_name/);
});
