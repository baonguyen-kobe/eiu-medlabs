import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/production-pr19-migrations.yml",
    import.meta.url,
  ),
  "utf8",
);

const approvedPrePr19Versions = [
  "20260810160016",
  "20260811133000",
  "20260811150000",
];

const pr19Versions = [
  "20260811230000",
  "20260812000000",
  "20260812010000",
  "20260812022922",
  "20260812030000",
];

const approvedBlobHashes = [
  "e8baacbe085b25bbbf5c1c011a2436a8e089b620",
  "48e1870bcbe7738490c5fe5c1b3bdff07bc2e453",
  "adfad9ef58ac319e661eb474f904b5fa67717882",
  "76e7cfc0cee323cee98724bd292fc4084457d383",
  "f1f52f980db36080bfd6fbbbd01f7f9a5d0466cb",
  "67a346fe9b00c4688bb1c874365309a530352c48",
  "6f997f1fdcb240884ed0f7a9b2f09c750faa47fe",
  "f0ce8af271a15197ab188685001b54bb1f59a1aa",
];

const forbiddenVersions = [
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

test("production migration workflow has no dispatcher-controlled release inputs", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: production-pr19-migrations\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" != "refs\/heads\/main" \]\]/);
  assert.match(workflow, /supabase link --project-ref "\$PROJECT_REF" --yes/);
  assert.doesNotMatch(workflow, /(?:--db-url|workflow\.inputs|inputs\.)/);
});

test("dry-run mechanically gates a normal Supabase push to the approved pending set", () => {
  for (const version of [...approvedPrePr19Versions, ...pr19Versions]) {
    assert.match(workflow, new RegExp(`"${version}"`, "g"));
  }
  for (const version of forbiddenVersions) {
    assert.match(workflow, new RegExp(`"${version}"`, "g"));
  }

  const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
  const allowlistIndex = workflow.indexOf(
    "Dry-run allowlist: APPROVED PENDING SET / PASS",
  );
  const pushIndex = workflow.indexOf("supabase db push --linked\n");
  const postVerificationIndex = workflow.indexOf(
    "Verify the applied migration history",
  );

  assert.ok(dryRunIndex >= 0);
  assert.ok(allowlistIndex > dryRunIndex);
  assert.ok(pushIndex > allowlistIndex);
  assert.ok(postVerificationIndex > pushIndex);
  assert.match(workflow, /MIGRATION_ALLOWLIST_MISMATCH/);
  assert.match(workflow, /POST_PUSH_MIGRATION_VERIFICATION_FAILED/);
  assert.match(workflow, /migration list --linked --output-format json/g);
  assert.match(workflow, /grep -oE '20\[0-9\]\{12\}'/);
  assert.match(
    workflow,
    /mapfile -t expected_pending_versions < "\$RUNNER_TEMP\/pr19-approved-pending-versions\.txt"/,
  );
});

test("release identity pins every approved migration and computes only approved local-only versions", () => {
  for (const hash of approvedBlobHashes) {
    assert.match(workflow, new RegExp(hash));
  }
  assert.match(
    workflow,
    /git hash-object "supabase\/migrations\/\$file"\)" != "\$\{expected_blob_hashes\[\$index\]\}"/,
  );

  const preflightIndex = workflow.indexOf(
    "Preflight the official migration history",
  );
  const remoteForbiddenIndex = workflow.indexOf(
    "frozen PR #2 migration is already applied remotely",
  );
  const historyDivergenceIndex = workflow.indexOf(
    "production migration history contains an unknown remote version",
  );
  const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
  const actualPushIndex = workflow.indexOf("supabase db push --linked\n");

  assert.ok(preflightIndex >= 0);
  assert.ok(remoteForbiddenIndex > preflightIndex);
  assert.ok(historyDivergenceIndex > remoteForbiddenIndex);
  assert.ok(dryRunIndex > historyDivergenceIndex);
  assert.ok(actualPushIndex > dryRunIndex);
  assert.match(
    workflow,
    /production migration history is missing a required baseline version/,
  );
  assert.match(workflow, /approved_pending_versions=\(\)/);
  assert.match(workflow, /approved_pre_pr19_versions/);
  assert.match(workflow, /pr19_versions/);
  assert.match(
    workflow,
    /no approved pending migrations remain for this rollout/,
  );
});

test("workflow excludes unsafe migration, seed, SQL, and secret-handling paths", () => {
  for (const forbidden of [
    "supabase db reset",
    "supabase migration repair",
    "supabase migration down",
    "supabase migration up --include-all",
    "supabase db push --include-all",
    "--include-seed",
    "psql",
    "seed",
    "db-url",
  ]) {
    assert.doesNotMatch(workflow.toLowerCase(), new RegExp(forbidden));
  }

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
  assert.doesNotMatch(workflow, /(?:printenv|^\s*env\s*$)/m);
});
