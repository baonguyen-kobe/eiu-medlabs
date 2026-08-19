import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const skillsRoomTypeId = "40000000-0000-0000-0000-000000000001";

function manualScheduleRpcDefinition(source) {
  const match = source.match(
    /create or replace function public\.create_manual_class_schedule\([\s\S]*?grant execute on function public\.create_manual_class_schedule\(uuid,uuid,uuid,uuid,date,time,time,text,integer,text\) to authenticated;/,
  );
  assert.ok(match);
  return match[0].replace(/\r\n/g, "\n").trim();
}

test("Skills schedule action ignores client scope and requires Skills course and room", () => {
  const source = readFileSync(
    new URL("../app/schedule-entry/new/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /NURSING_SKILLS_ROOM_TYPE_ID/);
  assert.doesNotMatch(source, /formData\.get\("scope"\)/);
  assert.match(source, /course\.room_type_id !== NURSING_SKILLS_ROOM_TYPE_ID/);
  assert.match(source, /room\.room_type_id !== NURSING_SKILLS_ROOM_TYPE_ID/);
});

test("Skills calendar positively filters its room domain", () => {
  const source = readFileSync(
    new URL("../app/class-schedules/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /\.eq\("rooms\.room_type_id", NURSING_SKILLS_ROOM_TYPE_ID\)/,
  );
  assert.doesNotMatch(source, /BASIC_MEDICAL_ROOM_TYPE_ID/);
  assert.equal(skillsRoomTypeId.endsWith("0001"), true);
});

test("manual schedule migration and declarative schema keep the same Skills contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260818104500_add_class_schedule_semester.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const schema = readFileSync(
    new URL("../supabase/schemas/02_room_type_scopes.sql", import.meta.url),
    "utf8",
  );

  assert.equal(
    manualScheduleRpcDefinition(migration),
    manualScheduleRpcDefinition(schema),
  );
});
