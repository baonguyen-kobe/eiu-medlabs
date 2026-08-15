import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  displaySnapshotMigration,
  migration,
  evidencePage,
  registrationsPage,
  registrationList,
  signerSnapshotPermissionMigration,
  signerSnapshotPermissionSchema,
] = await Promise.all([
  readFile(
    new URL(
      "../supabase/migrations/20260813150000_add_basic_medical_confirmation_display_snapshots.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/migrations/20260812022922_add_basic_medical_confirmation_evidence.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../app/basic-medical/registrations/confirmations/[id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../app/basic-medical/registrations/page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../components/basic-medical-registration-list.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/migrations/20260815131138_grant_basic_medical_confirmation_signer_snapshot.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/schemas/22_basic_medical_confirmation_signer_snapshot_permission.sql",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("evidence RPC is least-privilege and snapshot-only", () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(
    migration,
    /private\.can_view_basic_medical_registration\(\s*confirmations\.registration_id_snapshot/,
  );
  assert.match(
    migration,
    /from public\.basic_medical_session_equipment_checks/,
  );
  assert.doesNotMatch(migration, /basic_medical_equipment_catalog/);
  assert.doesNotMatch(migration, /join public\.(profiles|rooms)/);
  assert.match(
    migration,
    /revoke all on function public\.get_basic_medical_confirmation_evidence\(uuid\)\s+from public, anon;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_basic_medical_confirmation_evidence\(uuid\)\s+to authenticated;/,
  );
});

test("human-readable evidence values are prospective snapshots, not render-time lookups", () => {
  const evidenceRpc = displaySnapshotMigration.slice(
    displaySnapshotMigration.indexOf(
      "create or replace function public.get_basic_medical_confirmation_evidence",
    ),
  );
  assert.match(
    displaySnapshotMigration,
    /before insert on public\.basic_medical_session_confirmations/,
  );
  for (const field of [
    "course_code_snapshot",
    "course_name_snapshot",
    "room_code_snapshot",
    "building_code_snapshot",
    "room_name_snapshot",
    "teaching_lecturer_name_snapshot",
    "signer_name_snapshot",
  ]) {
    assert.match(displaySnapshotMigration, new RegExp(field));
    assert.match(evidenceRpc, new RegExp(`confirmations\\.${field}`));
  }
  assert.match(evidenceRpc, /display_snapshots_available/);
  assert.doesNotMatch(
    evidenceRpc,
    /join public\.(?:courses|rooms|profiles|basic_medical_equipment_catalog)/,
  );
});

test("registration list preserves the approved embedded confirmation contract", () => {
  const selectStart = registrationsPage.indexOf(
    '"id,registration_code,created_at',
  );
  assert.notEqual(selectStart, -1);
  const selectEnd = registrationsPage.indexOf('",', selectStart);
  const select = registrationsPage.slice(selectStart, selectEnd);
  assert.doesNotMatch(select, /signature_data/);
  assert.match(select, /basic_medical_session_confirmations/);
  assert.match(registrationList, /Xác nhận đã vô hiệu/);
  assert.match(registrationList, /confirmation\.signer_name_snapshot/);
  assert.doesNotMatch(registrationList, /confirmation\.signer\?\.full_name/);
  assert.match(registrationsPage, /signer_name_snapshot/);
  assert.match(
    registrationList,
    /basic-medical\/registrations\/confirmations\/\$\{historical\.id\}/,
  );
  assert.match(
    registrationList,
    /evidenceEnabled\s*\? invalidatedConfirmations\.map/,
  );
});

test("signer display snapshot permission remains a narrow authenticated column grant", () => {
  for (const sql of [
    signerSnapshotPermissionMigration,
    signerSnapshotPermissionSchema,
  ]) {
    assert.match(
      sql,
      /grant select \(signer_name_snapshot\)\s+on public\.basic_medical_session_confirmations\s+to authenticated/i,
    );
    assert.doesNotMatch(sql, /signature_data/i);
    assert.doesNotMatch(
      sql,
      /grant select\s+on public\.basic_medical_session_confirmations/i,
    );
    assert.doesNotMatch(sql, /create policy|alter policy|drop policy/i);
  }
});

test("server-rendered evidence page requests only the guarded RPC result", () => {
  assert.match(
    evidencePage,
    /\.rpc\(\s*"get_basic_medical_confirmation_evidence"/,
  );
  assert.match(evidencePage, /if \(error \|\| !data\) notFound\(\)/);
  assert.match(evidencePage, /evidence\.signature_data/);
  assert.match(evidencePage, /evidence\.equipment_checks\.map/);
  assert.match(evidencePage, /evidence\.invalidated_reason/);
  assert.match(evidencePage, /Thông tin kỹ thuật/);
  assert.match(evidencePage, /Không có snapshot tên hiển thị cho bản ghi cũ/);
  assert.doesNotMatch(
    evidencePage,
    /\.from\("(?:basic_medical_equipment_catalog|basic_medical_room_inventory|profiles|rooms)"\)/,
  );
});
