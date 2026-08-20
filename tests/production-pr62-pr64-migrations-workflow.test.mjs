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

// Exact allowed release delta — deterministic sorted order, no wildcards
const exactAllowedDeltaPaths = [
  ".github/workflows/production-pr62-pr64-migrations.yml",
  "tests/e2e/personnel-management.spec.ts",
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

test("PR62/PR64 rail pins approved baseline SHA and exact allowed release delta (parsed exact-array, no wildcards)", () => {
  assert.match(workflow, new RegExp(approvedBaseline));
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$approved_baseline" HEAD/,
  );
  assert.match(
    workflow,
    /git diff --name-only "\$approved_baseline\.\.\.HEAD"/,
  );

  // Parse the readonly allowed_delta_paths=(...) array from the workflow
  const deltaArrayMatch = workflow.match(
    /readonly allowed_delta_paths=\(([\s\S]*?)\)/,
  );
  assert.ok(deltaArrayMatch, "allowed_delta_paths array must be present");
  const parsedPaths = [...deltaArrayMatch[1].matchAll(/"([^"\n]+)"/g)].map(
    (m) => m[1],
  );

  // Assert exact equality — no missing path, no extra path, no wildcard
  assert.deepEqual(
    parsedPaths,
    exactAllowedDeltaPaths,
    "allowed_delta_paths must equal exactly the three reviewed paths in sorted order",
  );

  // Assert no wildcard patterns in the delta paths array
  assert.doesNotMatch(
    deltaArrayMatch[1],
    /\*/,
    "allowed_delta_paths must not contain wildcards",
  );
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

test("PR62/PR64 postcheck uses proven --file mechanism, captures JSON, no positional SQL arg", () => {
  // SQL written to a file
  assert.match(
    workflow,
    /cat > "\$RUNNER_TEMP\/pr62-pr64-db-contract-postcheck\.sql" <<'SQL'/,
  );

  // Query invoked via --file, not via positional SQL argument
  assert.match(
    workflow,
    /supabase db query\s+\\\s+--linked\s+\\\s+--output-format json\s+\\\s+--file "\$RUNNER_TEMP\/pr62-pr64-db-contract-postcheck\.sql"/,
  );

  // Result captured to a JSON file
  assert.match(
    workflow,
    /> "\$RUNNER_TEMP\/pr62-pr64-db-contract-after\.json"/,
  );

  // Node reads the JSON file, not execFileSync
  assert.match(
    workflow,
    /readFileSync\(process\.env\.RUNNER_TEMP \+ '\/pr62-pr64-db-contract-after\.json'/,
  );

  // No raw SQL as positional argument (execFileSync with sql variable)
  assert.doesNotMatch(workflow, /execFileSync.*supabase/s);
  assert.doesNotMatch(workflow, /'supabase',\s*\[\s*'--no-install'/s);

  // Exactly one db query invocation
  const queryMatches = [...workflow.matchAll(/supabase db query/g)];
  assert.equal(
    queryMatches.length,
    1,
    "must have exactly one supabase db query invocation",
  );
});

test("PR62/PR64 postcheck SQL heredoc is SELECT-only with no mutation statements", () => {
  // Extract the SQL heredoc between the SQL markers
  const heredocMatch = workflow.match(
    /cat > "\$RUNNER_TEMP\/pr62-pr64-db-contract-postcheck\.sql" <<'SQL'\n([\s\S]*?)\n\s+SQL\n/,
  );
  assert.ok(heredocMatch, "SQL heredoc must be extractable from the workflow");
  const sql = heredocMatch[1].trim().toLowerCase();

  // A: SQL begins with 'select'
  assert.match(sql, /^select\b/, "postcheck SQL must begin with SELECT");

  // B: Contains reviewed pg_catalog introspection contract
  assert.match(sql, /has_function_privilege/);
  assert.match(sql, /pg_get_functiondef/);
  assert.match(sql, /to_regprocedure/);
  assert.match(sql, /jsonb_build_object/);

  // C: No mutation keywords as executable statements
  // Scan the SQL text (not JavaScript error strings) for mutation keywords
  const mutationPattern =
    /^\s*(?:insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke)\b/m;
  assert.doesNotMatch(
    sql,
    mutationPattern,
    "postcheck SQL must not contain mutation statements",
  );

  // D: Workflow invokes the heredoc via --file
  assert.match(
    workflow,
    /--file "\$RUNNER_TEMP\/pr62-pr64-db-contract-postcheck\.sql"/,
  );

  // E: No second db query invocation
  const queryMatches = [...workflow.matchAll(/supabase db query/g)];
  assert.equal(queryMatches.length, 1);
});

test("PR62/PR64 postcheck uses exact reviewed regprocedure signatures and rejects stale signatures", () => {
  const reviewedLockedSignatures = [
    "public.withdraw_class(uuid)",
    "public.delete_skills_lab_class_schedule(uuid)",
    "public.reschedule_class(uuid,date)",
    "public.assign_class_lecturers(uuid,uuid[])",
    "public.update_class_schedule_details_core(uuid,date,time,time,uuid,integer,uuid[])",
  ];

  for (const sig of reviewedLockedSignatures) {
    const escapedSig = sig
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/,/g, "\\s*,\\s*");
    assert.match(
      workflow,
      new RegExp(`to_regprocedure\\('${escapedSig}'\\)`),
      `workflow must contain exact regprocedure lookup for: ${sig}`,
    );
  }

  // Other reviewed functions
  assert.match(workflow, /to_regprocedure\('public\.claim_class\(uuid\)'\)/);
  assert.match(
    workflow,
    /to_regprocedure\('public\.cancel_basic_medical_session\(uuid,text\)'\)/,
  );
  assert.match(
    workflow,
    /to_regprocedure\('public\.update_skills_lab_class_schedule\(uuid,date,time,time,uuid,uuid,integer,uuid\[\]\)'\)/,
  );
  assert.match(
    workflow,
    /to_regprocedure\('public\.get_class_schedules_equipment_lock_status\(uuid\[\]\)'\)/,
  );
  assert.match(
    workflow,
    /to_regprocedure\('private\.class_schedule_has_equipment_request\(uuid\)'\)/,
  );

  // Explicitly reject the three stale signatures
  const staleSignatures = [
    /reschedule_class\(uuid,\s*date,\s*time,\s*time,\s*uuid\)/,
    /assign_class_lecturers\(uuid,\s*uuid,\s*uuid\)/,
    /update_class_schedule_details_core\(uuid,\s*text,\s*integer,\s*text\)/,
    /target_schedule_id uuid, target_schedule_date date, target_start_time time/,
    /target_schedule_id uuid, target_lecturer_id uuid, target_second_lecturer_id uuid/,
    /target_schedule_id uuid, target_class_code text, target_student_count integer/,
  ];

  for (const stale of staleSignatures) {
    assert.doesNotMatch(
      workflow,
      stale,
      `workflow must NOT contain stale function signature: ${stale}`,
    );
  }
});

test("PR62/PR64 postcheck is SELECT-only and asserts contracts, locks, and cancellation", () => {
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
