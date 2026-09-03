import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyChanges,
  parseNameStatusOutput,
  runCli,
  SAFE_NODE_TEST_ALLOWLIST,
} from "../scripts/ci-impact.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("SAFE_NODE_TEST_ALLOWLIST contains exactly 65 reviewed safe tests", () => {
  assert.equal(SAFE_NODE_TEST_ALLOWLIST.size, 65);

  assert.ok(
    SAFE_NODE_TEST_ALLOWLIST.has("tests/time-picker.test.mjs"),
    "must contain time-picker",
  );
  assert.ok(
    SAFE_NODE_TEST_ALLOWLIST.has("tests/sidebar-navigation-structure.test.mjs"),
    "must contain sidebar-navigation-structure",
  );
  assert.ok(
    SAFE_NODE_TEST_ALLOWLIST.has(
      "tests/basic-medical-confirmation-eligibility.test.mjs",
    ),
    "must contain basic-medical-confirmation-eligibility",
  );

  assert.equal(
    SAFE_NODE_TEST_ALLOWLIST.has("tests/local-supabase.test.mjs"),
    false,
    "must NOT contain local-supabase",
  );
  assert.equal(
    SAFE_NODE_TEST_ALLOWLIST.has("tests/staff-shifts-v2.test.mjs"),
    false,
    "must NOT contain staff-shifts-v2",
  );
  assert.equal(
    SAFE_NODE_TEST_ALLOWLIST.has("tests/deploy-production-script.test.mjs"),
    false,
    "must NOT contain deploy-production-script",
  );
});

test("unknown future Node test fails closed to broad", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/future-unclassified-runtime.test.mjs" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 1: modified safe static Node test -> node_test_only", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/sidebar-navigation-structure.test.mjs" },
  ]);
  assert.equal(result.lane, "node_test_only");
  assert.deepEqual(result.nodeTests, [
    "tests/sidebar-navigation-structure.test.mjs",
  ]);
  assert.equal(result.reason, "modified_safe_node_tests");
});

test("CASE 2: two modified safe Node tests -> node_test_only sorted nodeTests", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/time-picker.test.mjs" },
    { status: "M", path: "tests/business-time-future.test.mjs" },
  ]);
  assert.equal(result.lane, "node_test_only");
  assert.deepEqual(result.nodeTests, [
    "tests/business-time-future.test.mjs",
    "tests/time-picker.test.mjs",
  ]);
  assert.equal(result.reason, "modified_safe_node_tests");
});

test("CASE 3: modified runtime-denylisted Node test -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/local-supabase.test.mjs" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 4: added new Node test -> broad", () => {
  const result = classifyChanges([
    { status: "A", path: "tests/new-feature.test.mjs" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 5: deleted safe Node test -> broad", () => {
  const result = classifyChanges([
    { status: "D", path: "tests/sidebar-navigation-structure.test.mjs" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.match(result.reason, /^destructive_or_rename_status_D/);
});

test("CASE 6: renamed safe Node test -> broad", () => {
  const result = classifyChanges([
    {
      status: "R100",
      oldPath: "tests/old-name.test.mjs",
      path: "tests/new-name.test.mjs",
    },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.match(result.reason, /^destructive_or_rename_status_R/);
});

test("CASE 7: .gitattributes only -> ci_contract_only", () => {
  const result = classifyChanges([{ status: "M", path: ".gitattributes" }]);
  assert.equal(result.lane, "ci_contract_only");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "ci_contract_safe_subset");
});

test("CASE 8: .prettierignore plus CI contract test -> ci_contract_only", () => {
  const result = classifyChanges([
    { status: "M", path: ".prettierignore" },
    {
      status: "M",
      path: "tests/ci-supabase-isolation-workflow.test.mjs",
    },
    {
      status: "M",
      path: "tests/supabase-sql-line-ending-contract.test.mjs",
    },
  ]);
  assert.equal(result.lane, "ci_contract_only");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "ci_contract_safe_subset");
});

test("CASE 9: .github/workflows/ci.yml -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: ".github/workflows/ci.yml" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 10: scripts/prepare-ci-supabase-workdir.mjs -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: "scripts/prepare-ci-supabase-workdir.mjs" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 11: app/equipment/actions.ts -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: "app/equipment/actions.ts" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 12: components/basic-medical-equipment-request-form.tsx -> broad", () => {
  const result = classifyChanges([
    {
      status: "M",
      path: "components/basic-medical-equipment-request-form.tsx",
    },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 13: lib/equipment-lead-time.ts -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: "lib/equipment-lead-time.ts" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 14: supabase migration -> broad", () => {
  const result = classifyChanges([
    {
      status: "M",
      path: "supabase/migrations/20260903000000_example.sql",
    },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 15: package-lock.json -> broad", () => {
  const result = classifyChanges([{ status: "M", path: "package-lock.json" }]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 16: safe Node test + README.md -> node_test_only", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/time-picker.test.mjs" },
    { status: "M", path: "README.md" },
    { status: "M", path: "docs/RELEASE.md" },
  ]);
  assert.equal(result.lane, "node_test_only");
  assert.deepEqual(result.nodeTests, ["tests/time-picker.test.mjs"]);
  assert.equal(result.reason, "modified_safe_node_tests");
});

test("CASE 17: safe Node test + app source -> broad", () => {
  const result = classifyChanges([
    { status: "M", path: "tests/time-picker.test.mjs" },
    { status: "M", path: "components/time-picker.tsx" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "source_or_unclassified_paths");
});

test("CASE 18: docs-only -> broad with docs-only reason", () => {
  const result = classifyChanges([
    { status: "M", path: "README.md" },
    { status: "M", path: "docs/ui-modernization/CURRENT.md" },
    { status: "A", path: "docs/NEW.md" },
  ]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(
    result.reason,
    "docs_only_should_have_been_filtered_by_workflow",
  );
});

test("CASE 19: empty list -> broad", () => {
  const result = classifyChanges([]);
  assert.equal(result.lane, "broad");
  assert.deepEqual(result.nodeTests, []);
  assert.equal(result.reason, "empty_or_invalid_entries");
});

test("CASE 20: malformed entry -> broad", () => {
  assert.equal(classifyChanges([null]).lane, "broad");
  assert.equal(classifyChanges([{ status: 123 }]).lane, "broad");
  assert.equal(classifyChanges([{ status: "M", path: "" }]).lane, "broad");
  assert.equal(
    classifyChanges([{ status: "X", path: "tests/time-picker.test.mjs" }]).lane,
    "broad",
  );
});

test("parseNameStatusOutput parses git diff output correctly", () => {
  const raw = [
    "M\ttests/time-picker.test.mjs",
    "A\tdocs/NEW.md",
    "R100\told/path.mjs\tnew/path.mjs",
  ].join("\n");
  const entries = parseNameStatusOutput(raw);
  assert.deepEqual(entries, [
    { status: "M", path: "tests/time-picker.test.mjs" },
    { status: "A", path: "docs/NEW.md" },
    { status: "R100", oldPath: "old/path.mjs", path: "new/path.mjs" },
  ]);
});

test("CLI handles non-pull-request events and outputs to github-output", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ci-impact-test-"));
  const outPath = join(tmp, "output.txt");

  try {
    const res = runCli(["--event", "push", "--github-output", outPath]);
    assert.equal(res.lane, "broad");
    assert.equal(res.reason, "non_pr_event");

    const content = readFileSync(outPath, "utf8");
    assert.match(content, /^lane=broad\n/m);
    assert.match(content, /^node_tests=\n/m);
    assert.match(content, /^reason=non_pr_event\n/m);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
