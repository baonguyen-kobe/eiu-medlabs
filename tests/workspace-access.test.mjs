import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/workspace-access.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const access = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("loại phòng quyết định nhóm chức năng và quyền Y chỉ mở trang tạo", () => {
  const lecturer = ["lecturer"];

  assert.equal(
    access.canUseSkillsWorkspace(lecturer, ["basic_medical"]),
    false,
  );
  assert.equal(
    access.canViewBasicMedicalSchedules(lecturer, ["basic_medical"]),
    true,
  );
  assert.equal(
    access.canViewBasicMedicalRegistrations(lecturer, ["basic_medical"]),
    true,
  );
  assert.equal(
    access.canCreateBasicMedicalSchedules(lecturer, ["basic_medical"], false),
    false,
  );
  assert.equal(
    access.canCreateBasicMedicalSchedules(lecturer, ["basic_medical"], true),
    true,
  );
  assert.equal(
    access.defaultWorkspacePath(lecturer, ["basic_medical"]),
    "/basic-medical/schedules",
  );

  assert.equal(
    access.canUseSkillsWorkspace(lecturer, ["nursing_skills"]),
    true,
  );
  assert.equal(
    access.canViewBasicMedicalSchedules(lecturer, ["nursing_skills"]),
    false,
  );
  assert.equal(
    access.defaultWorkspacePath(lecturer, ["nursing_skills"]),
    "/dashboard",
  );
  assert.equal(
    access.canUseSkillsWorkspace(lecturer, ["nursing_skills", "basic_medical"]),
    true,
  );
  assert.equal(
    access.canViewBasicMedicalSchedules(lecturer, [
      "nursing_skills",
      "basic_medical",
    ]),
    true,
  );
});

test("Người xem Y cơ sở chỉ xem lịch; admin và staff không phụ thuộc phạm vi", () => {
  assert.equal(
    access.canViewBasicMedicalSchedules(["viewer"], ["basic_medical"]),
    true,
  );
  assert.equal(
    access.canViewBasicMedicalRegistrations(["viewer"], ["basic_medical"]),
    true,
  );
  assert.equal(
    access.canCreateBasicMedicalSchedules(["viewer"], ["basic_medical"], true),
    false,
  );

  for (const role of ["admin", "staff"]) {
    assert.equal(access.canUseSkillsWorkspace([role], []), true);
    assert.equal(
      access.canViewBasicMedicalSchedules([role], []),
      role === "admin",
    );
    assert.equal(
      access.canViewBasicMedicalRegistrations([role], []),
      role === "admin",
    );
    assert.equal(
      access.canCreateBasicMedicalSchedules([role], [], false),
      role === "admin",
    );
    assert.equal(
      access.canImportBasicMedicalSchedules([role], [], false),
      role === "admin",
    );
  }

  assert.equal(
    access.canImportBasicMedicalSchedules(["staff"], ["basic_medical"], true),
    true,
  );
});
