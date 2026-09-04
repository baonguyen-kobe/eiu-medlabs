import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeBin =
  process.execPath && /[\\/]node(?:\.exe)?$/i.test(process.execPath)
    ? process.execPath
    : "node";

function resolveBin(relFromScript, relFromRoot) {
  const fromMeta = fileURLToPath(new URL(relFromScript, import.meta.url));
  if (fs.existsSync(fromMeta)) return fromMeta;
  const fromRoot = path.resolve(process.cwd(), relFromRoot);
  if (fs.existsSync(fromRoot)) return fromRoot;
  throw new Error(`Cannot locate binary: ${relFromRoot}`);
}

function runGit(args, allowFailure = false) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFailure) return "";
    console.error(`git ${args.join(" ")} failed:`, err.stderr || err.message);
    process.exit(1);
  }
}

function collectGitFiles(args) {
  try {
    const buf = execFileSync("git", args, { stdio: ["pipe", "pipe", "pipe"] });
    return buf.toString("utf8").split("\0").filter(Boolean);
  } catch (err) {
    console.error(
      `git ${args.join(" ")} failed:`,
      err.stderr?.toString() || err.message,
    );
    process.exit(1);
  }
}

// 1. Determine base reference
let baseRef = process.argv[2];
if (!baseRef) {
  const hasOriginMain = runGit(["rev-parse", "--verify", "origin/main"], true);
  if (hasOriginMain) {
    baseRef = "origin/main";
  } else {
    baseRef = "main";
  }
}

// 2. Collect changed files using NUL-delimited queries
const files = new Set([
  ...collectGitFiles(["diff", "--name-only", "-z", `${baseRef}...HEAD`]),
  ...collectGitFiles(["diff", "--name-only", "-z"]),
  ...collectGitFiles(["diff", "--name-only", "--cached", "-z"]),
  ...collectGitFiles(["ls-files", "--others", "--exclude-standard", "-z"]),
]);

const changedFiles = [...files].filter((f) => fs.existsSync(f)).sort();

if (changedFiles.length === 0) {
  console.log(
    `preflight:changed — No changed files detected against ${baseRef}.`,
  );
  process.exit(0);
}

console.log(
  `preflight:changed — Checking ${changedFiles.length} file(s) against ${baseRef}:`,
);
for (const f of changedFiles) {
  console.log(`  - ${f}`);
}

let hasErrors = false;

// 3. git diff checks (branch, unstaged working copy, and staged index)
console.log("\n[1/3] git diff --check...");
for (const checkArgs of [
  ["diff", "--check", `${baseRef}...HEAD`],
  ["diff", "--check"],
  ["diff", "--cached", "--check"],
]) {
  const checkResult = spawnSync("git", checkArgs, { stdio: "inherit" });
  if (checkResult.error) {
    console.error(
      `git ${checkArgs.join(" ")} spawn error:`,
      checkResult.error.message,
    );
    hasErrors = true;
  } else if (checkResult.status !== 0) {
    console.error(
      `git ${checkArgs.join(" ")} failed with status ${checkResult.status}`,
    );
    hasErrors = true;
  }
}

// 4. Prettier check on changed files using direct node execution
console.log("\n[2/3] Prettier check on changed files...");
try {
  const prettierBin = resolveBin(
    "../node_modules/prettier/bin/prettier.cjs",
    "node_modules/prettier/bin/prettier.cjs",
  );
  const prettierResult = spawnSync(
    nodeBin,
    [prettierBin, "--check", "--ignore-unknown", ...changedFiles],
    { stdio: "inherit" },
  );
  if (prettierResult.error) {
    console.error("Prettier spawn error:", prettierResult.error.message);
    hasErrors = true;
  } else if (prettierResult.status !== 0) {
    console.error(
      `Prettier check failed with exit code ${prettierResult.status}`,
    );
    hasErrors = true;
  }
} catch (err) {
  console.error("Prettier resolution error:", err.message);
  hasErrors = true;
}

// 5. ESLint on changed JS/TS files using direct node execution
const jsExtensions = [".js", ".mjs", ".cjs", ".ts", ".tsx"];
const jsFiles = changedFiles.filter((f) =>
  jsExtensions.some((ext) => f.endsWith(ext)),
);
if (jsFiles.length > 0) {
  console.log(
    `\n[3/3] ESLint on ${jsFiles.length} changed script/component file(s)...`,
  );
  try {
    const eslintBin = resolveBin(
      "../node_modules/eslint/bin/eslint.js",
      "node_modules/eslint/bin/eslint.js",
    );
    const eslintResult = spawnSync(nodeBin, [eslintBin, ...jsFiles], {
      stdio: "inherit",
    });
    if (eslintResult.error) {
      console.error("ESLint spawn error:", eslintResult.error.message);
      hasErrors = true;
    } else if (eslintResult.status !== 0) {
      console.error(
        `ESLint check failed with exit code ${eslintResult.status}`,
      );
      hasErrors = true;
    }
  } catch (err) {
    console.error("ESLint resolution error:", err.message);
    hasErrors = true;
  }
} else {
  console.log("\n[3/3] ESLint — no changed JS/TS files to check.");
}

if (hasErrors) {
  console.error("\npreflight:changed: FAILED with violations.");
  process.exit(1);
} else {
  console.log("\npreflight:changed: PASS — all changed file checks passed.");
}
