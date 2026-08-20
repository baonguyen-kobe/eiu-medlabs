import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260819231500_post_pr62_cancellation_and_claim_hardening.sql",
);
const claimSchemaPath = path.join(
  repoRoot,
  "supabase",
  "schemas",
  "02_room_type_scopes.sql",
);
const cancelSchemaPath = path.join(
  repoRoot,
  "supabase",
  "schemas",
  "20_operations_integrity_master_batch.sql",
);

test("Declarative Schema Parity: public.claim_class(uuid) mirrors post-PR62 migration", async () => {
  const [migrationContent, schemaContent] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(claimSchemaPath, "utf8"),
  ]);

  // Extract claim_class from migration
  const migrationClaimMatch = migrationContent.match(
    /create or replace function public\.claim_class\([\s\S]*?\$\$[\s\S]*?\$\$;/,
  );
  assert.ok(migrationClaimMatch, "Migration must contain public.claim_class");
  const migrationClaim = migrationClaimMatch[0];

  // Extract claim_class from schema
  const schemaClaimMatch = schemaContent.match(
    /create or replace function public\.claim_class\([\s\S]*?\$\$[\s\S]*?\$\$;/,
  );
  assert.ok(
    schemaClaimMatch,
    "Declarative schema must contain public.claim_class",
  );
  const schemaClaim = schemaClaimMatch[0];

  // 1. Both must enforce equipment request claim lock
  assert.ok(
    migrationClaim.includes(
      "private.class_schedule_has_equipment_request(target_schedule_id)",
    ),
    "Migration must check private.class_schedule_has_equipment_request",
  );
  assert.ok(
    schemaClaim.includes(
      "private.class_schedule_has_equipment_request(target_schedule_id)",
    ),
    "Schema must check private.class_schedule_has_equipment_request",
  );

  assert.ok(
    migrationClaim.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"),
    "Migration must throw CLASS_EQUIPMENT_REQUEST_EXISTS",
  );
  assert.ok(
    schemaClaim.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"),
    "Schema must throw CLASS_EQUIPMENT_REQUEST_EXISTS",
  );

  // 2. Both must enforce active authenticated actor and roles
  assert.ok(
    migrationClaim.includes("AUTHENTICATION_REQUIRED"),
    "Migration must enforce AUTHENTICATION_REQUIRED",
  );
  assert.ok(
    schemaClaim.includes("AUTHENTICATION_REQUIRED"),
    "Schema must enforce AUTHENTICATION_REQUIRED",
  );
  assert.ok(
    migrationClaim.includes("LECTURER_ROLE_REQUIRED"),
    "Migration must enforce LECTURER_ROLE_REQUIRED",
  );
  assert.ok(
    schemaClaim.includes("LECTURER_ROLE_REQUIRED"),
    "Schema must enforce LECTURER_ROLE_REQUIRED",
  );

  // 3. Both must enforce future start time boundary
  assert.ok(
    migrationClaim.includes(
      "(schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')",
    ),
    "Migration must enforce future start boundary",
  );
  assert.ok(
    schemaClaim.includes(
      "(schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')",
    ),
    "Schema must enforce future start boundary",
  );

  // 4. Grants and revokes
  assert.match(
    schemaContent,
    /revoke all on function public\.claim_class\(uuid\) from public, anon;/,
    "Schema must revoke public.claim_class from public and anon",
  );
  assert.match(
    schemaContent,
    /grant execute on function public\.claim_class\(uuid\) to authenticated;/,
    "Schema must grant execute on public.claim_class to authenticated",
  );
});

test("Declarative Schema Parity: public.cancel_basic_medical_session mirrors post-PR62 migration", async () => {
  const [migrationContent, schemaContent] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(cancelSchemaPath, "utf8"),
  ]);

  // Extract cancel_basic_medical_session from migration
  const migrationCancelMatch = migrationContent.match(
    /create or replace function public\.cancel_basic_medical_session\([\s\S]*?\$\$[\s\S]*?\$\$;/,
  );
  assert.ok(
    migrationCancelMatch,
    "Migration must contain public.cancel_basic_medical_session",
  );
  const migrationCancel = migrationCancelMatch[0];

  // Extract cancel_basic_medical_session from schema
  const schemaCancelMatch = schemaContent.match(
    /create or replace function public\.cancel_basic_medical_session\([\s\S]*?\$\$[\s\S]*?\$\$;/,
  );
  assert.ok(
    schemaCancelMatch,
    "Declarative schema must contain public.cancel_basic_medical_session",
  );
  const schemaCancel = schemaCancelMatch[0];

  // 1. Both must authorize Admin, Creator, and Teaching Lecturer
  assert.ok(
    migrationCancel.includes("registration_creator_id = actor_id"),
    "Migration must authorize registration creator",
  );
  assert.ok(
    schemaCancel.includes("registration_creator_id = actor_id"),
    "Schema must authorize registration creator",
  );

  assert.ok(
    migrationCancel.includes("session_row.teaching_lecturer_id = actor_id"),
    "Migration must authorize session teaching lecturer",
  );
  assert.ok(
    schemaCancel.includes("session_row.teaching_lecturer_id = actor_id"),
    "Schema must authorize session teaching lecturer",
  );

  assert.ok(
    migrationCancel.includes("private.is_admin()"),
    "Migration must authorize Admin",
  );
  assert.ok(
    schemaCancel.includes("private.is_admin()"),
    "Schema must authorize Admin",
  );

  assert.ok(
    migrationCancel.includes("BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN"),
    "Migration must throw BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN for unauthorized actors",
  );
  assert.ok(
    schemaCancel.includes("BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN"),
    "Schema must throw BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN for unauthorized actors",
  );

  // 2. Both must enforce reason requirement and active confirmation guard
  assert.ok(
    migrationCancel.includes(
      "BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED",
    ),
    "Migration must require non-blank reason",
  );
  assert.ok(
    schemaCancel.includes("BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED"),
    "Schema must require non-blank reason",
  );

  assert.ok(
    migrationCancel.includes(
      "BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED",
    ),
    "Migration must preserve confirmation invalidation guard",
  );
  assert.ok(
    schemaCancel.includes(
      "BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED",
    ),
    "Schema must preserve confirmation invalidation guard",
  );

  // 3. Both must record session cancellation metadata
  assert.ok(
    migrationCancel.includes("cancellation_reason = normalized_reason"),
    "Migration must record cancellation_reason",
  );
  assert.ok(
    schemaCancel.includes("cancellation_reason = normalized_reason"),
    "Schema must record cancellation_reason",
  );

  // 4. Grants and revokes
  assert.match(
    schemaContent,
    /revoke all on function public\.cancel_basic_medical_session\(uuid,text\)/,
    "Schema must revoke cancel_basic_medical_session from public, anon",
  );
  assert.match(
    schemaContent,
    /grant execute on function public\.cancel_basic_medical_session\(uuid,text\)/,
    "Schema must grant execute on cancel_basic_medical_session to authenticated",
  );
});
