import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("CI creates an isolated Supabase workdir without mutating local preview config", () => {
  const previewConfigPath = new URL("../supabase/config.toml", import.meta.url);
  const previewConfig = readFileSync(previewConfigPath, "utf8");
  const target = mkdtempSync(join(tmpdir(), "lich-truc-app-ci-"));

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-ci-supabase-workdir.mjs", target],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);

    const ciConfig = readFileSync(
      join(target, "supabase", "config.toml"),
      "utf8",
    );
    assert.equal(existsSync(join(target, "supabase", ".temp")), false);
    assert.match(ciConfig, /project_id = "lich-truc-app-ci"/);
    for (const port of [
      55420, 55421, 55422, 55423, 55424, 55427, 55429, 55883,
    ]) {
      assert.match(
        ciConfig,
        new RegExp(`(?:port|shadow_port|inspector_port) = ${port}`),
      );
    }
    assert.match(previewConfig, /project_id = "lich-truc-app"/);
    assert.match(previewConfig, /port = 54321/);
    assert.equal(readFileSync(previewConfigPath, "utf8"), previewConfig);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("CI directs each local Supabase operation to the disposable workdir", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /mktemp -d "\$RUNNER_TEMP\/lich-truc-app-ci\.XXXXXX"/);
  for (const command of ["start", "db reset", "status", "db lint", "test db"]) {
    assert.match(
      workflow,
      new RegExp(`supabase ${command} --workdir "\\$CI_SUPABASE_WORKDIR"`),
    );
  }
  assert.match(
    workflow,
    /seed-local-users\.ps1 -SupabaseWorkdir "\$env:CI_SUPABASE_WORKDIR"/,
  );
  assert.equal(
    workflow.split("seed-local-users.ps1 -SupabaseWorkdir").length - 1,
    2,
    "both fixture seed steps must receive the CI workdir",
  );
});

test("CI serializes the shared runtime and seed only observes its workdir", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const seedScript = readFileSync(
    new URL("../scripts/seed-local-users.ps1", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /concurrency:\n  group: ci-supabase-runtime\n  cancel-in-progress: false/,
  );
  assert.match(
    seedScript,
    /\[string\]\$SupabaseWorkdir = \$env:CI_SUPABASE_WORKDIR/,
  );
  assert.match(
    seedScript,
    /supabase status --workdir \$SupabaseWorkdir -o env/,
  );
  assert.doesNotMatch(seedScript, /supabase stop/);
});

test("CI retires only its stale Supabase runtime and always cleans it up", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const ciStopCommand =
    "npx --no-install supabase stop --project-id lich-truc-app-ci --no-backup";

  assert.equal(
    workflow.split(ciStopCommand).length - 1,
    2,
    "CI must stop the CI-only runtime before start and at job end",
  );
  assert.match(
    workflow,
    /- name: Clean up isolated CI Supabase runtime\n        if: always\(\)/,
  );
  assert.match(
    workflow,
    /case "\$CI_SUPABASE_WORKDIR" in\n              "\$RUNNER_TEMP"\/lich-truc-app-ci\.\*\)/,
  );
  assert.match(workflow, /rm -rf -- "\$CI_SUPABASE_WORKDIR"/);
  assert.doesNotMatch(workflow, /supabase stop --all/);
  assert.doesNotMatch(
    workflow,
    /supabase stop --project-id lich-truc-app(?:\s|$)/,
  );
  assert.doesNotMatch(
    workflow,
    /\bdocker\s+(?:system\s+prune|container\s+(?:prune|rm)|rm)\b/,
  );
});
