import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve("scripts/preflight-changed.mjs");
const nodeBin =
  process.execPath && /[\\/]node(?:\.exe)?$/i.test(process.execPath)
    ? process.execPath
    : "node";

test("preflight:changed fails closed with non-zero exit code when given invalid base ref", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "medlabs-preflight-test-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    fs.writeFileSync(path.join(tempDir, "initial.txt"), "hello\n", "utf8");
    execFileSync("git", ["add", "initial.txt"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["commit", "-m", "init"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    let thrownError = null;
    try {
      execFileSync(nodeBin, [scriptPath, "invalid-non-existent-ref-99999"], {
        cwd: tempDir,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, "Must throw on invalid base ref");
    assert.notEqual(thrownError.status, 0, "Must exit with non-zero status");
    const combinedOutput = `${thrownError.stdout || ""} ${thrownError.stderr || ""}`;
    assert.match(combinedOutput, /failed:/, "Must report git failure message");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("preflight:changed reports no changes and exits 0 when base ref equals HEAD on a clean tree", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "medlabs-preflight-test-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    fs.writeFileSync(path.join(tempDir, "initial.txt"), "hello\n", "utf8");
    execFileSync("git", ["add", "initial.txt"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["commit", "-m", "init"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    const output = execFileSync(nodeBin, [scriptPath, "HEAD"], {
      cwd: tempDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(
      output,
      /No changed files detected against HEAD\./,
      "Must report no changed files detected against clean HEAD",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("preflight:changed handles renamed paths with spaces, checks formatting, and passes", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "medlabs-preflight-test-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "docs", "old name.md"),
      "# Initial Document\n",
      "utf8",
    );
    execFileSync("git", ["add", "docs/old name.md"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["commit", "-m", "init docs"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    execFileSync("git", ["mv", "docs/old name.md", "docs/renamed guide.md"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    fs.appendFileSync(
      path.join(tempDir, "docs", "renamed guide.md"),
      "\nUpdated content.\n",
      "utf8",
    );

    const output = execFileSync(nodeBin, [scriptPath, "HEAD"], {
      cwd: tempDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(
      output,
      /docs\/renamed guide\.md/,
      "Must correctly detect renamed path containing spaces",
    );
    assert.match(
      output,
      /preflight:changed: PASS/,
      "Must report successful preflight pass on cleanly formatted changed file",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("preflight:changed safely handles changed filenames starting with a hyphen using option terminator", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "medlabs-preflight-test-"),
  );
  try {
    execFileSync("git", ["init", "-b", "main"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    fs.writeFileSync(path.join(tempDir, "initial.txt"), "hello\n", "utf8");
    execFileSync("git", ["add", "initial.txt"], {
      cwd: tempDir,
      stdio: "pipe",
    });
    execFileSync("git", ["commit", "-m", "init"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "docs", "-hyphen-flag.md"),
      "# Flag File\n",
      "utf8",
    );
    execFileSync("git", ["add", "--", "docs/-hyphen-flag.md"], {
      cwd: tempDir,
      stdio: "pipe",
    });

    const output = execFileSync(nodeBin, [scriptPath, "HEAD"], {
      cwd: tempDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(
      output,
      /docs\/-hyphen-flag\.md/,
      "Must correctly detect hyphen-prefixed file without flag collision",
    );
    assert.match(
      output,
      /preflight:changed: PASS/,
      "Must pass formatting check on hyphen-prefixed file",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
