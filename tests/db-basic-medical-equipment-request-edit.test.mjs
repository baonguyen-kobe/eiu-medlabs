import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabaseTarget } from "./helpers/local-test-safety.mjs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const localEnv = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [key, ...value] = line.split("=");
      return [key, value.join("=")];
    }),
);
assertLocalSupabaseTarget(localEnv.NEXT_PUBLIC_SUPABASE_URL);

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

async function signIn(email, password) {
  const client = createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(error);
  return { client, user: data.user };
}

function items(catalogId, quantity = 1, note = "") {
  return [{ catalog_item_id: catalogId, quantity, note }];
}

test("Basic Medical equipment edit preserves its source and stays domain-local", async () => {
  const fixture = {
    course: crypto.randomUUID(),
    room: crypto.randomUUID(),
    registrationA: crypto.randomUUID(),
    scheduleA: crypto.randomUUID(),
    sessionA: crypto.randomUUID(),
    registrationB: crypto.randomUUID(),
    scheduleB: crypto.randomUUID(),
    sessionB: crypto.randomUUID(),
    catalog: crypto.randomUUID(),
    inactiveCatalog: crypto.randomUUID(),
  };
  const owner = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const manager = await signIn("admin@campus.local", "LocalAdmin123!");
  const unrelated = await signIn("trogiang@campus.local", "LocalAssistant123!");
  const ownerId = owner.user.id;
  const skillsCatalogId = "30000000-0000-0000-0000-000000000001";
  let requestA;
  let requestB;

  try {
    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);
      insert into public.profile_room_types (profile_id, room_type_id)
      select '${ownerId}', id
      from public.room_types
      where code = 'basic_medical'
      on conflict do nothing;
      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${fixture.course}', 'BM-EDIT', 'Basic Medical edit test', id, true
      from public.room_types where code = 'basic_medical';
      insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
      select '${fixture.room}', 'BM-EDIT', 'TEST', 'Basic Medical edit', id, 20, true
      from public.room_types where code = 'basic_medical';
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count, registrant_id, responsible_lecturer_id, created_by)
      values
        ('${fixture.registrationA}', '2099-2100', 'HK1', '2099-11-22', '2099-11-22', '${fixture.course}', '${fixture.room}', 20, '${ownerId}', '${ownerId}', '${ownerId}'),
        ('${fixture.registrationB}', '2099-2100', 'HK1', '2099-11-23', '2099-11-23', '${fixture.course}', '${fixture.room}', 20, '${ownerId}', '${ownerId}', '${ownerId}');
      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date, start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id, created_by, published_by, published_at)
      values
        ('${fixture.scheduleA}', '${fixture.course}', 'BM-EDIT', 'Basic Medical edit test', '${fixture.room}', '${ownerId}', '2099-11-22', '09:00', '11:00', 'manual', 'published', 20, '${fixture.registrationA}', '${ownerId}', '${ownerId}', clock_timestamp()),
        ('${fixture.scheduleB}', '${fixture.course}', 'BM-EDIT', 'Basic Medical copy target', '${fixture.room}', '${ownerId}', '2099-11-23', '09:00', '11:00', 'manual', 'published', 20, '${fixture.registrationB}', '${ownerId}', '${ownerId}', clock_timestamp());
      insert into public.basic_medical_registration_sessions (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${fixture.sessionA}', '${fixture.registrationA}', '${fixture.scheduleA}', 'Bài nguồn không đổi', '${ownerId}', 1),
        ('${fixture.sessionB}', '${fixture.registrationB}', '${fixture.scheduleB}', 'Bài đích không đổi', '${ownerId}', 1);
      insert into public.basic_medical_equipment_catalog (id, item_name, commercial_name, unit, is_active)
      values
        ('${fixture.catalog}', 'Thiết bị edit', 'Thiết bị edit thương mại', 'Cái', true),
        ('${fixture.inactiveCatalog}', 'Thiết bị không hoạt động', 'Thiết bị không hoạt động TM', 'Cái', false);
      commit;
    `);

    const createA = await owner.client.rpc(
      "create_equipment_request_with_items",
      {
        target_class_schedule_id: fixture.scheduleA,
        target_semester: "HK1",
        target_responsible_lecturer_id: null,
        target_receive_at: "2099-11-22T02:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "ghi chú nguồn",
        target_late_registration_reason: null,
        target_items: [
          {
            skill_name: "ignored",
            catalog_item_id: fixture.catalog,
            quantity: 1,
            note: "một",
          },
        ],
      },
    );
    assert.ifError(createA.error);
    requestA = createA.data;
    assert.ok(requestA, "EDIT-1: owner creates the Basic Medical request");

    const updateA = await owner.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "owner adjusted",
        target_late_registration_reason: null,
        target_items: items(fixture.catalog, 3, "ba"),
      },
    );
    assert.ifError(updateA.error);
    assert.equal(updateA.data, requestA, "EDIT-1 preserves request ID");

    localSql(`
      begin;
      set local session_replication_role = replica;
      update public.equipment_requests set status = 'preparing' where id = '${requestA}';
      commit;
    `);
    const preparing = await owner.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "preparing adjusted",
        target_late_registration_reason: null,
        target_items: items(fixture.catalog, 4, "bốn"),
      },
    );
    assert.ifError(preparing.error, "EDIT-2 preparing stays editable");

    const forbidden = await unrelated.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "forbidden",
        target_late_registration_reason: null,
        target_items: items(fixture.catalog),
      },
    );
    assert.ok(forbidden.error, "EDIT-3 unrelated lecturer/TA cannot edit");

    const managerUpdate = await manager.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "manager adjusted",
        target_late_registration_reason: null,
        target_items: items(fixture.catalog, 5, "năm"),
      },
    );
    assert.ifError(
      managerUpdate.error,
      "EDIT-4 Basic Medical manager can edit",
    );

    const { data: persisted, error: persistedError } = await manager.client
      .from("equipment_requests")
      .select(
        "source_identity_id,class_schedule_id,request_domain,note,equipment_request_items(skill_name,quantity,catalog_item_id,basic_medical_catalog_item_id,note)",
      )
      .eq("id", requestA)
      .single();
    assert.ifError(persistedError);
    assert.equal(
      persisted.source_identity_id,
      fixture.sessionA,
      "EDIT-6 source identity is immutable",
    );
    assert.equal(
      persisted.class_schedule_id,
      fixture.scheduleA,
      "EDIT-7 class schedule is immutable",
    );
    assert.equal(persisted.request_domain, "basic_medical");
    assert.equal(
      persisted.equipment_request_items[0].basic_medical_catalog_item_id,
      fixture.catalog,
      "EDIT-10 stores Basic Medical catalog only",
    );
    assert.equal(
      persisted.equipment_request_items[0].catalog_item_id,
      null,
      "EDIT-8 never stores Skills catalog",
    );
    assert.equal(
      persisted.equipment_request_items[0].skill_name,
      "Bài nguồn không đổi",
      "EDIT-11 preserves lesson title",
    );

    const skillsCatalog = await manager.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "skills catalog",
        target_late_registration_reason: null,
        target_items: items(skillsCatalogId),
      },
    );
    assert.ok(skillsCatalog.error, "EDIT-8 rejects Skills catalog IDs");
    const inactiveCatalog = await manager.client.rpc(
      "update_basic_medical_equipment_request_content",
      {
        target_request_id: requestA,
        target_receive_at: "2099-11-22T04:00:00.000Z",
        target_return_at: "2099-11-22T09:00:00.000Z",
        target_note: "inactive catalog",
        target_late_registration_reason: null,
        target_items: items(fixture.inactiveCatalog),
      },
    );
    assert.ok(
      inactiveCatalog.error,
      "EDIT-9 rejects inactive Basic Medical catalog IDs",
    );

    for (const status of [
      "handed_over",
      "returned",
      "completed",
      "cancelled",
    ]) {
      localSql(`
        begin;
        set local session_replication_role = replica;
        update public.equipment_requests set status = '${status}' where id = '${requestA}';
        commit;
      `);
      const locked = await owner.client.rpc(
        "update_basic_medical_equipment_request_content",
        {
          target_request_id: requestA,
          target_receive_at: "2099-11-22T04:00:00.000Z",
          target_return_at: "2099-11-22T09:00:00.000Z",
          target_note: status,
          target_late_registration_reason: null,
          target_items: items(fixture.catalog),
        },
      );
      assert.ok(locked.error, `EDIT-5 ${status} cannot edit`);
    }
    localSql(`
      begin;
      set local session_replication_role = replica;
      update public.equipment_requests set status = 'preparing' where id = '${requestA}';
      commit;
    `);

    const createB = await owner.client.rpc(
      "create_equipment_request_with_items",
      {
        target_class_schedule_id: fixture.scheduleB,
        target_semester: "HK1",
        target_responsible_lecturer_id: null,
        target_receive_at: "2099-11-23T02:00:00.000Z",
        target_return_at: "2099-11-23T09:00:00.000Z",
        target_note: "copy destination",
        target_late_registration_reason: null,
        target_items: [
          {
            skill_name: "ignored",
            catalog_item_id: fixture.catalog,
            quantity: 1,
            note: "copy",
          },
        ],
      },
    );
    assert.ifError(createB.error);
    requestB = createB.data;
    const duplicateDestination = await owner.client.rpc(
      "create_equipment_request_with_items",
      {
        target_class_schedule_id: fixture.scheduleB,
        target_semester: "HK1",
        target_responsible_lecturer_id: null,
        target_receive_at: "2099-11-23T02:00:00.000Z",
        target_return_at: "2099-11-23T09:00:00.000Z",
        target_note: "duplicate",
        target_late_registration_reason: null,
        target_items: [
          {
            skill_name: "ignored",
            catalog_item_id: fixture.catalog,
            quantity: 1,
            note: "duplicate",
          },
        ],
      },
    );
    assert.ok(
      duplicateDestination.error,
      "COPY keeps destination session uniqueness through create RPC",
    );

    const outboxCount = localSql(
      `select count(*) from public.email_outbox_events where aggregate_id = '${requestA}';`,
    );
    assert.equal(
      outboxCount,
      "0",
      "EDIT-12 creates no Skills equipment outbox event",
    );
  } finally {
    localSql(`
      begin;
      set local session_replication_role = replica;
      delete from public.equipment_request_items where request_id in ('${requestA ?? "00000000-0000-0000-0000-000000000000"}', '${requestB ?? "00000000-0000-0000-0000-000000000000"}');
      delete from public.equipment_requests where id in ('${requestA ?? "00000000-0000-0000-0000-000000000000"}', '${requestB ?? "00000000-0000-0000-0000-000000000000"}');
      delete from public.basic_medical_registration_sessions where id in ('${fixture.sessionA}', '${fixture.sessionB}');
      delete from public.class_schedules where id in ('${fixture.scheduleA}', '${fixture.scheduleB}');
      delete from public.basic_medical_registrations where id in ('${fixture.registrationA}', '${fixture.registrationB}');
      delete from public.basic_medical_equipment_catalog where id in ('${fixture.catalog}', '${fixture.inactiveCatalog}');
      delete from public.rooms where id = '${fixture.room}';
      delete from public.courses where id = '${fixture.course}';
      delete from public.profile_room_types
      where profile_id = '${ownerId}'
        and room_type_id = (
          select id from public.room_types where code = 'basic_medical'
        );
      commit;
    `);
  }
});
