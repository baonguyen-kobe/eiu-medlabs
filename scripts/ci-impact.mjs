#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const SAFE_NODE_TEST_ALLOWLIST = new Set([
  "tests/a11y-02-5-confirmation-modal.test.mjs",
  "tests/basic-medical-cancellation-temporal.test.mjs",
  "tests/basic-medical-condition-log-catalog-snapshot.test.mjs",
  "tests/basic-medical-confirmation-evidence.test.mjs",
  "tests/basic-medical-end-to-end-regression.test.mjs",
  "tests/basic-medical-equipment-request-email.test.mjs",
  "tests/basic-medical-equipment-request-wave-1.test.mjs",
  "tests/basic-medical-equipment-request-wave-2.test.mjs",
  "tests/basic-medical-equipment.test.mjs",
  "tests/basic-medical-linked-lecturer-ui.test.mjs",
  "tests/basic-medical-production-retest.test.mjs",
  "tests/basic-medical-registration-edit-lookup.test.mjs",
  "tests/basic-medical-session-lecturer-edit.test.mjs",
  "tests/calendar-kpi-responsive-default.test.mjs",
  "tests/catalog-batch-inline-edit.test.mjs",
  "tests/ci-supabase-isolation-workflow.test.mjs",
  "tests/declarative-schema-parity-post-pr62.test.mjs",
  "tests/equipment-mine-add-items-parity.test.mjs",
  "tests/mob-01-7-batch-04c.test.mjs",
  "tests/mob-01-7-catalog-mobile.test.mjs",
  "tests/mob-01-7-email-mobile.test.mjs",
  "tests/operations-integrity-master.test.mjs",
  "tests/personnel-password-catalog-batch-contract.test.mjs",
  "tests/phase3b-operational-notifications.test.mjs",
  "tests/pr19-compatibility-bridge.test.mjs",
  "tests/pre-go-live-auth-delete-diagnostic-workflow.test.mjs",
  "tests/pre-go-live-clean-reset-workflow.test.mjs",
  "tests/pre-go-live-storage-cleanup-workflow.test.mjs",
  "tests/production-pr19-migrations-workflow.test.mjs",
  "tests/production-pr23-catalog-audit-workflow.test.mjs",
  "tests/production-pr23-test-catalog-cleanup-workflow.test.mjs",
  "tests/production-pr33-migrations-workflow.test.mjs",
  "tests/production-pr62-pr64-migrations-workflow.test.mjs",
  "tests/review-batch-02b.test.mjs",
  "tests/review-batch-03a.test.mjs",
  "tests/review-batch-03b.test.mjs",
  "tests/review-batch-03d.test.mjs",
  "tests/review-batch-03e.test.mjs",
  "tests/review-batch-03f.test.mjs",
  "tests/review-batch-03g.test.mjs",
  "tests/root-admin-effective-permissions.test.mjs",
  "tests/schedule-domain-isolation.test.mjs",
  "tests/sidebar-navigation-structure.test.mjs",
  "tests/staff-shifts-ui-contract.test.mjs",
  "tests/supabase-sql-line-ending-contract.test.mjs",
  "tests/ui-design-system-v2.test.mjs",
  "tests/unified-equipment-operations.test.mjs",
  "tests/workspace-access.test.mjs",
  "tests/basic-medical-confirmation-eligibility.test.mjs",
  "tests/basic-medical-evidence-pdf-behavior.test.mjs",
  "tests/basic-medical-inventory-edit.test.mjs",
  "tests/business-time-future.test.mjs",
  "tests/email-outbox-contract.test.mjs",
  "tests/email-webhook-security.test.mjs",
  "tests/equipment-calendar-request.test.mjs",
  "tests/equipment-catalog-commercial-name-identity.test.mjs",
  "tests/equipment-lead-time.test.mjs",
  "tests/import-preview-conflicts.test.mjs",
  "tests/local-test-safety.test.mjs",
  "tests/notification-bell-state.test.mjs",
  "tests/password-recovery-origin.test.mjs",
  "tests/personnel-import.test.mjs",
  "tests/schedule-lecturer-order-and-equipment-commercial-duplicate.test.mjs",
  "tests/skills-lab-schedule-semester.test.mjs",
  "tests/time-picker.test.mjs",
]);

export const CI_CONTRACT_SAFE_SET = new Set([
  ".gitattributes",
  ".prettierignore",
  "tests/ci-supabase-isolation-workflow.test.mjs",
  "tests/supabase-sql-line-ending-contract.test.mjs",
]);

