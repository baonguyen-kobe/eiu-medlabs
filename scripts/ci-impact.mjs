#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const RUNTIME_DENYLIST = new Set([
  "tests/basic-medical-inventory-mutation.test.mjs",
  "tests/batch-a-role-contracts.test.mjs",
  "tests/db-basic-medical-equipment-request-edit.test.mjs",
  "tests/db-equipment-semester-authority.test.mjs",
  "tests/db-root-basic-medical-equipment-registration.test.mjs",
  "tests/equipment-import-semester-authority.test.mjs",
  "tests/equipment-table-semester-authority.test.mjs",
  "tests/local-supabase.test.mjs",
  "tests/ninth-followup.test.mjs",
  "tests/seventh-followup.test.mjs",
  "tests/sixth-followup.test.mjs",
  "tests/skills-class-edit-equipment-lock.test.mjs",
  "tests/staff-shifts-v2.test.mjs",
  "tests/deploy-production-script.test.mjs",
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
    if (RUNTIME_DENYLIST.has(p)) return false;
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
