import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/production-pr33-migrations.yml",
    import.meta.url,
  ),
  "utf8",
).then((contents) => contents.replace(/\r\n/g, "\n"));

const targets = ["20260813160000", "20260813161000", "20260815131138"];
const blobs = [
  "0b2fdf2608e523aed26416b290d8120e5f858e37",
  "49b9d767dd8f403dcfef6686ff1fe59d5ca8848d",
  "d0f8cb795af46ab676238ab74099f3008f7baf22",
];
const pr2 = [
  "20260809120000",
  "20260809130000",
  "20260809140000",
  "20260809150000",
  "20260809160000",
  "20260810000000",
  "20260810010000",
  "20260810020000",
  "20260810030000",
];

test("PR33 production migration rail is fixed, main-only, and credential-safe", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: production-pr33-migrations\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(
    workflow,
    /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  );
  assert.match(
    workflow,
    /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.PRODUCTION_DB_PASSWORD \}\}/,
  );
  assert.doesNotMatch(
    workflow,
    /(?:echo|printf).*SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD)/,
  );
  assert.doesNotMatch(
    workflow,
    /(?:workflow\.inputs|inputs\.|--db-url|printenv)/,
  );
});

test("PR33 rail pins exactly the three reviewed migrations and excludes frozen PR2", () => {
  for (const value of [...targets, ...blobs, ...pr2])
    assert.match(workflow, new RegExp(value));
  const targetLists = [
    ...workflow.matchAll(/readonly target_versions=\(([\s\S]*?)\)/g),
  ].map((match) =>
    [...match[1].matchAll(/"(\d{14})"/g)].map((value) => value[1]),
  );
  assert.equal(targetLists.length, 2);
  for (const targetList of targetLists) assert.deepEqual(targetList, targets);
  const targetFiles = workflow.match(
    /readonly target_files=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetFiles);
  assert.deepEqual(
    [...targetFiles.matchAll(/"([^"\n]+\.sql)"/g)].map((value) => value[1]),
    [
      "20260813160000_operations_integrity_master_batch.sql",
      "20260813161000_catalog_reconciliation_preview_apply.sql",
      "20260815131138_grant_basic_medical_confirmation_signer_snapshot.sql",
    ],
  );
  const targetBlobs = workflow.match(
    /readonly target_blobs=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetBlobs);
  assert.deepEqual(
    [...targetBlobs.matchAll(/"([0-9a-f]{40})"/g)].map((value) => value[1]),
    blobs,
  );
  assert.match(workflow, /git hash-object "\$file"/);
  assert.match(workflow, /frozen PR #2 migration is already applied remotely/);
  assert.match(workflow, /frozen PR #2 migration is present locally/);
  assert.match(
    workflow,
    /remote history is not exactly the reviewed baseline through 20260813150000/,
  );
});

test("capacity preflight is fixed SELECT-only and blocks bad non-null values before push", () => {
  const capacityIndex = workflow.indexOf(
    "Preflight room capacity data without mutation",
  );
  const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
  assert.ok(capacityIndex >= 0 && capacityIndex < dryRunIndex);
  assert.match(
    workflow,
    /from public\.rooms\n          where capacity is not null and capacity < 1/,
  );
  assert.match(workflow, /ROOM_CAPACITY_DATA_PREFLIGHT_FAILED/);
  assert.match(workflow, /'room_code'/);
  assert.match(workflow, /'building_code'/);
  assert.doesNotMatch(
    workflow,
    /(?:insert|update|delete|merge|upsert|create|alter|drop|grant|revoke|truncate)\s+(?:into|table|on|public\.)/i,
  );
});

test("dry run and postcheck mechanically constrain the only normal push", () => {
  const historyIndex = workflow.indexOf(
    "Preflight the exact production migration history",
  );
  const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
  const pushIndex = workflow.indexOf("supabase db push --linked\n");
  const verifyIndex = workflow.indexOf(
    "Verify the exact final migration history",
  );
  assert.ok(
    historyIndex >= 0 &&
      dryRunIndex > historyIndex &&
      pushIndex > dryRunIndex &&
      verifyIndex > pushIndex,
  );
  assert.equal(
    (workflow.match(/supabase db push --linked\n/g) ?? []).length,
    1,
  );
  assert.match(workflow, /remote history gained an unexpected migration/);
  assert.match(
    workflow,
    /remote history differs from the exact reviewed local history/,
  );
  for (const forbidden of [
    "migration repair",
    "db reset",
    "include-all",
    "seed",
    "psql",
    "migration up",
    "migration down",
  ]) {
    assert.doesNotMatch(workflow.toLowerCase(), new RegExp(forbidden));
  }
});

test("signer snapshot permissions are fail-closed before and after the only push", () => {
  const signerPreflightIndex = workflow.indexOf(
    "Preflight signer snapshot permissions without mutation",
  );
  const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
  const pushIndex = workflow.indexOf("supabase db push --linked\n");
  const historyPostcheckIndex = workflow.indexOf(
    "Verify the exact final migration history",
  );
  const signerPostcheckIndex = workflow.indexOf(
    "Verify signer snapshot permissions after migration",
  );
  assert.ok(
    signerPreflightIndex >= 0 &&
      signerPreflightIndex < dryRunIndex &&
      signerPostcheckIndex > historyPostcheckIndex &&
      signerPostcheckIndex > pushIndex,
  );
  for (const assertion of [
    "authenticated_signer_name_snapshot_select",
    "authenticated_signature_data_select",
    "authenticated_table_select",
    "anon_signer_name_snapshot_select",
    "rls_enabled",
    "has_column_privilege(",
    "has_table_privilege(",
    "c.relrowsecurity",
    "SIGNER_PERMISSION_PREFLIGHT_FAILED",
    "SIGNER_PERMISSION_POSTCHECK_FAILED",
  ]) {
    assert.match(workflow, new RegExp(assertion.replace(/[()]/g, "\\$&")));
  }
  const signerPreflight = workflow.slice(signerPreflightIndex, dryRunIndex);
  const signerPostcheck = workflow.slice(signerPostcheckIndex);
  assert.match(
    signerPreflight,
    /authenticated_signer_name_snapshot_select: false/,
  );
  assert.match(
    signerPostcheck,
    /authenticated_signer_name_snapshot_select: true/,
  );
  for (const expectedFalse of [
    "authenticated_signature_data_select",
    "authenticated_table_select",
    "anon_signer_name_snapshot_select",
  ]) {
    assert.match(signerPreflight, new RegExp(`${expectedFalse}: false`));
    assert.match(signerPostcheck, new RegExp(`${expectedFalse}: false`));
  }
  assert.match(signerPreflight, /rls_enabled: true/);
  assert.match(signerPostcheck, /rls_enabled: true/);
});
