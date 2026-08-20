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

/**
 * Normalizes SQL for non-semantic formatting differences only.
 * Strips comments, collapses consecutive whitespace, and normalizes line endings.
 * Preserves all identifiers, operators, keywords, statements, conditions, branches, and error names.
 */
function normalizeSql(sql) {
  return sql
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/--.*$/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n+/g, "\n")
    .trim();
}

test("Declarative Schema Parity: public.claim_class(uuid) mirrors post-PR62 migration exactly", async () => {
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

  // Complete definition parity assertion
  assert.equal(
    normalizeSql(schemaClaim),
    normalizeSql(migrationClaim),
    "public.claim_class in declarative schema must be identical to migration",
  );

  // Security guard checks
  assert.ok(
    schemaClaim.includes(
      "private.class_schedule_has_equipment_request(target_schedule_id)",
    ),
    "Schema must check private.class_schedule_has_equipment_request",
  );
  assert.ok(
    schemaClaim.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"),
    "Schema must throw CLASS_EQUIPMENT_REQUEST_EXISTS",
  );
  assert.ok(
    schemaClaim.includes("AUTHENTICATION_REQUIRED"),
    "Schema must enforce AUTHENTICATION_REQUIRED",
  );
  assert.ok(
    schemaClaim.includes("LECTURER_ROLE_REQUIRED"),
    "Schema must enforce LECTURER_ROLE_REQUIRED",
  );
  assert.ok(
    schemaClaim.includes(
      "(schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')",
    ),
    "Schema must enforce future start boundary",
  );

  // Grants and revokes
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

test("Declarative Schema Parity: public.cancel_basic_medical_session mirrors post-PR62 migration exactly", async () => {
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

  // Complete definition parity assertion
  assert.equal(
    normalizeSql(schemaCancel),
    normalizeSql(migrationCancel),
    "public.cancel_basic_medical_session in declarative schema must be identical to migration",
  );

  // Structural branch parity assertion: must use strictly 'if already_cancelled then'
  assert.ok(
    schemaCancel.includes("if already_cancelled then"),
    "Schema must use exact aggregate check 'if already_cancelled then'",
  );
  assert.ok(
    !schemaCancel.includes("session_row.cancelled_at is not null"),
    "Schema must not bypass schedule aggregate cancellation via session_row.cancelled_at shortcut",
  );

  // Security and authority checks
  assert.ok(
    schemaCancel.includes("registration_creator_id = actor_id"),
    "Schema must authorize registration creator",
  );
  assert.ok(
    schemaCancel.includes("session_row.teaching_lecturer_id = actor_id"),
    "Schema must authorize session teaching lecturer",
  );
  assert.ok(
    schemaCancel.includes("private.is_admin()"),
    "Schema must authorize Admin",
  );
  assert.ok(
    schemaCancel.includes("BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN"),
    "Schema must throw BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN for unauthorized actors",
  );
  assert.ok(
    schemaCancel.includes("BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED"),
    "Schema must require non-blank reason",
  );
  assert.ok(
    schemaCancel.includes(
      "BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED",
    ),
    "Schema must preserve confirmation invalidation guard",
  );
  assert.ok(
    schemaCancel.includes("cancellation_reason = normalized_reason"),
    "Schema must record cancellation_reason",
  );

  // Grants and revokes
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
