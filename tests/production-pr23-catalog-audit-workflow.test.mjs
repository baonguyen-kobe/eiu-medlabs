import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL(
    "../.github/workflows/production-pr23-catalog-audit.yml",
    import.meta.url,
  ),
  "utf8",
);

test("PR #23 catalog audit workflow is dispatch-only and uses the fixed linked project", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:$/m);
  assert.match(workflow, /PROJECT_REF: bwhiivfhezoozrzvchmm/);
  assert.match(
    workflow,
    /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.PRODUCTION_DB_PASSWORD \}\}/,
  );
  assert.match(workflow, /supabase link --project-ref "\$PROJECT_REF" --yes/);
  assert.match(
    workflow,
    /supabase db query --linked --output-format json --file/,
  );
});

test("PR #23 catalog audit selects only the approved catalog evidence", () => {
  const auditSql = workflow.match(
    /^          with catalog as \([\s\S]*?^          SQL$/m,
  )?.[0];

  assert.ok(auditSql, "the fixed audit SELECT must be present");
  assert.match(workflow, /with catalog as \(/);
  assert.match(workflow, /lower\(btrim\(catalog\.commercial_name\)\)/);
  assert.match(workflow, /public\.basic_medical_room_inventory as inventory/);
  assert.match(workflow, /basic_medical_equipment_catalog as catalog/);
  assert.match(workflow, /name: pr23-commercial-name-audit/);
  assert.doesNotMatch(
    auditSql,
    /\b(insert|update|delete|merge|upsert|create|alter|drop|grant|revoke|truncate)\b/i,
  );
  assert.doesNotMatch(workflow, /\bsupabase db (push|reset|pull|repair)\b/i);
});

test("the audit safety gate extracts the fixed SELECT heredoc", () => {
  const firstLine = workflow.match(/^          with catalog as \($/m)?.[0];

  assert.equal(firstLine, "          with catalog as (");
  assert.ok(
    workflow.includes("const startMarker = '          with catalog as (\\n';"),
    "the Node safety gate must use the exact SQL start marker",
  );
  assert.ok(workflow.includes("const endMarker = '\\n          SQL';"));
});