export function isNeutralDocPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("docs/") || normalized.endsWith(".md");
}

export function parseNameStatusLine(line) {
  if (!line || !line.trim()) return null;
  const parts = line.trim().split("\t");
  const status = parts[0];
  if (!status) return null;

  if (status.startsWith("R") || status.startsWith("C")) {
    if (parts.length < 3)
      return { status, path: parts[1] ? parts[1].replace(/\\/g, "/") : "" };
    return {
      status,
      oldPath: parts[1].replace(/\\/g, "/"),
      path: parts[2].replace(/\\/g, "/"),
    };
  }

  if (parts.length < 2) return null;
  return {
    status,
    path: parts[1].replace(/\\/g, "/"),
  };
}

export function parseNameStatusOutput(output) {
  if (typeof output !== "string") return [];
  return output.split(/\r?\n/).map(parseNameStatusLine).filter(Boolean);
}

export function classifyChanges(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      lane: "broad",
      nodeTests: [],
      reason: "empty_or_invalid_entries",
    };
  }

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.status !== "string" ||
      typeof entry.path !== "string" ||
      !entry.path.trim()
    ) {
      return {
        lane: "broad",
        nodeTests: [],
        reason: "malformed_entry",
      };
    }
  }

  const nonDocEntries = entries.filter(
    (entry) => !isNeutralDocPath(entry.path),
  );

  if (nonDocEntries.length === 0) {
    return {
      lane: "broad",
      nodeTests: [],
      reason: "docs_only_should_have_been_filtered_by_workflow",
    };
  }

  for (const entry of nonDocEntries) {
    const s = entry.status.toUpperCase();
    if (s.startsWith("D") || s.startsWith("R") || s.startsWith("C")) {
      return {
        lane: "broad",
        nodeTests: [],
        reason: `destructive_or_rename_status_${entry.status}`,
      };
    }
    if (s !== "M" && s !== "A") {
      return {
        lane: "broad",
        nodeTests: [],
        reason: `unsupported_status_${entry.status}`,
      };
    }
  }

  const isAllCiContract = nonDocEntries.every(
    (entry) => entry.status === "M" && CI_CONTRACT_SAFE_SET.has(entry.path),
  );

  if (isAllCiContract) {
    return {
      lane: "ci_contract_only",
      nodeTests: [],
      reason: "ci_contract_safe_subset",
    };
  }

  const isAllNodeTest = nonDocEntries.every((entry) => {
    if (entry.status !== "M") return false;
    const p = entry.path;
    if (!p.startsWith("tests/")) return false;
    const subPath = p.slice("tests/".length);
    if (subPath.includes("/")) return false;
    if (!subPath.endsWith(".test.mjs")) return false;
    if (!SAFE_NODE_TEST_ALLOWLIST.has(p)) return false;
    return true;
  });

  if (isAllNodeTest) {
    const nodeTests = Array.from(
      new Set(nonDocEntries.map((e) => e.path)),
    ).sort();
    return {
      lane: "node_test_only",
      nodeTests,
      reason: "modified_safe_node_tests",
    };
  }

  return {
    lane: "broad",
    nodeTests: [],
    reason: "source_or_unclassified_paths",
  };
}

export function runCli(args = process.argv.slice(2)) {
  let event = "";
  let base = "";
  let head = "";
  let githubOutput = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--event" && i + 1 < args.length) {
      event = args[++i];
    } else if (arg === "--base" && i + 1 < args.length) {
      base = args[++i];
    } else if (arg === "--head" && i + 1 < args.length) {
      head = args[++i];
    } else if (arg === "--github-output" && i + 1 < args.length) {
      githubOutput = args[++i];
    }
  }

  let result;

  if (event !== "pull_request") {
    result = {
      lane: "broad",
      nodeTests: [],
      reason: "non_pr_event",
    };
  } else {
    if (!base || !head) {
      throw new Error("Missing --base or --head for pull_request event");
    }

    const diffOutput = execFileSync(
      "git",
      ["diff", "--name-status", "--find-renames", base, head, "--"],
      { encoding: "utf8" },
    );

    const entries = parseNameStatusOutput(diffOutput);
    result = classifyChanges(entries);
  }

  if (githubOutput) {
    const lines = [
      `lane=${result.lane}`,
      `node_tests=${result.nodeTests.join(" ")}`,
      `reason=${result.reason}`,
      "",
    ].join("\n");
    appendFileSync(githubOutput, lines, "utf8");
  }

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  try {
    runCli();
  } catch (err) {
    console.error("Classifier error:", err.message);
    process.exit(1);
  }
}
