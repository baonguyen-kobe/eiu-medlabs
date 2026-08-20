import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/production-pr62-pr64-migrations.yml",
    import.meta.url,
  ),
  "utf8",
).then((contents) => contents.replace(/\r\n/g, "\n"));

const approvedBaseline = "596fb891ee422d315aaef32c8e22c10c501d2094";

const targets = ["20260819140000", "20260819231500"];
const targetFiles = [
  "20260819140000_consolidated_skills_class_edit_and_equipment_lock.sql",
  "20260819231500_post_pr62_cancellation_and_claim_hardening.sql",
];
const blobs = [
  "af359cb1e0372c097974eaaa86a17b50346192a3",
  "0c20d83348500c1460eba3906e5cf4540e70e5d2",
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
const allowedDeltaPaths = [
  ".github/workflows/production-pr62-pr64-migrations.yml",
  "tests/production-pr62-pr64-migrations-workflow.test.mjs",
];

test("PR62/PR64 production migration rail is fixed, main-only, and credential-safe", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: production-pr62-pr64-migrations\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(workflow, /self-hosted/);
  assert.doesNotMatch(workflow, /eiu-medlabs-ci/);
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

test("PR62/PR64 rail pins approved baseline SHA and exact allowed release delta", () => {
  assert.match(workflow, new RegExp(approvedBaseline));
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$approved_baseline" HEAD/,
  );
  assert.match(
    workflow,
    /git diff --name-only "\$approved_baseline\.\.\.HEAD"/,
  );
  for (const deltaPath of allowedDeltaPaths) {
    assert.match(workflow, new RegExp(deltaPath.replace(/\./g, "\\.")));
  }
});

test("PR62/PR64 rail pins exactly the two reviewed migrations, blobs, and excludes frozen PR2", () => {
  for (const value of [...targets, ...blobs, ...pr2, ...targetFiles]) {
    assert.match(workflow, new RegExp(value));
  }

  const targetLists = [
    ...workflow.matchAll(/readonly target_versions=\(([\s\S]*?)\)/g),
  ].map((match) =>
    [...match[1].matchAll(/"(\d{14})"/g)].map((value) => value[1]),
  );
  assert.ok(targetLists.length >= 2);
  for (const targetList of targetLists) {
    assert.deepEqual(targetList, targets);
  }

  const targetFilesMatched = workflow.match(
    /readonly target_files=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetFilesMatched);
  assert.deepEqual(
    [...targetFilesMatched.matchAll(/"([^"\n]+\.sql)"/g)].map(
      (value) => value[1],
    ),
    targetFiles,
  );

  const targetBlobsMatched = workflow.match(
    /readonly target_blobs=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetBlobsMatched);
  assert.deepEqual(
    [...targetBlobsMatched.matchAll(/"([0-9a-f]{40})"/g)].map(
      (value) => value[1],
    ),
    blobs,
  );

  assert.match(workflow, /git hash-object "\$file"/);
  assert.match(workflow, /frozen PR #2 migration is already applied remotely/);
  assert.match(workflow, /frozen PR #2 migration is present locally/);
  assert.match(
    workflow,
    /remote history is not exactly the reviewed baseline through 20260818170000/,
  );
  assert.match(
    workflow,
    /local migrations after 20260818170000 do not match the exact target set/,
  );
});

test("PR62/PR64 rail enforces dry-run and exactly one mutating push", () => {
  assert.match(workflow, /supabase db push --linked --dry-run/);
  assert.match(
    workflow,
    /grep -oE '20\[0-9\]\{12\}' "\$RUNNER_TEMP\/pr62-pr64-migrations-dry-run\.txt"/,
  );

  const pushMatches = [
    ...workflow.matchAll(/supabase db push --linked(?!\s+--dry-run)/g),
  ];
  assert.equal(pushMatches.length, 1);

  assert.doesNotMatch(workflow, /migration repair/);
  assert.doesNotMatch(workflow, /db reset/);
  assert.doesNotMatch(workflow, /--include-all/);
  assert.doesNotMatch(workflow, /--include-seed/);
  assert.doesNotMatch(workflow, /--include-roles/);
  assert.doesNotMatch(workflow, /deploy-production/);
  assert.doesNotMatch(workflow, /vercel/i);
});

test("PR62/PR64 postcheck is fixed SELECT-only and asserts contracts, locks, and cancellation", () => {
  assert.match(
    workflow,
    /cat > "\$RUNNER_TEMP\/pr62-pr64-db-contract-postcheck\.sql" <<'SQL'/,
  );
  assert.match(workflow, /select jsonb_build_object\(/);
  assert.match(workflow, /private_equipment_helper_exists/);
  assert.match(workflow, /private_equipment_helper_secdef/);
  assert.match(workflow, /private_equipment_helper_public_execute/);
  assert.match(workflow, /private_equipment_helper_anon_execute/);
  assert.match(workflow, /private_equipment_helper_authenticated_execute/);
  assert.match(workflow, /get_lock_status_rpc_exists/);
  assert.match(workflow, /get_lock_status_authenticated_execute/);
  assert.match(workflow, /update_skills_lab_rpc_exists/);
  assert.match(workflow, /update_skills_lab_authenticated_execute/);
  assert.match(workflow, /claim_class_rpc_exists/);
  assert.match(workflow, /claim_class_authenticated_execute/);
  assert.match(workflow, /private\.class_schedule_has_equipment_request/);
  assert.match(workflow, /CLASS_EQUIPMENT_REQUEST_EXISTS/);
  assert.match(workflow, /cancel_basic_medical_session_exists/);
  assert.match(workflow, /cancel_basic_medical_session_authenticated_execute/);
  assert.match(workflow, /private\.is_admin\(\)/);
  assert.match(workflow, /registration_creator_id = actor_id/);
  assert.match(workflow, /session_row\.teaching_lecturer_id = actor_id/);
  assert.match(
    workflow,
    /BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED/,
  );
  assert.match(workflow, /cancelled_by/);
  assert.match(workflow, /cancellation_reason/);
  assert.match(
    workflow,
    /private\.enqueue_basic_medical_schedule_outbox_event/,
  );
  assert.match(workflow, /basic_medical\.session_cancelled/);
});
