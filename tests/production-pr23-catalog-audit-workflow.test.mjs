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
