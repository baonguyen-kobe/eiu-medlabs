import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/pre-go-live-clean-reset.yml", import.meta.url),
  "utf8",
).then((contents) => contents.replace(/\r\n/g, "\n"));

const targets = ["20260813160000", "20260813161000", "20260815131138"];
const blobs = [
  "0b2fdf2608e523aed26416b290d8120e5f858e37",
  "49b9d767dd8f403dcfef6686ff1fe59d5ca8848d",
  "d0f8cb795af46ab676238ab74099f3008f7baf22",
];
const frozenPr2 = [
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

test("pre-go-live reset rail is main-only, dispatch-only, and fixed-target", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: pre-go-live-clean-reset\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /actions\/checkout@v7[\s\S]*?ref: main/);
  assert.match(workflow, /actions\/setup-node@v7[\s\S]*?node-version: 24/);
  assert.match(workflow, /npm ci --ignore-scripts/);
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

test("pre-go-live reset rail pins canonical migration identity and excludes frozen PR2", () => {
  for (const value of [...targets, ...blobs, ...frozenPr2, "20260815031151"])
    assert.match(workflow, new RegExp(value));
  const targetVersions = workflow.match(
    /readonly target_versions=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetVersions);
  assert.deepEqual(
    [...targetVersions.matchAll(/"(\d{14})"/g)].map((match) => match[1]),
    targets,
  );
  const targetBlobs = workflow.match(
    /readonly target_blobs=\(([\s\S]*?)\)/,
  )?.[1];
  assert.ok(targetBlobs);
  assert.deepEqual(
    [...targetBlobs.matchAll(/"([0-9a-f]{40})"/g)].map((match) => match[1]),
    blobs,
  );
  const files = workflow.match(/readonly target_files=\(([\s\S]*?)\)/)?.[1];
  assert.ok(files);
  assert.deepEqual(
    [...files.matchAll(/"([^"\n]+\.sql)"/g)].map((match) => match[1]),
    [
      "20260813160000_operations_integrity_master_batch.sql",
      "20260813161000_catalog_reconciliation_preview_apply.sql",
      "20260815131138_grant_basic_medical_confirmation_signer_snapshot.sql",
    ],
  );
  assert.match(workflow, /git hash-object "\$file"/);
  assert.match(workflow, /git diff --quiet/);
  assert.match(workflow, /git status --porcelain/);
});

test("project proof is multi-signal and observations are read-only before reset", () => {
  assert.equal(
    (workflow.match(/supabase projects list --output-format json/g) ?? [])
      .length,
    2,
  );
  assert.match(
    workflow,
    /project\.id === process\.env\.PROJECT_REF && project\.ref === process\.env\.PROJECT_REF/,
  );
  assert.match(workflow, /project\.linked === true/);
  assert.match(workflow, /supabase link --project-ref "\$PROJECT_REF" --yes/);
  assert.equal(
    (
      workflow.match(
        /supabase migration list --linked --output-format json/g,
      ) ?? []
    ).length,
    2,
  );
  assert.ok(
    workflow.indexOf("Record safe pre-reset migration identity") <
      workflow.indexOf(
        "Reset the linked disposable-test database without seed data",
      ),
  );
  assert.ok(
    workflow.indexOf(
      "Record safe pre-reset counts and block storage cleanup ambiguity",
    ) <
      workflow.indexOf(
        "Reset the linked disposable-test database without seed data",
      ),
  );
  assert.match(workflow, /storage_bucket_count/);
  assert.match(workflow, /storage_object_count/);
  assert.match(workflow, /STORAGE_CLEANUP_REVIEW_REQUIRED/);
  assert.match(workflow, /from information_schema\.tables/);
  assert.match(workflow, /from auth\.users/);
  assert.match(workflow, /from storage\.buckets/);
  assert.match(workflow, /from storage\.objects/);
});

test("disposable Auth cleanup is paginated, fixed-target, count-only, and fail-closed before reset", () => {
  const jobEnvironment = workflow.match(
    /jobs:\n  reset:[\s\S]*?\n    steps:/,
  )?.[0];
  assert.ok(jobEnvironment);
  assert.doesNotMatch(jobEnvironment, /PRODUCTION_SUPABASE_SECRET_KEY/);

  const cleanup = workflow.match(
    /      - name: Delete all disposable Auth test users before reset[\s\S]*?(?=\n      - name:|\n      - uses:|$)/,
  )?.[0];
  assert.ok(cleanup);
  assert.match(
    cleanup,
    /PRODUCTION_SUPABASE_SECRET_KEY: \$\{\{ secrets\.PRODUCTION_SUPABASE_SECRET_KEY \}\}/,
  );
  assert.equal(
    (workflow.match(/^\s+PRODUCTION_SUPABASE_SECRET_KEY:/gm) ?? []).length,
    1,
  );
  assert.equal(
    (cleanup.match(/process\.env\.PRODUCTION_SUPABASE_SECRET_KEY/g) ?? [])
      .length,
    1,
  );
  assert.match(
    cleanup,
    /node <<'NODE'\n          import \{ writeFileSync \} from 'node:fs';\n          import \{ join \} from 'node:path';\n          import \{ createClient \} from '@supabase\/supabase-js';/,
  );
  assert.doesNotMatch(cleanup, /\brequire\s*\(/);
  assert.doesNotMatch(cleanup, /\b(?:module\.exports|exports\.)/);
  assert.match(cleanup, /const beforeIds = await listAllUserIds\(\);/);
  assert.match(cleanup, /writeFileSync\(\s*join\(/);
  assert.match(cleanup, /const projectRef = 'bwhiivfhezoozrzvchmm'/);
  assert.match(cleanup, /https:\/\/\$\{projectRef\}\.supabase\.co/);
  assert.match(cleanup, /auth\.admin\.listUsers\(\{ page, perPage \}\)/);
  assert.match(cleanup, /for \(let page = 1; ; page \+= 1\)/);
  assert.match(cleanup, /const perPage = 1000/);
  assert.equal((cleanup.match(/auth\.admin\.deleteUser/g) ?? []).length, 1);
  assert.match(cleanup, /AUTH_TEST_USER_CLEANUP_FAILED/);
  assert.match(cleanup, /AUTH_TEST_USER_CLEANUP_INCOMPLETE/);
  assert.match(cleanup, /afterIds\.length !== 0/);
  assert.match(cleanup, /before_count/);
  assert.match(cleanup, /after_count/);
  assert.doesNotMatch(
    cleanup,
    /(?:email|metadata|token)\b.*console\.log|console\.log.*(?:email|metadata|token)\b/i,
  );
  assert.doesNotMatch(cleanup, /(?:db query|psql|delete from auth\.users)/i);
  assert.doesNotMatch(
    workflow,
    /storage\.deleteBucket|emptyBucket|storage\.remove/,
  );
  assert.ok(
    workflow.indexOf("Delete all disposable Auth test users before reset") <
      workflow.indexOf("Reconfirm Storage is empty immediately before reset"),
  );
  assert.ok(
    workflow.indexOf("Reconfirm Storage is empty immediately before reset") <
      workflow.indexOf(
        "Reset the linked disposable-test database without seed data",
      ),
  );
});

test("exactly one noninteractive no-seed reset is the only destructive database command", () => {
  const resetInvocations = workflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("supabase db reset"));
  assert.deepEqual(resetInvocations, [
    "npx --no-install supabase db reset --linked --no-seed --yes",
  ]);
  assert.equal((workflow.match(/supabase db reset/g) ?? []).length, 1);
  assert.doesNotMatch(resetInvocations[0], /[|<>]/);
  for (const forbiddenResetWorkaround of [
    "--db-url",
    "--project-ref",
    "--local",
    "--version",
    "--last",
    "--sql-paths",
    "--include-seed",
    "--seed",
    "yes \\|",
    "echo y \\|",
    "echo yes \\|",
    "printf",
  ]) {
    assert.doesNotMatch(
      resetInvocations[0].toLowerCase(),
      new RegExp(forbiddenResetWorkaround),
    );
  }
  for (const forbidden of [
    "db push",
    "migration repair",
    "migration up",
    "migration down",
    "schema_migrations",
    "--include-seed",
    "seed-local-users",
    "bootstrap-personnel",
    "personnel:bootstrap",
    "production-pr33-migrations",
    "create_test_users",
    "deploy-production",
    "vercel",
    "storage rm",
    "psql",
  ]) {
    assert.doesNotMatch(workflow.toLowerCase(), new RegExp(forbidden));
  }
  assert.doesNotMatch(
    workflow,
    /\b(?:insert|update|merge|alter|drop|grant|revoke|truncate)\b/i,
  );
});

test("post-reset checks require exact canonical history and hardened security", () => {
  const resetIndex = workflow.indexOf(
    "Reset the linked disposable-test database without seed data",
  );
  const historyIndex = workflow.indexOf(
    "Verify canonical migration history after reset",
  );
  const securityIndex = workflow.indexOf(
    "Verify signer security, core structures, seed absence, and auth/profile consistency",
  );
  assert.ok(
    resetIndex >= 0 &&
      historyIndex > resetIndex &&
      securityIndex > historyIndex,
  );
  assert.match(workflow, /POST_RESET_MIGRATION_HISTORY_MISMATCH/);
  assert.match(workflow, /POST_RESET_REQUIRED_MIGRATION_MISSING/);
  assert.match(workflow, /POST_RESET_FORBIDDEN_MIGRATION_PRESENT/);
  for (const assertion of [
    "authenticated_signer_name_snapshot_select",
    "authenticated_signature_data_select",
    "authenticated_table_select",
    "anon_signer_name_snapshot_select",
    "rls_enabled",
    "system_security_principals_exists",
    "personnel_authority_function_exists",
    "catalog_reconciliation_function_exists",
    "basic_medical_confirmation_exists",
    "basic_medical_confirmation_function_exists",
    "seed_course_count",
    "seed_room_count",
    "seed_shift_template_count",
    "missing_profile_auth_users_count",
    "orphan_profiles_count",
  ]) {
    assert.match(workflow, new RegExp(assertion));
  }
  const verification = workflow.slice(securityIndex);
  assert.match(verification, /authenticated_signer_name_snapshot_select: true/);
  for (const assertion of [
    "authenticated_signature_data_select",
    "authenticated_table_select",
    "anon_signer_name_snapshot_select",
  ]) {
    assert.match(verification, new RegExp(`${assertion}: false`));
  }
  assert.match(verification, /rls_enabled: true/);
  assert.match(verification, /POST_RESET_SEED_PRESENT/);
  assert.match(verification, /POST_RESET_AUTH_PROFILE_INCONSISTENT/);
});
