import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/production-pr23-test-catalog-cleanup.yml",
    import.meta.url,
  ),
  "utf8",
);

test("production test-catalog cleanup is fixed, main-only, and dispatch-only", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /supabase link --project-ref "\$PROJECT_REF" --yes/);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
});

test("cleanup rechecks the exact three-row state and fails closed on history or FK dependencies", () => {
  for (const marker of [
    "catalog_count <> 3",
    "TEST_CATALOG_STATE_CHANGED",
    "TEST_CATALOG_HAS_HISTORICAL_REFERENCES",
    "TEST_CATALOG_HAS_UNEXPECTED_DEPENDENCIES",
    "pg_constraint",
    "basic_medical_session_equipment_checks",
    "basic_medical_equipment_condition_logs",
    "basic_medical_session_confirmations",
  ]) {
    assert.match(workflow, new RegExp(marker));
  }
  assert.match(workflow, /lock table public\.basic_medical_equipment_catalog,/);
  assert.match(workflow, /app\.basic_medical_registration_mutation/);
});

test("cleanup deletes only the authorized graph in dependency order and does not run migrations", () => {
  const sessionDelete = workflow.indexOf(
    "delete from public.basic_medical_registration_sessions",
  );
  const scheduleDelete = workflow.indexOf("delete from public.class_schedules");
  const registrationDelete = workflow.indexOf(
    "delete from public.basic_medical_registrations",
  );
  const inventoryDelete = workflow.indexOf(
    "delete from public.basic_medical_room_inventory",
  );
  const roomDelete = workflow.indexOf("delete from public.rooms");
  const catalogDelete = workflow.indexOf(
    "delete from public.basic_medical_equipment_catalog",
  );
  assert.ok(
    sessionDelete < scheduleDelete &&
      scheduleDelete < registrationDelete &&
      registrationDelete < inventoryDelete &&
      inventoryDelete < roomDelete &&
      roomDelete < catalogDelete,
  );
  assert.doesNotMatch(
    workflow,
    /supabase (?:migration repair|db reset|db push|migration up)|--include-all|--include-seed/,
  );
  assert.doesNotMatch(workflow, /\btruncate\b|\bcascade\b/i);
});

test("postcheck preserves the blocked migration state and creates a private non-secret artifact", () => {
  for (const version of ["20260813130000", "20260813150000"]) {
    assert.match(workflow, new RegExp(version));
  }
  assert.match(workflow, /name: pr23-authorized-test-catalog-cleanup/);
  assert.match(workflow, /Catalog rows deleted: 3/);
  assert.doesNotMatch(
    workflow,
    /(?:echo|printf).*SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD)/,
  );
});
