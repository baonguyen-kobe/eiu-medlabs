import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationRoot = path.join(repoRoot, "supabase", "migrations");

const paths = {
  predecessorReschedule: path.join(
    migrationRoot,
    "20260805130000_finalize_email_notification_matrix.sql",
  ),
  predecessorDetails: path.join(
    migrationRoot,
    "20260803075448_update_class_schedule_details.sql",
  ),
  guard: path.join(
    migrationRoot,
    "20260805153318_harden_schedule_authorization_and_schema_drift.sql",
  ),
  finalMigration: path.join(
    migrationRoot,
    "20260809110000_basic_medical_l03_l04_corrective_fix.sql",
  ),
  declarativeOverride: path.join(
    repoRoot,
    "supabase",
    "schemas",
    "16_reschedule_class_final_state.sql",
  ),
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, filePath]) => [
      name,
      await readFile(filePath, "utf8"),
    ]),
  ),
);

function extractTaggedAssignment(block, variable, tag) {
  const pattern = new RegExp(
    `${variable}\\s+text\\s*:=\\s*\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`,
  );
  const match = block.match(pattern);
  assert.ok(match, `missing ${variable} $${tag}$ assignment`);
  return match[1];
}

function extractGuardBlock(marker) {
  const start = sources.guard.indexOf(marker);
  assert.notEqual(start, -1, `missing guard marker: ${marker}`);
  const end = sources.guard.indexOf("$migration$;", start);
  assert.notEqual(end, -1, `missing guard terminator: ${marker}`);
  return sources.guard.slice(start, end + "$migration$;".length);
}

function extractFunction(source, name) {
  const marker = `create or replace function public.${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `missing function terminator for ${name}`);
  return source.slice(start, end + "\n$$;".length);
}

test("Supabase SQL checkout contract is LF on every platform", () => {
  const relativeFiles = Object.values(paths).map((filePath) =>
    path.relative(repoRoot, filePath).replaceAll(path.sep, "/"),
  );
  const attributes = execFileSync(
    "git",
    ["check-attr", "text", "eol", "--", ...relativeFiles],
    { cwd: repoRoot, encoding: "utf8" },
  );

  for (const relativeFile of relativeFiles) {
    assert.match(attributes, new RegExp(`${relativeFile}: text: set`));
    assert.match(attributes, new RegExp(`${relativeFile}: eol: lf`));
  }

  for (const [name, source] of Object.entries(sources)) {
    assert.equal(source.includes("\r\n"), false, `${name} contains CRLF`);
  }
});

test("both fail-closed guards match and harden their exact LF predecessors", () => {
  const cases = [
    {
      marker: "-- Patch the current function",
      source: extractFunction(
        sources.predecessorReschedule,
        "reschedule_class",
      ),
    },
    {
      marker: "-- SQL NOT IN returns NULL",
      source: extractFunction(
        sources.predecessorDetails,
        "update_class_schedule_details",
      ),
    },
  ];

  for (const { marker, source } of cases) {
    const guard = extractGuardBlock(marker);
    const unsafe = extractTaggedAssignment(guard, "unsafe_fragment", "unsafe");
    const hardened = extractTaggedAssignment(
      guard,
      "hardened_fragment",
      "hardened",
    );

    assert.equal(
      source.split(unsafe).length - 1,
      1,
      `${marker} must match once`,
    );
    const replaced = source.replace(unsafe, hardened);
    assert.equal(replaced.includes(unsafe), false, `${marker} kept unsafe SQL`);
    assert.equal(
      replaced.includes(hardened),
      true,
      `${marker} missed hardening`,
    );

    const crlfUnsafe = unsafe.replaceAll("\n", "\r\n");
    assert.equal(
      source.includes(crlfUnsafe),
      false,
      `${marker} regression detector did not distinguish CRLF`,
    );
  }
});

test("declarative reschedule_class equals the final effective migration", () => {
  assert.equal(
    extractFunction(sources.declarativeOverride, "reschedule_class"),
    extractFunction(sources.finalMigration, "reschedule_class"),
  );
  assert.match(
    sources.declarativeOverride,
    /revoke all on function public\.reschedule_class\(uuid, date\) from public, anon;/,
  );
  assert.match(
    sources.declarativeOverride,
    /grant execute on function public\.reschedule_class\(uuid, date\) to authenticated;/,
  );
});
