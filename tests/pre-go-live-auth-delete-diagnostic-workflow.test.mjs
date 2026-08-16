import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/pre-go-live-auth-delete-diagnostic.yml",
    import.meta.url,
  ),
  "utf8",
).then((contents) => contents.replace(/\r\n/g, "\n"));

test("Auth delete diagnostic is dispatch-only, main-only, clean, and fixed-target", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /workflow_dispatch:\n\s+inputs:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(
    workflow,
    /group: pre-go-live-auth-delete-readonly-diagnostic\n  cancel-in-progress: false/,
  );
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /git diff --quiet/);
  assert.match(workflow, /git status --porcelain/);
  assert.match(workflow, /actions\/checkout@v7[\s\S]*?ref: main/);
  assert.match(workflow, /actions\/setup-node@v7[\s\S]*?node-version: 24/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.equal(
    (workflow.match(/supabase projects list --output-format json/g) ?? [])
      .length,
    2,
  );
  assert.match(workflow, /supabase link --project-ref "\$PROJECT_REF" --yes/);
  assert.match(
    workflow,
    /project\.id === process\.env\.PROJECT_REF && project\.ref === process\.env\.PROJECT_REF/,
  );
  assert.match(workflow, /project\.linked === true/);
});

test("Auth Admin inspection is paginated, count-only, and has a step-scoped secret", () => {
  const jobEnvironment = workflow.match(
    /jobs:\n  diagnostic:[\s\S]*?\n    steps:/,
  )?.[0];
  assert.ok(jobEnvironment);
  assert.doesNotMatch(jobEnvironment, /PRODUCTION_SUPABASE_SECRET_KEY/);

  const authStep = workflow.match(
    /      - name: Count Auth Admin users through the read-only paginated API[\s\S]*?(?=\n      - name:|\n      - uses:|$)/,
  )?.[0];
  assert.ok(authStep);
  assert.match(
    authStep,
    /PRODUCTION_SUPABASE_SECRET_KEY: \$\{\{ secrets\.PRODUCTION_SUPABASE_SECRET_KEY \}\}/,
  );
  assert.equal(
    (workflow.match(/^\s+PRODUCTION_SUPABASE_SECRET_KEY:/gm) ?? []).length,
    1,
  );
  assert.match(authStep, /const projectRef = 'bwhiivfhezoozrzvchmm'/);
  assert.match(authStep, /auth\.admin\.listUsers\(\{ page, perPage \}\)/);
  assert.match(authStep, /for \(let page = 1; ; page \+= 1\)/);
  assert.match(authStep, /const perPage = 1000/);
  assert.match(authStep, /AUTH_ADMIN_USER_COUNT=\$\{count\}/);
  assert.doesNotMatch(
    authStep,
    /console\.log\([^)]*(?:users|data|error|email|id|metadata|token)/i,
  );
});

test("database and FK inspection are select-only and output only approved fields", () => {
  assert.equal(
    (
      workflow.match(
        /supabase db query --linked --output-format json --file/g,
      ) ?? []
    ).length,
    2,
  );
  for (const required of [
    "select jsonb_build_object(",
    "from public.profiles",
    "from storage.buckets",
    "from storage.objects",
    "from pg_constraint as constraint_catalog",
    "constraint_catalog.confrelid = 'public.profiles'::regclass",
    "profile_id.attname = 'id'",
    "constraint_catalog.confdeltype",
    "constraint_catalog.confdeltype in ('r', 'a')",
    "query_to_xml(",
    "PROFILE_FK table=${row.table_schema}.${row.table_name}; column=${row.column_name}; constraint=${row.constraint_name}; delete_action=${row.delete_action}; referenced_row_count=${count}",
  ]) {
    assert.match(
      workflow,
      new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.doesNotMatch(
    workflow,
    /\b(?:insert|update|merge|alter|drop|grant|revoke|truncate)\b/i,
  );
});

test("Management log diagnostic is read-only and never prints raw log data", () => {
  const logStep = workflow.match(
    /      - name: Attempt a sanitized read-only Management API log diagnostic[\s\S]*$/,
  )?.[0];
  assert.ok(logStep);
  assert.match(
    logStep,
    /https:\/\/api\.supabase\.com\/v1\/projects\/\$PROJECT_REF\/analytics\/endpoints\/logs/,
  );
  assert.match(logStep, /2026-08-16T07:29:58Z/);
  assert.match(logStep, /2026-08-16T07:30:02Z/);
  for (const category of [
    "ROOT_ADMIN_PROFILE_DELETE_PROTECTED",
    "FOREIGN_KEY_RESTRICTED",
    "PERMISSION_DENIED",
    "UNCLASSIFIED",
    "UNAVAILABLE",
  ]) {
    assert.match(logStep, new RegExp(category));
  }
  assert.match(logStep, /LOG_ROOT_CAUSE_DETAIL=\$\{detail\}/);
  assert.doesNotMatch(
    logStep,
    /console\.log\([^)]*(?:content|resultPath|statusCode|error|message|response|body)/i,
  );
  assert.doesNotMatch(
    logStep,
    /JSON\.stringify\((?:error|content|response|body)/i,
  );
});

test("workflow has no mutation, reset, deploy, or old-rail path", () => {
  for (const forbidden of [
    "auth.admin.deleteUser",
    "auth.admin.updateUserById",
    "auth.admin.createUser",
    "db reset",
    "db push",
    "migration repair",
    "migration up",
    "migration down",
    "storage.deleteBucket",
    "emptyBucket",
    "storage.remove",
    "deploy-production",
    "vercel",
    "pre-go-live-clean-reset.yml",
  ]) {
    assert.doesNotMatch(
      workflow.toLowerCase(),
      new RegExp(forbidden.toLowerCase()),
    );
  }
  assert.doesNotMatch(
    workflow,
    /(?:delete from|create table|drop table|alter table)/i,
  );
});
