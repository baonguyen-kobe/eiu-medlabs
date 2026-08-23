import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabaseTarget } from "./helpers/local-test-safety.mjs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [key, ...value] = line.split("=");
      return [key, value.join("=")];
    }),
);
assertLocalSupabaseTarget(env.NEXT_PUBLIC_SUPABASE_URL);

function localSql(sql) {
  const listed = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${process.env.SUPABASE_LOCAL_PROJECT_ID ?? "lich-truc-app"}`,
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  );
  const databases = listed.stdout
    .split(/\r?\n/)
    .filter((name) => name.startsWith("supabase_db_"));
  if (listed.status !== 0 || databases.length !== 1) {
    throw new Error("REFUSING_AMBIGUOUS_LOCAL_SUPABASE_DATABASE");
  }
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      databases[0],
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function hasBasicMedicalScope(profileId) {
  return (
    localSql(`
      select exists(
        select 1 from public.profile_room_types scope
        join public.room_types room_type on room_type.id = scope.room_type_id
        where scope.profile_id = '${profileId}'
          and room_type.code = 'basic_medical'
      );
    `) === "t"
  );
}

test("Root Admin requests Basic Medical equipment without becoming the responsible lecturer", async () => {
  const fixture = {
    course: crypto.randomUUID(),
    room: crypto.randomUUID(),
    registration: crypto.randomUUID(),
    schedule: crypto.randomUUID(),
    session: crypto.randomUUID(),
    rootRegistration: crypto.randomUUID(),
    rootSchedule: crypto.randomUUID(),
    rootSession: crypto.randomUUID(),
    catalog: crypto.randomUUID(),
  };
  const root = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: signIn, error: signInError } =
    await root.auth.signInWithPassword({
      email: "admin@campus.local",
      password: "LocalAdmin123!",
    });
  assert.ifError(signInError);
  const rootId = signIn.user?.id;
  assert.ok(rootId, "Root test account is available");
  const teachingLecturerId = localSql(
    "select id from auth.users where email = 'importer@campus.local'",
  );
  const teachingHadBasicMedicalScope = hasBasicMedicalScope(teachingLecturerId);
  const deliveryModeBefore =
    localSql(
      "select delivery_mode from public.email_delivery_settings where setting_key = 'primary'",
    ) || "off";
  let requestId = "";

  try {
    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);
      update public.email_delivery_settings set delivery_mode = 'off'
      where setting_key = 'primary';
      insert into public.profile_room_types (profile_id, room_type_id)
      select '${teachingLecturerId}', id from public.room_types
      where code = 'basic_medical' on conflict do nothing;
      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${fixture.course}', 'ROOT-BM', 'Root Basic Medical request', id, true
      from public.room_types where code = 'basic_medical';
      insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
      select '${fixture.room}', 'ROOT-BM', 'TEST', 'Root Basic Medical room', id, 24, true
      from public.room_types where code = 'basic_medical';
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count, registrant_id, responsible_lecturer_id, created_by)
      values
        ('${fixture.registration}', '2099-2100', 'HK1', '2099-12-20', '2099-12-20', '${fixture.course}', '${fixture.room}', 24, '${rootId}', '${teachingLecturerId}', '${rootId}');
      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date, start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id, created_by, published_by, published_at)
      values
        ('${fixture.schedule}', '${fixture.course}', 'ROOT-BM', 'Root Basic Medical request', '${fixture.room}', '${teachingLecturerId}', '2099-12-20', '09:00', '11:00', 'manual', 'published', 24, '${fixture.registration}', '${rootId}', '${rootId}', clock_timestamp());
      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${fixture.session}', '${fixture.registration}', '${fixture.schedule}', 'Bài Root hợp lệ', '${teachingLecturerId}', 1);
      insert into public.basic_medical_equipment_catalog
        (id, item_name, commercial_name, unit, is_active)
      values
        ('${fixture.catalog}', 'Thiết bị Root', 'Thiết bị Root thương mại', 'Cái', true);
      commit;
    `);

    const { data: visibleCatalog, error: catalogError } = await root
      .from("basic_medical_equipment_catalog")
      .select("id,item_name,unit")
      .eq("id", fixture.catalog)
      .maybeSingle();
    assert.ifError(catalogError);
    assert.deepEqual(visibleCatalog, {
      id: fixture.catalog,
      item_name: "Thiết bị Root",
      unit: "Cái",
    });

    const created = await root.rpc("create_equipment_request_with_items", {
      target_class_schedule_id: fixture.schedule,
      target_semester: "HK1",
      target_responsible_lecturer_id: null,
      target_receive_at: "2099-12-20T02:00:00.000Z",
      target_return_at: "2099-12-20T09:00:00.000Z",
      target_note: "Root requester",
      target_late_registration_reason: null,
      target_items: [
        {
          skill_name: "Bài Root hợp lệ",
          catalog_item_id: fixture.catalog,
          quantity: 1,
          note: "Root item",
        },
      ],
    });
    assert.ifError(created.error);
    requestId = created.data;
    assert.ok(requestId, "Root requester can create a Basic Medical request");

    const persisted = JSON.parse(
      localSql(`
        select json_build_object(
          'registrant_id', registrant_id,
          'responsible_lecturer_id', responsible_lecturer_id,
          'source_identity_id', source_identity_id,
          'skill_name', (select skill_name from public.equipment_request_items where request_id = equipment_requests.id limit 1)
        )::text
        from public.equipment_requests where id = '${requestId}';
      `),
    );
    assert.equal(persisted.registrant_id, rootId);
    assert.equal(persisted.responsible_lecturer_id, teachingLecturerId);
    assert.equal(persisted.source_identity_id, fixture.session);
    assert.equal(persisted.skill_name, "Bài Root hợp lệ");

    localSql(`
      begin;
      set local session_replication_role = replica;
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count, registrant_id, responsible_lecturer_id, created_by)
      values
        ('${fixture.rootRegistration}', '2099-2100', 'HK1', '2099-12-21', '2099-12-21', '${fixture.course}', '${fixture.room}', 24, '${rootId}', '${rootId}', '${rootId}');
      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date, start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id, created_by, published_by, published_at)
      values
        ('${fixture.rootSchedule}', '${fixture.course}', 'ROOT-BM', 'Root assigned legacy session', '${fixture.room}', '${rootId}', '2099-12-21', '09:00', '11:00', 'manual', 'published', 24, '${fixture.rootRegistration}', '${rootId}', '${rootId}', clock_timestamp());
      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${fixture.rootSession}', '${fixture.rootRegistration}', '${fixture.rootSchedule}', 'Bài Root không hợp lệ', '${rootId}', 1);
      commit;
    `);
    const blocked = await root.rpc("create_equipment_request_with_items", {
      target_class_schedule_id: fixture.rootSchedule,
      target_semester: "HK1",
      target_responsible_lecturer_id: null,
      target_receive_at: "2099-12-21T02:00:00.000Z",
      target_return_at: "2099-12-21T09:00:00.000Z",
      target_note: null,
      target_late_registration_reason: null,
      target_items: [
        {
          skill_name: "ignored",
          catalog_item_id: fixture.catalog,
          quantity: 1,
          note: null,
        },
      ],
    });
    assert.ok(blocked.error);
    assert.match(
      blocked.error.message,
      /ROOT_ADMIN_OPERATIONAL_ASSIGNMENT_FORBIDDEN/,
    );
  } finally {
    localSql(`
      begin;
      set local session_replication_role = replica;
      delete from public.email_notifications where payload->>'request_id' = '${requestId || "00000000-0000-0000-0000-000000000000"}';
      delete from public.email_outbox_events where aggregate_id = '${requestId || "00000000-0000-0000-0000-000000000000"}';
      delete from public.equipment_request_items where request_id = '${requestId || "00000000-0000-0000-0000-000000000000"}';
      delete from public.equipment_requests where id = '${requestId || "00000000-0000-0000-0000-000000000000"}';
      delete from public.basic_medical_registration_sessions where id in ('${fixture.session}', '${fixture.rootSession}');
      delete from public.class_schedules where id in ('${fixture.schedule}', '${fixture.rootSchedule}');
      delete from public.basic_medical_registrations where id in ('${fixture.registration}', '${fixture.rootRegistration}');
      delete from public.basic_medical_equipment_catalog where id = '${fixture.catalog}';
      delete from public.rooms where id = '${fixture.room}';
      delete from public.courses where id = '${fixture.course}';
      ${teachingHadBasicMedicalScope ? "" : `delete from public.profile_room_types where profile_id = '${teachingLecturerId}' and room_type_id = (select id from public.room_types where code = 'basic_medical');`}
      update public.email_delivery_settings set delivery_mode = '${deliveryModeBefore}' where setting_key = 'primary';
      commit;
    `);
    assert.equal(
      hasBasicMedicalScope(teachingLecturerId),
      teachingHadBasicMedicalScope,
    );
  }
});
