import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/pre-go-live-storage-cleanup.yml",
    import.meta.url,
  ),
  "utf8",
).then((contents) => contents.replace(/\r\n/g, "\n"));

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

const storageApiSteps = [
  "Prove the exact empty Storage state",
  "Delete only the confirmed empty Storage bucket",
  "Re-list Storage state after cleanup",
];

test("Storage cleanup rail is dispatch-only, main-only, fixed-target, and noncancelling", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: pre-go-live-storage-cleanup\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /actions\/checkout@v7[\s\S]*?ref: main/);
  assert.match(workflow, /actions\/setup-node@v7[\s\S]*?node-version: 24/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  const jobEnvironment = workflow.match(
    /    env:\n([\s\S]*?)\n\n    steps:/,
  )?.[1];
  assert.ok(jobEnvironment);
  assert.match(jobEnvironment, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.doesNotMatch(jobEnvironment, /PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.equal(
    (
      workflow.match(
        /^          PRODUCTION_SUPABASE_SECRET_KEY: \$\{\{ secrets\.PRODUCTION_SUPABASE_SECRET_KEY \}\}$/gm,
      ) ?? []
    ).length,
    3,
  );
  for (const step of storageApiSteps) {
    assert.match(
      workflow,
      new RegExp(
        `- name: ${step}\\n        shell: bash\\n        env:\\n          PRODUCTION_SUPABASE_SECRET_KEY: \\$\\{\\{ secrets\\.PRODUCTION_SUPABASE_SECRET_KEY \\}\\}\\n        run:`,
      ),
    );
  }
  assert.doesNotMatch(
    workflow,
    /(?:echo|printf).*PRODUCTION_SUPABASE_SECRET_KEY/,
  );
  assert.doesNotMatch(
    workflow,
    /(?:inputs\.|workflow\.inputs|--db-url|printenv)/,
  );
});

test("Storage API is reached only after multi-signal target proof and read-only migration observation", () => {
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
  assert.match(
    workflow,
    /supabase migration list --linked --output-format json/,
  );
  assert.ok(
    workflow.indexOf(
      "Record read-only migration identity before Storage API use",
    ) < workflow.indexOf("Prove the exact empty Storage state"),
  );
  assert.ok(
    workflow.indexOf("Prove the exact empty Storage state") <
      workflow.indexOf("Delete only the confirmed empty Storage bucket"),
  );
  for (const version of frozenPr2) assert.match(workflow, new RegExp(version));
  assert.match(workflow, /STORAGE_CLEANUP_FROZEN_PR2_PRESENT/);
});

test("only a single confirmed-empty bucket can be removed through the Storage SDK", () => {
  assert.equal((workflow.match(/\.storage\.deleteBucket\(/g) ?? []).length, 1);
  assert.equal((workflow.match(/\.storage\.listBuckets\(/g) ?? []).length, 3);
  assert.equal((workflow.match(/\.storage\.from\(/g) ?? []).length, 2);
  for (const assertion of [
    "STORAGE_CLEANUP_BUCKET_COUNT_MISMATCH",
    "STORAGE_CLEANUP_OBJECTS_PRESENT",
    "STORAGE_CLEANUP_POSTCONDITION_FAILED",
    "Pre-cleanup Storage counts: buckets=1; objects=0",
    "Post-cleanup Storage counts: buckets=0; objects=0",
  ]) {
    assert.match(workflow, new RegExp(assertion));
  }
  assert.doesNotMatch(workflow, /(?:emptyBucket|\.remove\(|storage rm)/i);
  assert.doesNotMatch(
    workflow,
    /console\.log\([^\n]*(?:bucket\.id|buckets\[0\]|entries)/,
  );
});

test("workflow excludes database, migration, seed, Auth, deploy, and old-rail operations", () => {
  for (const forbidden of [
    "db reset",
    "db push",
    "migration repair",
    "migration up",
    "migration down",
    "schema_migrations",
    "seed-local-users",
    "bootstrap-personnel",
    "personnel:bootstrap",
    "create_test_users",
    "deploy-production",
    "vercel",
    "production-pr33-migrations",
    "pre-go-live-clean-reset",
    "supabase db query",
    "psql",
    "\\.auth\\.",
  ]) {
    assert.doesNotMatch(workflow.toLowerCase(), new RegExp(forbidden));
  }
});
