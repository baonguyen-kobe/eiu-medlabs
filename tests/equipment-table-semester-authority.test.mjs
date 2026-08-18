import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function getLocalEnv() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
  }
  return env;
}

const env = getLocalEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function serviceClient() {
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email, password) {
  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.user);
  return { supabase, user: data.user };
}

const ROOM_ID_SKILLS_LAB = "20000000-0000-0000-0000-000000000001";
const COURSE_ID = "10000000-0000-0000-0000-000000000001";

const DATES = {
  D1: "2060-01-01",
  D2: "2060-01-02",
  D3: "2060-01-03",
  D4: "2060-01-04",
  D5_A: "2060-01-05",
  D5_B: "2060-01-06",
  D6_A: "2060-01-07",
  D6_B: "2060-01-08",
  D7: "2060-01-09",
};

function receiveAt(d) {
  return `${d}T02:00:00.000Z`; // 09:00 VN
}
function returnAt(d) {
  return `${d}T04:00:00.000Z`; // 11:00 VN
}

async function buildSchedule(service, id, semester, createdById, scheduleDate) {
  const { error } = await service.from("class_schedules").insert({
    id,
    course_id: COURSE_ID,
    course_code_snapshot: "TST 2D",
    course_name_snapshot: "Blocker 2D test",
    room_id: ROOM_ID_SKILLS_LAB,
    schedule_date: scheduleDate,
    start_time: "07:30",
    end_time: "09:30",
    source: "manual",
    schedule_status: "published",
    student_count: 1,
    semester: semester ?? null,
    created_by: createdById,
    published_by: createdById,
    published_at: new Date().toISOString(),
    lecturer_id: null,
  });
  return error;
}

test("D1: Direct table INSERT mismatch -> schedule HK2 overrides caller HK4", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleId, "HK2", lecturer.user.id, DATES.D1));

    // Direct table INSERT using authenticated lecturer client, passing semester: 'HK4'
    const { data: req, error: insertErr } = await lecturer.supabase
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleId,
        semester: "HK4", // Caller attempts mismatch
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D1),
        return_at: returnAt(DATES.D1),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    assert.ok(!insertErr, `Insert failed: ${insertErr?.message}`);
    requestId = req.id;

    // Invariant check: Stored semester MUST be HK2 (derived from schedule), NOT HK4
    assert.equal(req.semester, "HK2", "Table-level trigger must enforce schedule HK2 authority over caller HK4");
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("D2: Direct table INSERT on NULL schedule semester -> FAIL CLOSED", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleId, null, lecturer.user.id, DATES.D2));

    const { error: insertErr } = await lecturer.supabase
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleId,
        semester: "HK4",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D2),
        return_at: returnAt(DATES.D2),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    assert.ok(insertErr, "Direct INSERT on schedule with NULL semester must FAIL CLOSED");
    assert.match(insertErr.message, /Lịch học chưa có thông tin Học kỳ hợp lệ/i);
  } finally {
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("D3: Direct table UPDATE semester tamper -> schedule HK2 authority maintained", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleId, "HK2", lecturer.user.id, DATES.D3));

    const { data: req } = await service
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleId,
        semester: "HK2",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D3),
        return_at: returnAt(DATES.D3),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    requestId = req.id;

    // Authenticated direct UPDATE attempting to tamper semester to HK4
    const { data: updated, error: updateErr } = await lecturer.supabase
      .from("equipment_requests")
      .update({ semester: "HK4" })
      .eq("id", req.id)
      .select()
      .single();

    assert.ok(!updateErr, `Update failed: ${updateErr?.message}`);
    // Must remain HK2!
    assert.equal(updated.semester, "HK2", "Direct update attempting to tamper semester must be overwritten by schedule HK2");
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("D4: Historical request on NULL schedule -> same-schedule edit preserves HK1", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    // Initially created with HK1
    assert.ifError(await buildSchedule(service, scheduleId, "HK1", lecturer.user.id, DATES.D4));

    const { data: req } = await service
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleId,
        semester: "HK1",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D4),
        return_at: returnAt(DATES.D4),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    requestId = req.id;

    // Simulate historical schedule where schedule semester became NULL
    await service.from("class_schedules").update({ semester: null }).eq("id", scheduleId);

    // Direct edit updating note while remaining on same schedule
    const { data: updated, error: updateErr } = await lecturer.supabase
      .from("equipment_requests")
      .update({ note: "Updated historical note" })
      .eq("id", req.id)
      .select()
      .single();

    assert.ok(!updateErr, `Update failed: ${updateErr?.message}`);
    assert.equal(updated.semester, "HK1", "Historical semester HK1 must be preserved on same schedule edit");
    assert.equal(updated.note, "Updated historical note");
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("D5: Change class_schedule_id to schedule with NULL semester -> FAIL CLOSED", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleIdA = crypto.randomUUID();
  const scheduleIdB = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleIdA, "HK1", lecturer.user.id, DATES.D5_A));
    assert.ifError(await buildSchedule(service, scheduleIdB, null, lecturer.user.id, DATES.D5_B));

    const { data: req } = await service
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleIdA,
        semester: "HK1",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D5_A),
        return_at: returnAt(DATES.D5_A),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    requestId = req.id;

    // Direct UPDATE moving request to schedule B
    const { error: updateErr } = await lecturer.supabase
      .from("equipment_requests")
      .update({
        class_schedule_id: scheduleIdB,
        receive_at: receiveAt(DATES.D5_B),
        return_at: returnAt(DATES.D5_B),
      })
      .eq("id", req.id);

    assert.ok(updateErr, "Moving to schedule with NULL semester must FAIL CLOSED");
    assert.match(updateErr.message, /Lịch học mới chưa có thông tin Học kỳ hợp lệ/i);
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleIdA);
    await service.from("class_schedules").delete().eq("id", scheduleIdB);
  }
});

