import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CANONICAL_SEMESTERS, isCanonicalSemester } from "../lib/semesters.ts";

test("CANONICAL_SEMESTERS contains exactly HK1, HK2, HK3, HK4", () => {
  assert.deepEqual([...CANONICAL_SEMESTERS], ["HK1", "HK2", "HK3", "HK4"]);
  assert.equal(isCanonicalSemester("HK1"), true);
  assert.equal(isCanonicalSemester("HK2"), true);
  assert.equal(isCanonicalSemester("HK3"), true);
  assert.equal(isCanonicalSemester("HK4"), true);
  assert.equal(isCanonicalSemester("HK5"), false);
  assert.equal(isCanonicalSemester(""), false);
  assert.equal(isCanonicalSemester(null), false);
  assert.equal(isCanonicalSemester(undefined), false);
});

test("ScheduleForm renders Section 2 with 3-column grid, span-2 room field, and canonical semester select", () => {
  const formSource = readFileSync(
    new URL("../components/schedule-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    formSource,
    /<div className="form-grid three">/,
    "Section 2 must use form-grid three",
  );
  assert.match(
    formSource,
    /<label className="schedule-room-field">/,
    "Room label must have schedule-room-field class for 2-column span",
  );
  assert.match(
    formSource,
    /<select name="semester" defaultValue="" required>/,
    "Semester select must be required with name semester",
  );
  assert.match(
    formSource,
    /CANONICAL_SEMESTERS\.map\(/,
    "Semester options must be populated from CANONICAL_SEMESTERS",
  );
});

test("CSS rules define 2-column span on desktop and auto on mobile for .schedule-room-field", () => {
  const cssSource = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    cssSource,
    /\.schedule-room-field\s*\{\s*grid-column:\s*span 2;\s*\}/,
    ".schedule-room-field must span 2 columns on desktop",
  );
});

test("createScheduleDraft validates required canonical semester before RPC invocation", () => {
  const actionSource = readFileSync(
    new URL("../app/schedule-entry/new/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    actionSource,
    /isCanonicalSemester\(semester\)/,
    "Action must validate semester using isCanonicalSemester",
  );
  assert.match(
    actionSource,
    /target_semester:\s*semester/,
    "Action must pass target_semester to create_manual_class_schedule RPC",
  );
});

test("EquipmentRequestForm displays semester as read-only inherited field", () => {
  const eqFormSource = readFileSync(
    new URL("../components/equipment-request-form.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    eqFormSource,
    /<select[^>]*name="semester"/,
    "Equipment form must not have an editable semester select",
  );
  assert.match(
    eqFormSource,
    /<input[^>]*name="semester"[^>]*value=\{selectedClass\?\.semester \|\| semester \|\| ""\}[^>]*readOnly/,
    "Equipment form must render read-only input inheriting selectedClass.semester",
  );
});

test("Equipment registration page loads semester from class_schedules", () => {
  const registerPageSource = readFileSync(
    new URL("../app/equipment/register/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    registerPageSource,
    /select\([^)]*semester[^)]*\)/,
    "Register page must select semester from class_schedules",
  );
  assert.match(
    registerPageSource,
    /semester:\s*schedule\.semester\s*\?\?\s*undefined/,
    "Register page must map schedule.semester to class option",
  );
});

test("Equipment server actions derive semester authoritatively from schedule", () => {
  const actionsSource = readFileSync(
    new URL("../app/equipment/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    actionsSource,
    /schedule\?\.semester\s*\|\|\s*submittedSemester/,
    "createEquipmentRequest must prioritize schedule.semester",
  );
  assert.match(
    actionsSource,
    /isCanonicalSemester\(effectiveSemester\)/,
    "createEquipmentRequest must validate effectiveSemester",
  );
  assert.match(
    actionsSource,
    /target_semester:\s*effectiveSemester/,
    "createEquipmentRequest must pass effectiveSemester to RPC",
  );
});

test("Database migration and declarative schemas enforce semester column and RPC contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260818104500_add_class_schedule_semester.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const appSchema = readFileSync(
    new URL("../supabase/schemas/01_app.sql", import.meta.url),
    "utf8",
  );
  const scopeSchema = readFileSync(
    new URL("../supabase/schemas/02_room_type_scopes.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    migration,
    /alter table public\.class_schedules\s+add column if not exists semester text;/,
  );
  assert.match(
    migration,
    /check \(semester is null or semester in \('HK1', 'HK2', 'HK3', 'HK4'\)\)/,
  );
  assert.match(
    appSchema,
    /check \(\s*semester is null or semester in \('HK1', 'HK2', 'HK3', 'HK4'\)\s*\)/,
  );
  assert.match(scopeSchema, /target_semester text/);
  assert.match(
    scopeSchema,
    /if target_semester is null or target_semester not in \('HK1', 'HK2', 'HK3', 'HK4'\) then/,
  );
});

test("ImportWizard enforces batch-level semester selector before Step 1 upload", () => {
  const wizardSource = readFileSync(
    new URL("../components/import-wizard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    wizardSource,
    /<div className="import-stepper-bar">/,
    "Import wizard must render .import-stepper-bar wrapping semester control and stepper",
  );
  assert.match(
    wizardSource,
    /id="import-semester-select"/,
    "Import wizard must include #import-semester-select",
  );
  assert.match(
    wizardSource,
    /CANONICAL_SEMESTERS\.map\(/,
    "Semester options must come from CANONICAL_SEMESTERS",
  );
  assert.match(
    wizardSource,
    /Vui lòng chọn Học kỳ trước khi chọn file import\./,
    "Attempting upload without semester must show blocking error message",
  );
  assert.match(
    wizardSource,
    /validateScheduleRows\([\s\S]*?JSON\.stringify\(rows\),[\s\S]*?scope,[\s\S]*?semester/,
    "validateScheduleRows must receive semester",
  );
  assert.match(
    wizardSource,
    /importScheduleRows\([\s\S]*?fileName,[\s\S]*?JSON\.stringify\(rows\),[\s\S]*?scope,[\s\S]*?semester/,
    "importScheduleRows must receive semester",
  );
  assert.match(
    wizardSource,
    /Học kỳ: <b>\{semester\}<\/b>/,
    "Preview steps must display the selected batch semester",
  );
});

test("CSS rules align .import-stepper-bar with inner dropzone and handle mobile reflow", () => {
  const cssSource = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    cssSource,
    /\.import-stepper-bar\s*\{[^}]*padding:\s*0 22px;[^}]*\}/,
    ".import-stepper-bar must have 22px horizontal padding matching .import-panel",
  );
  assert.match(
    cssSource,
    /\.import-semester-control\s*\{[^}]*display:\s*flex;[^}]*\}/,
    ".import-semester-control must be styled as a flex container",
  );
  assert.match(
    cssSource,
    /\.drop-zone\.drop-zone-blocked\s*\{[^}]*cursor:\s*not-allowed;[^}]*\}/,
    "Blocked dropzone must have not-allowed cursor",
  );
});

test("Import server actions require canonical semester for skills_lab and pass to create_import_schedule_row RPC", () => {
  const actionSource = readFileSync(
    new URL("../app/schedule-entry/import/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    actionSource,
    /if \(scope === "skills_lab"\)\s*\{\s*if \(!semester \|\| !isCanonicalSemester\(semester\)\)/,
    "validateScheduleRows must fail closed if skills_lab is missing canonical semester",
  );
  assert.match(
    actionSource,
    /target_semester:\s*scope === "skills_lab"\s*\?\s*semester\s*:\s*null/,
    "importScheduleRows must pass target_semester to create_import_schedule_row",
  );
  assert.match(
    actionSource,
    /semester:\s*scope === "skills_lab"\s*\?\s*semester\s*:\s*undefined/,
    "importScheduleRows must return semester in result",
  );
});
