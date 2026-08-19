import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

function serviceClient() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function publicClient() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const NURSING_SKILLS_ROOM_TYPE_ID = "40000000-0000-0000-0000-000000000001";
const ROOM_SKILLS_1 = "20000000-0000-0000-0000-000000000001";
const ROOM_SKILLS_2 = "20000000-0000-0000-0000-000000000002";
const COURSE_SKILLS_1 = "10000000-0000-0000-0000-000000000001";
const COURSE_SKILLS_2 = "10000000-0000-0000-0000-000000000002";

test("Skills Class Edit Authority & Equipment Registration Lock", async (t) => {
  const service = serviceClient();

  async function createTestUser(role, suffix) {
    const email = `test-skills-${role}-${suffix}@campus.local`;
    const password = "LocalPassword123!";
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `Test ${role} ${suffix}` },
    });
    assert.ifError(error);
    const id = data.user.id;
    await service.from("profiles").update({ is_active: true }).eq("id", id);
    await service.from("user_roles").insert({ user_id: id, role });
    await service
      .from("profile_room_types")
      .insert({ profile_id: id, room_type_id: NURSING_SKILLS_ROOM_TYPE_ID });

    const client = publicClient();
    const { error: signErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(signErr);
    return { id, email, client };
  }

  async function createTestSchedule(date, creatorId, lecturerId = null) {
    const nowIso = new Date().toISOString();
    const { data, error } = await service
      .from("class_schedules")
      .insert({
        schedule_date: date,
        start_time: "07:30:00",
        end_time: "11:30:00",
        room_id: ROOM_SKILLS_1,
        course_id: COURSE_SKILLS_1,
        course_code_snapshot: "NUR 101",
        course_name_snapshot: "Thăm khám thể chất",
        student_count: 25,
        semester: "HK1",
        source: "manual",
        schedule_status: "published",
        created_by: creatorId,
        published_by: creatorId,
        published_at: nowIso,
        lecturer_id: lecturerId,
      })
      .select()
      .single();
    assert.ifError(error);
    return data;
  }

  const runId = Math.floor(Math.random() * 80000) + 10000;
  const suffix = crypto.randomUUID().slice(0, 6);
  const lecturer1 = await createTestUser("lecturer", `${suffix}-1`);
  const lecturer2 = await createTestUser("lecturer", `${suffix}-2`);
  const taCreator = await createTestUser("teaching_assistant", `${suffix}-ta1`);
  const taNonCreator = await createTestUser(
    "teaching_assistant",
    `${suffix}-ta2`,
  );

  function testDate(offsetDay) {
    const m = String((runId % 11) + 1).padStart(2, "0");
    const d = String((offsetDay % 27) + 1).padStart(2, "0");
    const y = 2070 + (runId % 20);
    return `${y}-${m}-${d}`;
  }

  await t.test(
    "1. Equipment lock query RPC reports accurate boolean without data leak",
    async () => {
      const d1 = testDate(1);
      const schedule = await createTestSchedule(d1, lecturer1.id, lecturer1.id);

      // Initial state: no equipment request -> false
      const { data: initialLock, error: lockErr1 } = await lecturer1.client.rpc(
        "get_class_schedules_equipment_lock_status",
        { target_schedule_ids: [schedule.id] },
      );
      assert.ifError(lockErr1);
      assert.equal(initialLock.length, 1);
      assert.equal(initialLock[0].has_equipment_request, false);

      // Insert equipment request for this schedule
      const { data: eqReq, error: eqErr } = await service
        .from("equipment_requests")
        .insert({
          class_schedule_id: schedule.id,
          status: "new",
          receive_at: `${d1}T09:00:00+07:00`,
          return_at: `${d1}T11:00:00+07:00`,
          registrant_id: lecturer1.id,
          responsible_lecturer_id: lecturer1.id,
          phone_snapshot: "0901234567",
          email_snapshot: lecturer1.email,
          created_by: lecturer1.id,
          semester: "HK1",
        })
        .select()
        .single();
      assert.ifError(eqErr);

      // Now locked -> true
      const { data: lockedState, error: lockErr2 } = await lecturer1.client.rpc(
        "get_class_schedules_equipment_lock_status",
        { target_schedule_ids: [schedule.id] },
      );
      assert.ifError(lockErr2);
      assert.equal(lockedState[0].has_equipment_request, true);

      // Soft cancel equipment request -> STILL LOCKED
      await service
        .from("equipment_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", eqReq.id);

      const { data: softCancelledLock, error: lockErr3 } =
        await lecturer1.client.rpc(
          "get_class_schedules_equipment_lock_status",
          { target_schedule_ids: [schedule.id] },
        );
      assert.ifError(lockErr3);
      assert.equal(softCancelledLock[0].has_equipment_request, true);

      // Hard delete equipment request -> UNLOCKED
      await service.from("equipment_requests").delete().eq("id", eqReq.id);

      const { data: unlockedState, error: lockErr4 } =
        await lecturer1.client.rpc(
          "get_class_schedules_equipment_lock_status",
          { target_schedule_ids: [schedule.id] },
        );
      assert.ifError(lockErr4);
      assert.equal(unlockedState[0].has_equipment_request, false);
    },
  );

  await t.test(
    "2. Equipment lock blocks edit, reschedule, withdraw, and delete",
    async () => {
      const d2 = testDate(2);
      const schedule = await createTestSchedule(d2, lecturer1.id, lecturer1.id);

      // Add equipment request to lock schedule
      const { data: eqReq, error: eqErr } = await service
        .from("equipment_requests")
        .insert({
          class_schedule_id: schedule.id,
          status: "new",
          receive_at: `${d2}T09:00:00+07:00`,
          return_at: `${d2}T11:00:00+07:00`,
          registrant_id: lecturer1.id,
          responsible_lecturer_id: lecturer1.id,
          phone_snapshot: "0901234567",
          email_snapshot: lecturer1.email,
          created_by: lecturer1.id,
          semester: "HK1",
        })
        .select()
        .single();
      assert.ifError(eqErr);

      // Try update_skills_lab_class_schedule -> BLOCKED
      const { error: editErr } = await lecturer1.client.rpc(
        "update_skills_lab_class_schedule",
        {
          target_schedule_id: schedule.id,
          target_schedule_date: d2,
          target_start_time: "12:30",
          target_end_time: "16:30",
          target_course_id: COURSE_SKILLS_1,
          target_room_id: ROOM_SKILLS_1,
          target_student_count: 30,
        },
      );
      assert.ok(editErr);
      assert.ok(editErr.message.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"));

      // Try withdraw_class -> BLOCKED
      const { error: withdrawErr } = await lecturer1.client.rpc(
        "withdraw_class",
        {
          target_schedule_id: schedule.id,
        },
      );
      assert.ok(withdrawErr);
      assert.ok(withdrawErr.message.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"));

      // Try delete_skills_lab_class_schedule -> BLOCKED
      const { error: delErr } = await lecturer1.client.rpc(
        "delete_skills_lab_class_schedule",
        {
          target_schedule_id: schedule.id,
        },
      );
      assert.ok(delErr);
      assert.ok(delErr.message.includes("CLASS_EQUIPMENT_REQUEST_EXISTS"));

      // Clean up eq request
      await service.from("equipment_requests").delete().eq("id", eqReq.id);
    },
  );

  await t.test(
    "3. Lecturer and TA inline editing authority & course resolution",
    async () => {
      const d3 = testDate(3);
      const schedule = await createTestSchedule(d3, lecturer1.id, lecturer1.id);

      // Lecturer edits own class to change course, time, room, student count
      const { data: updatedClass, error: updateErr } =
        await lecturer1.client.rpc("update_skills_lab_class_schedule", {
          target_schedule_id: schedule.id,
          target_schedule_date: d3,
          target_start_time: "12:30",
          target_end_time: "16:30",
          target_course_id: COURSE_SKILLS_2,
          target_room_id: ROOM_SKILLS_2,
          target_student_count: 40,
        });
      assert.ifError(updateErr);
      assert.equal(updatedClass.course_id, COURSE_SKILLS_2);
      assert.equal(updatedClass.course_code_snapshot, "NUR 205");
      assert.equal(updatedClass.course_name_snapshot, "Điều dưỡng nội khoa");
      assert.equal(updatedClass.student_count, 40);
      assert.equal(updatedClass.room_id, ROOM_SKILLS_2);
      assert.equal(updatedClass.start_time, "12:30:00");
      assert.equal(updatedClass.end_time, "16:30:00");
      // Lecturer assignments strictly preserved
      assert.equal(updatedClass.lecturer_id, lecturer1.id);

      // TA creator can also edit
      const d4 = testDate(4);
      const taSchedule = await createTestSchedule(
        d4,
        taCreator.id,
        lecturer1.id,
      );
      const { data: taUpdatedClass, error: taUpdateErr } =
        await taCreator.client.rpc("update_skills_lab_class_schedule", {
          target_schedule_id: taSchedule.id,
          target_schedule_date: d4,
          target_start_time: "12:30",
          target_end_time: "16:30",
          target_course_id: COURSE_SKILLS_2,
          target_room_id: ROOM_SKILLS_2,
          target_student_count: 35,
        });
      assert.ifError(taUpdateErr);
      assert.equal(taUpdatedClass.student_count, 35);
      assert.equal(taUpdatedClass.course_id, COURSE_SKILLS_2);
    },
  );

  await t.test(
    "4. Unrelated Lecturer and non-creator TA are denied edit",
    async () => {
      const d5 = testDate(5);
      const schedule = await createTestSchedule(d5, lecturer1.id, lecturer1.id);

      // Unrelated lecturer cannot edit
      const { error: lecErr } = await lecturer2.client.rpc(
        "update_skills_lab_class_schedule",
        {
          target_schedule_id: schedule.id,
          target_schedule_date: d5,
          target_start_time: "07:30",
          target_end_time: "11:30",
          target_course_id: COURSE_SKILLS_1,
          target_room_id: ROOM_SKILLS_1,
          target_student_count: 20,
        },
      );
      assert.ok(lecErr);
      assert.ok(lecErr.message.includes("CLASS_UPDATE_FORBIDDEN"));

      // Non-creator TA cannot edit
      const { error: taErr } = await taNonCreator.client.rpc(
        "update_skills_lab_class_schedule",
        {
          target_schedule_id: schedule.id,
          target_schedule_date: d5,
          target_start_time: "07:30",
          target_end_time: "11:30",
          target_course_id: COURSE_SKILLS_1,
          target_room_id: ROOM_SKILLS_1,
          target_student_count: 20,
        },
      );
      assert.ok(taErr);
      assert.ok(taErr.message.includes("CLASS_UPDATE_FORBIDDEN"));
    },
  );
});
