import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [migration, evidencePage, registrationsPage, registrationList] =
  await Promise.all([
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

test("list query never serializes signature and gates invalidated evidence links", () => {
  const selectStart = registrationsPage.indexOf(
    '"id,registration_code,created_at',
  );
  assert.notEqual(selectStart, -1);
  const selectEnd = registrationsPage.indexOf('",', selectStart);
  const select = registrationsPage.slice(selectStart, selectEnd);
  assert.doesNotMatch(select, /signature_data/);
  assert.match(select, /invalidated_at,invalidated_reason/);
  assert.match(registrationList, /Xác nhận đã vô hiệu/);
  assert.match(
    registrationList,
    /basic-medical\/registrations\/confirmations\/\$\{historical\.id\}/,
  );
  assert.match(
    registrationList,
    /evidenceEnabled\s*\? invalidatedConfirmations\.map/,
  );
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
  assert.doesNotMatch(
    evidencePage,
    /\.from\("(?:basic_medical_equipment_catalog|basic_medical_room_inventory|profiles|rooms)"\)/,
  );
});
