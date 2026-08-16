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

test("Management log diagnostic uses bounded, separate read-only source queries", () => {
  const logStep = workflow.match(
    /      - name: Query bounded Auth and Postgres Management logs with sanitized output only[\s\S]*$/,
  )?.[0];
  assert.ok(logStep);
  assert.match(
    logStep,
    /https:\/\/api\.supabase\.com\/v1\/projects\/\$PROJECT_REF\/analytics\/endpoints\/logs/,
  );
  assert.match(logStep, /2026-08-16T09:43:30Z/);
  assert.match(logStep, /2026-08-16T09:45:00Z/);
  assert.equal((logStep.match(/--request GET/g) ?? []).length, 2);
  assert.equal((logStep.match(/--get/g) ?? []).length, 2);
  assert.equal((logStep.match(/--data-urlencode "sql=\$/g) ?? []).length, 2);
  assert.match(logStep, /source = 'auth_logs'/);
  assert.match(logStep, /source = 'postgres_logs'/);
  assert.match(logStep, /severity_text in \('ERROR', 'FATAL', 'PANIC'\)/);
  assert.match(logStep, /supabase_auth_admin/);
  assert.match(
    logStep,
    /log_attributes\['parsed\.sql_state_code'\] as sql_state_code/,
  );
  assert.match(
    logStep,
    /log_attributes\['parsed\.user_name'\] as parsed_user_name/,
  );
  assert.match(logStep, /--output "\$RUNNER_TEMP\/auth-logs\.json"/);
  assert.match(logStep, /--output "\$RUNNER_TEMP\/postgres-logs\.json"/);
  assert.doesNotMatch(
    logStep,
    /actions\/upload-artifact|\.zip|\.tar|artifact/i,
  );
  const uuidPatternSource = String.raw`\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b`;
  const uuidRedactor = new RegExp(uuidPatternSource, "gi");
  assert.ok(
    logStep.includes(
      String.raw`.replace(/${uuidPatternSource}/gi, '[REDACTED_UUID]')`,
    ),
  );
  for (const uuid of [
    "00000000-0000-0000-0000-000000000000",
    "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
  ]) {
    assert.equal(
      uuid.replace(uuidRedactor, "[REDACTED_UUID]"),
      "[REDACTED_UUID]",
    );
  }
  for (const marker of [
    "[REDACTED_UUID]",
    "[REDACTED_EMAIL]",
    "[REDACTED_JWT]",
    "[REDACTED_TOKEN]",
    "[REDACTED_API_KEY]",
    "[REDACTED_USER_ID]",
    "ROOT_ADMIN_PROFILE_DELETE_PROTECTED",
    "FOREIGN_KEY_RESTRICTED",
    "PERMISSION_DENIED",
    "UNAVAILABLE",
  ]) {
    assert.match(
      logStep,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(logStep, /LOG_ROOT_CAUSE_DETAIL=\$\{classify\(/);
  assert.match(
    logStep,
    /const authEvidence = redact\(firstAuth\.event_message\)/,
  );
  assert.match(
    logStep,
    /const postgresEvidence = redact\(firstPostgres\.event_message\)/,
  );
  assert.match(
    logStep,
    /const sqlState = redact\(firstPostgres\.sql_state_code\)/,
  );
  assert.match(logStep, /AUTH_LOG_DIAGNOSTIC http_status=\$\{redact\(/);
  assert.match(logStep, /POSTGRES_LOG_DIAGNOSTIC http_status=\$\{redact\(/);
  assert.match(
    logStep,
    /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/,
  );
  assert.doesNotMatch(
    logStep,
    /console\.log\([^)]*(?:content|resultPath|error|response|body|parsed_user_name)/i,
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
    /\b(?:insert\s+into|update\s+[\w."]+|delete\s+from|merge\s+into|truncate\s+table|drop\s+table|alter\s+table|create\s+table)\b/i,
  );
});