test("D6: Change class_schedule_id to canonical destination -> target schedule HK3 wins", async () => {
  const service = serviceClient();
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleIdA = crypto.randomUUID();
  const scheduleIdB = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleIdA, "HK1", lecturer.user.id, DATES.D6_A));
    assert.ifError(await buildSchedule(service, scheduleIdB, "HK3", lecturer.user.id, DATES.D6_B));

    const { data: req } = await service
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleIdA,
        semester: "HK1",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D6_A),
        return_at: returnAt(DATES.D6_A),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    requestId = req.id;

    // Direct UPDATE moving request to schedule B, caller attempts semester HK1
    const { data: updated, error: updateErr } = await lecturer.supabase
      .from("equipment_requests")
      .update({
        class_schedule_id: scheduleIdB,
        semester: "HK1",
        receive_at: receiveAt(DATES.D6_B),
        return_at: returnAt(DATES.D6_B),
      })
      .eq("id", req.id)
      .select()
      .single();

    assert.ok(!updateErr, `Update failed: ${updateErr?.message}`);
    assert.equal(updated.semester, "HK3", "Destination schedule HK3 must overwrite caller HK1");
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleIdA);
    await service.from("class_schedules").delete().eq("id", scheduleIdB);
  }
});

test("D7: Status transition and confirmation flows remain intact", async () => {
  const service = serviceClient();
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();
  let requestId = null;

  try {
    assert.ifError(
      (await service.from("profiles").update({ phone: "0901234501" }).eq("id", lecturer.user.id)).error,
    );
    assert.ifError(await buildSchedule(service, scheduleId, "HK2", lecturer.user.id, DATES.D7));

    const { data: req } = await service
      .from("equipment_requests")
      .insert({
        class_schedule_id: scheduleId,
        semester: "HK2",
        registrant_id: lecturer.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234501",
        email_snapshot: lecturer.user.email,
        receive_at: receiveAt(DATES.D7),
        return_at: returnAt(DATES.D7),
        created_by: lecturer.user.id,
      })
      .select()
      .single();

    requestId = req.id;

    // Admin manager_confirm_equipment_status -> 'preparing'
    const { data: confirmed, error: rpcErr } = await admin.supabase.rpc("manager_confirm_equipment_status", {
      target_request_id: req.id,
      target_status: "preparing",
    });

    assert.ok(!rpcErr, `Confirmation RPC failed: ${rpcErr?.message}`);
    assert.equal(confirmed.status, "preparing");
    assert.equal(confirmed.semester, "HK2");
  } finally {
    if (requestId) {
      await service.from("equipment_requests").delete().eq("id", requestId);
    }
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});
