import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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

function client() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function serviceClient() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function signIn(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(error);
  assert.ok(data.user);
  return { supabase, user: data.user };
}

test("chỉ tài khoản nhân sự được duyệt trước mới có thể được tạo", async () => {
  const supabase = client();
  const email = `auth-whitelist-${crypto.randomUUID()}@eiu.edu.vn`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password: "WhitelistCheck123!",
  });

  assert.ok(error);
  assert.equal(error.status, 403);
  assert.match(error.message, /Nhân sự/i);
  assert.equal(data.user, null);
});

test("Người xem chỉ đọc lịch và nhận email theo loại phòng đã chọn", async () => {
  const service = serviceClient();
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const email = "viewer-" + crypto.randomUUID() + "@campus.local";
  const password = "LocalViewer123!";
  const scheduleId = crypto.randomUUID();
  const { data: created, error: createUserError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Người xem kiểm thử" },
      app_metadata: { preapproved: true },
    });
  assert.ifError(createUserError);
  assert.ok(created.user);
  const viewerId = created.user.id;

  try {
    const { error: roleError } = await service.from("user_roles").insert({
      user_id: viewerId,
      role: "viewer",
      created_by: admin.user.id,
    });
    assert.ifError(roleError);
    const { error: scopeError } = await service
      .from("profile_room_types")
      .upsert({
        profile_id: viewerId,
        room_type_id: "40000000-0000-0000-0000-000000000001",
        created_by: admin.user.id,
        receive_schedule_emails: true,
      });
    assert.ifError(scopeError);

    const viewer = await signIn(email, password);
    const { error: readError } = await viewer.supabase
      .from("class_schedules")
      .select("id")
      .limit(1);
    assert.ifError(readError);

    const { error: writeError } = await viewer.supabase
      .from("class_schedules")
      .insert({
        id: crypto.randomUUID(),
        course_id: "10000000-0000-0000-0000-000000000001",
        course_code_snapshot: "NUR 101",
        course_name_snapshot: "Thăm khám thể chất",
        room_id: "20000000-0000-0000-0000-000000000001",
        schedule_date: "2039-08-19",
        start_time: "07:30",
        end_time: "11:30",
        source: "manual",
        schedule_status: "published",
        created_by: viewerId,
        published_by: viewerId,
        published_at: new Date().toISOString(),
      });
    assert.ok(writeError);

    const { error: scheduleError } = await admin.supabase
      .from("class_schedules")
      .insert({
        id: scheduleId,
        course_id: "10000000-0000-0000-0000-000000000001",
        course_code_snapshot: "NUR 101",
        course_name_snapshot: "Thăm khám thể chất",
        room_id: "20000000-0000-0000-0000-000000000001",
        schedule_date: "2039-08-20",
        start_time: "07:30",
        end_time: "11:30",
        source: "manual",
        schedule_status: "published",
        created_by: admin.user.id,
        published_by: admin.user.id,
        published_at: new Date().toISOString(),
      });
    assert.ifError(scheduleError);

    const { data: notification, error: notificationError } = await service
      .from("email_notifications")
      .select("id")
      .eq("recipient_id", viewerId)
      .eq("notification_type", "class_schedule_created")
      .eq("payload->>schedule_id", scheduleId)
      .maybeSingle();
    assert.ifError(notificationError);
    assert.ok(notification);
  } finally {
    await admin.supabase.from("class_schedules").delete().eq("id", scheduleId);
    await service.auth.admin.deleteUser(viewerId);
  }
});

test("tối đa hai giảng viên nhận được lớp khi đăng ký đồng thời", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const importerLecturer = await signIn(
    "importer@campus.local",
    "LocalImporter123!",
  );
  const scheduleId = crypto.randomUUID();

  const { error: insertError } = await admin.supabase
    .from("class_schedules")
    .insert({
      id: scheduleId,
      course_id: "10000000-0000-0000-0000-000000000001",
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: "20000000-0000-0000-0000-000000000001",
      schedule_date: "2030-08-20",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
  assert.ifError(insertError);

  const results = await Promise.all([
    admin.supabase.rpc("claim_class", { target_schedule_id: scheduleId }),
    lecturer.supabase.rpc("claim_class", { target_schedule_id: scheduleId }),
    importerLecturer.supabase.rpc("claim_class", {
      target_schedule_id: scheduleId,
    }),
  ]);
  assert.equal(results.filter((result) => result.error === null).length, 2);
  assert.equal(results.filter((result) => result.error !== null).length, 1);

  const { data: claimed } = await admin.supabase
    .from("class_schedules")
    .select("lecturer_id, lecturer_2_id")
    .eq("id", scheduleId)
    .single();
  assert.ok(claimed?.lecturer_id);
  assert.ok(claimed?.lecturer_2_id);
  assert.notEqual(claimed.lecturer_id, claimed.lecturer_2_id);

  const users = [admin, lecturer, importerLecturer];
  for (const winnerId of [claimed.lecturer_id, claimed.lecturer_2_id]) {
    const winner = users.find(({ user }) => user.id === winnerId);
    assert.ok(winner);
    const withdrawn = await winner.supabase.rpc("withdraw_class", {
      target_schedule_id: scheduleId,
    });
    assert.ifError(withdrawn.error);
  }

  const { data: emptied } = await admin.supabase
    .from("class_schedules")
    .select("lecturer_id, lecturer_2_id")
    .eq("id", scheduleId)
    .single();
  assert.equal(emptied.lecturer_id, null);
  assert.equal(emptied.lecturer_2_id, null);

  await admin.supabase.from("class_schedules").delete().eq("id", scheduleId);
});

test("importer tạo lịch, phân công giảng viên đúng phạm vi và được xóa", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const importer = await signIn("importer@campus.local", "LocalImporter123!");
  const scheduleId = crypto.randomUUID();
  const assignedScheduleId = crypto.randomUUID();
  await admin.supabase
    .from("class_schedules")
    .delete()
    .in("schedule_date", ["2030-08-21", "2030-08-22"]);

  const baseRow = {
    course_id: "10000000-0000-0000-0000-000000000002",
    course_code_snapshot: "NUR 205",
    course_name_snapshot: "Điều dưỡng nội khoa",
    room_id: "20000000-0000-0000-0000-000000000002",
    schedule_date: "2030-08-21",
    start_time: "13:30",
    end_time: "16:30",
    source: "manual",
    created_by: importer.user.id,
  };

  const { error: createError } = await importer.supabase
    .from("class_schedules")
    .insert({
      ...baseRow,
      id: scheduleId,
      schedule_status: "published",
      published_by: importer.user.id,
      published_at: new Date().toISOString(),
    });
  assert.ifError(createError);

  const { error: assignmentError } = await importer.supabase
    .from("class_schedules")
    .insert({
      ...baseRow,
      id: assignedScheduleId,
      schedule_date: "2030-08-22",
      schedule_status: "published",
      published_by: importer.user.id,
      published_at: new Date().toISOString(),
      lecturer_id: admin.user.id,
    });
  assert.ifError(assignmentError);

  const { data: deleted, error: deleteError } = await importer.supabase
    .from("class_schedules")
    .delete()
    .eq("id", scheduleId)
    .select("id")
    .single();
  assert.ifError(deleteError);
  assert.equal(deleted.id, scheduleId);
  await importer.supabase
    .from("class_schedules")
    .delete()
    .eq("id", assignedScheduleId);
});

test("staff không thể đăng ký hai ca chồng lấn", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");

  const first = await staff.supabase.rpc("register_own_shift", {
    target_date: "2030-08-23",
    target_start: "08:30",
    target_end: "11:30",
    target_shift_type: "MORNING",
    target_template_id: "30000000-0000-0000-0000-000000000001",
    target_note: "Ca kiểm thử",
  });
  assert.ifError(first.error);

  const overlap = await staff.supabase.rpc("register_own_shift", {
    target_date: "2030-08-23",
    target_start: "10:00",
    target_end: "12:00",
    target_shift_type: "CUSTOM",
    target_template_id: null,
    target_note: null,
  });
  assert.ok(overlap.error);

  const cancelled = await staff.supabase.rpc("cancel_own_shift", {
    target_shift_id: first.data.id,
  });
  assert.ifError(cancelled.error);
});

test("staff chỉ đăng ký và xóa lịch trực cố định của chính mình", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const coordinator = await signIn(
    "dieuphoi@eiu.edu.vn",
    "LocalCoordinator123!",
  );

  const { data: leftovers } = await staff.supabase
    .from("staff_shift_patterns")
    .select("id")
    .eq("staff_id", staff.user.id)
    .eq("note", "Ca kiểm thử")
    .eq("is_active", true);
  for (const pattern of leftovers ?? []) {
    await staff.supabase.rpc("cancel_own_shift_pattern", {
      target_pattern_id: pattern.id,
    });
  }

  const created = await staff.supabase.rpc("register_own_shift_pattern", {
    target_weekday: 7,
    target_shift_type: "ALL_DAY",
    target_effective_from: "2026-09-01",
    target_effective_to: null,
    target_note: "Ca kiểm thử",
  });
  assert.ifError(created.error);
  assert.equal(created.data.length, 2);
  assert.deepEqual(created.data.map(({ shift_type }) => shift_type).sort(), [
    "AFTERNOON",
    "MORNING",
  ]);
  assert.ok(created.data.every(({ staff_id }) => staff_id === staff.user.id));
  assert.ok(
    created.data.every(({ effective_to }) => effective_to === "2026-11-30"),
  );

  const patternIds = created.data.map(({ id }) => id);
  const { data: generated, error: generatedError } = await staff.supabase
    .from("staff_shifts")
    .select("id, shift_pattern_id, shift_type, shift_date")
    .in("shift_pattern_id", patternIds);
  assert.ifError(generatedError);
  assert.ok(generated.length >= 8);
  assert.deepEqual(
    [...new Set(generated.map(({ shift_type }) => shift_type))].sort(),
    ["AFTERNOON", "MORNING"],
  );
  assert.ok(generated.every(({ shift_date }) => shift_date <= "2026-11-30"));

  const forbidden = await coordinator.supabase.rpc("cancel_own_shift_pattern", {
    target_pattern_id: patternIds[0],
  });
  assert.ok(forbidden.error);

  const cancelled = await staff.supabase.rpc("cancel_own_shift_pattern", {
    target_pattern_id: patternIds[0],
  });
  assert.ifError(cancelled.error);
  assert.equal(cancelled.data.is_active, false);

  const { data: afterFirstDelete } = await staff.supabase
    .from("staff_shifts")
    .select("shift_pattern_id")
    .in("shift_pattern_id", patternIds);
  assert.equal(
    afterFirstDelete.some(
      ({ shift_pattern_id }) => shift_pattern_id === patternIds[0],
    ),
    false,
  );
  assert.equal(
    afterFirstDelete.some(
      ({ shift_pattern_id }) => shift_pattern_id === patternIds[1],
    ),
    true,
  );

  const secondCancelled = await staff.supabase.rpc("cancel_own_shift_pattern", {
    target_pattern_id: patternIds[1],
  });
  assert.ifError(secondCancelled.error);
});

test("tạo lịch thủ công xếp đúng một email cho mỗi Staff hoặc Admin", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const scheduleId = crypto.randomUUID();
  const { error: insertError } = await admin.supabase
    .from("class_schedules")
    .insert({
      id: scheduleId,
      course_id: "10000000-0000-0000-0000-000000000001",
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: "20000000-0000-0000-0000-000000000001",
      schedule_date: "2033-08-20",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
  assert.ifError(insertError);

  const [{ data: roleRows }, { data: queued, error: queueError }] =
    await Promise.all([
      admin.supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["staff", "admin"]),
      admin.supabase
        .from("email_notifications")
        .select("recipient_id, dedupe_key, payload")
        .eq("notification_type", "class_schedule_created")
        .contains("payload", { schedule_id: scheduleId }),
    ]);
  assert.ifError(queueError);
  const expectedRecipients = new Set(
    (roleRows ?? []).map(({ user_id }) => user_id),
  );
  const scheduleEmails = (queued ?? []).filter(
    ({ payload }) => payload.schedule_id === scheduleId,
  );
  assert.equal(scheduleEmails.length, expectedRecipients.size);
  assert.equal(
    new Set(scheduleEmails.map(({ recipient_id }) => recipient_id)).size,
    expectedRecipients.size,
  );
  assert.equal(
    new Set(scheduleEmails.map(({ dedupe_key }) => dedupe_key)).size,
    expectedRecipients.size,
  );

  await admin.supabase.from("class_schedules").delete().eq("id", scheduleId);
});

test("các thay đổi nghiệp vụ quan trọng được ghi audit", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const { data: logs, error } = await admin.supabase
    .from("audit_logs")
    .select("action, actor_id")
    .in("action", [
      "class_schedule.lecturer_changed",
      "staff_shift.created",
      "staff_shift.status_changed",
    ]);

  assert.ifError(error);
  assert.ok(
    logs.some(
      ({ action, actor_id }) =>
        action === "class_schedule.lecturer_changed" && actor_id,
    ),
  );
  assert.ok(
    logs.some(
      ({ action, actor_id }) => action === "staff_shift.created" && actor_id,
    ),
  );
  assert.ok(
    logs.some(
      ({ action, actor_id }) =>
        action === "staff_shift.status_changed" && actor_id,
    ),
  );
});

test("staff xem được lịch sử import cùng phạm vi và importer xem phiên của mình", async () => {
  const importer = await signIn("importer@campus.local", "LocalImporter123!");
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const batchId = crypto.randomUUID();

  const { error: insertError } = await importer.supabase
    .from("import_batches")
    .insert({
      id: batchId,
      source_type: "import",
      original_file_name: "rls-test.csv",
      file_hash: crypto.randomUUID(),
      status: "uploaded",
      created_by: importer.user.id,
    });
  assert.ifError(insertError);

  const { data: visibleToStaff, error: readError } = await staff.supabase
    .from("import_batches")
    .select("id")
    .eq("id", batchId);
  assert.ifError(readError);
  assert.equal(visibleToStaff.length, 1);

  const { data: visible } = await importer.supabase
    .from("import_batches")
    .select("id")
    .eq("id", batchId)
    .single();
  assert.equal(visible.id, batchId);
});

test("người dùng thường chỉ đọc hồ sơ của mình và dùng danh bạ an toàn", async () => {
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const { data: profiles, error: profileError } = await lecturer.supabase
    .from("profiles")
    .select("id, email, full_name");
  assert.ifError(profileError);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, lecturer.user.id);

  const { data: people, error: directoryError } =
    await lecturer.supabase.rpc("list_active_people");
  assert.ifError(directoryError);
  assert.ok(people.length >= 4);
  assert.deepEqual(Object.keys(people[0]).sort(), ["full_name", "id", "title"]);
});

test("database chặn lịch vượt giờ hoạt động", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const { error } = await admin.supabase.from("class_schedules").insert({
    id: crypto.randomUUID(),
    course_id: "10000000-0000-0000-0000-000000000001",
    course_code_snapshot: "NUR 101",
    course_name_snapshot: "Thăm khám thể chất",
    room_id: "20000000-0000-0000-0000-000000000001",
    schedule_date: "2031-09-01",
    start_time: "11:00",
    end_time: "13:00",
    source: "manual",
    schedule_status: "published",
    created_by: admin.user.id,
    published_by: admin.user.id,
    published_at: new Date().toISOString(),
  });
  assert.ok(error);
  assert.equal(error.code, "23514");
});

test("giảng viên được tạo lớp Skills lab mới trong loại phòng của mình", async () => {
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const scheduleId = crypto.randomUUID();

  const { error } = await lecturer.supabase.from("class_schedules").insert({
    id: scheduleId,
    course_id: "10000000-0000-0000-0000-000000000001",
    course_code_snapshot: "NUR 101",
    course_name_snapshot: "Thăm khám thể chất",
    room_id: "20000000-0000-0000-0000-000000000001",
    schedule_date: "2034-09-07",
    start_time: "07:30",
    end_time: "09:30",
    source: "manual",
    schedule_status: "published",
    student_count: 20,
    created_by: lecturer.user.id,
    published_by: lecturer.user.id,
    published_at: new Date().toISOString(),
  });
  assert.ifError(error);

  const { error: cleanupError } = await admin.supabase
    .from("class_schedules")
    .delete()
    .eq("id", scheduleId);
  assert.ifError(cleanupError);
});

test("chỉ Admin hoặc Staff được chuyển trạng thái phiếu thiết bị", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const scheduleId = crypto.randomUUID();
  const requestId = crypto.randomUUID();

  const { error: scheduleError } = await admin.supabase
    .from("class_schedules")
    .insert({
      id: scheduleId,
      course_id: "10000000-0000-0000-0000-000000000001",
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: "20000000-0000-0000-0000-000000000001",
      schedule_date: "2034-09-08",
      start_time: "07:30",
      end_time: "09:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
  assert.ifError(scheduleError);

  const { error: invalidTimeError } = await admin.supabase
    .from("equipment_requests")
    .insert({
      id: crypto.randomUUID(),
      class_schedule_id: scheduleId,
      registrant_id: admin.user.id,
      responsible_lecturer_id: lecturer.user.id,
      phone_snapshot: "0901000001",
      email_snapshot: "admin@campus.local",
      receive_at: "2034-09-08T03:00:00.000Z",
      return_at: "2034-09-08T04:00:00.000Z",
      status: "new",
      created_by: admin.user.id,
    });
  assert.ok(invalidTimeError);
  assert.equal(invalidTimeError.code, "22023");

  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { error: pastReceiveError } = await admin.supabase
    .from("equipment_requests")
    .insert({
      id: crypto.randomUUID(),
      class_schedule_id: scheduleId,
      registrant_id: admin.user.id,
      responsible_lecturer_id: lecturer.user.id,
      phone_snapshot: "0901000001",
      email_snapshot: "admin@campus.local",
      receive_at: `${pastDate}T02:00:00.000Z`,
      return_at: `${pastDate}T04:00:00.000Z`,
      status: "new",
      created_by: admin.user.id,
    });
  assert.ok(pastReceiveError);
  assert.equal(pastReceiveError.code, "22023");

  const { error: afterClassError } = await admin.supabase
    .from("equipment_requests")
    .insert({
      id: crypto.randomUUID(),
      class_schedule_id: scheduleId,
      registrant_id: admin.user.id,
      responsible_lecturer_id: lecturer.user.id,
      phone_snapshot: "0901000001",
      email_snapshot: "admin@campus.local",
      receive_at: "2034-09-09T02:00:00.000Z",
      return_at: "2034-09-09T04:00:00.000Z",
      status: "new",
      created_by: admin.user.id,
    });
  assert.ok(afterClassError);
  assert.equal(afterClassError.code, "22023");

  const { error: requestError } = await admin.supabase
    .from("equipment_requests")
    .insert({
      id: requestId,
      class_schedule_id: scheduleId,
      registrant_id: admin.user.id,
      responsible_lecturer_id: lecturer.user.id,
      phone_snapshot: "0901000001",
      email_snapshot: "admin@campus.local",
      receive_at: "2034-09-08T02:00:00.000Z",
      return_at: "2034-09-08T04:00:00.000Z",
      status: "new",
      created_by: admin.user.id,
    });
  assert.ifError(requestError);

  const { data: lecturerUpdate, error: lecturerUpdateError } =
    await lecturer.supabase
      .from("equipment_requests")
      .update({ status: "preparing" })
      .eq("id", requestId)
      .select("id");
  assert.ifError(lecturerUpdateError);
  assert.equal(lecturerUpdate.length, 0);

  const { data: staffUpdate, error: staffUpdateError } = await staff.supabase
    .from("equipment_requests")
    .update({ status: "preparing" })
    .eq("id", requestId)
    .select("id,status")
    .single();
  assert.ifError(staffUpdateError);
  assert.equal(staffUpdate.status, "preparing");

  const { error: adminContentEditError } = await admin.supabase
    .from("equipment_requests")
    .update({ note: "Không được sửa sau trạng thái Mới" })
    .eq("id", requestId);
  assert.ok(adminContentEditError);
  assert.equal(adminContentEditError.code, "42501");

  const { data: nextStatus, error: nextStatusError } = await admin.supabase
    .from("equipment_requests")
    .update({ status: "handed_over" })
    .eq("id", requestId)
    .select("status")
    .single();
  assert.ifError(nextStatusError);
  assert.equal(nextStatus.status, "handed_over");

  const { error: scheduleCleanupError } = await admin.supabase
    .from("class_schedules")
    .delete()
    .eq("id", scheduleId);
  assert.ifError(scheduleCleanupError);
});

test("người đăng ký được điều chỉnh nội dung nhưng không được tự đổi trạng thái phiếu", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const firstScheduleId = crypto.randomUUID();
  const secondScheduleId = crypto.randomUUID();
  const requestId = crypto.randomUUID();

  for (const [id, date] of [
    [firstScheduleId, "2035-09-09"],
    [secondScheduleId, "2035-09-10"],
  ]) {
    const { error } = await lecturer.supabase.from("class_schedules").insert({
      id,
      course_id: "10000000-0000-0000-0000-000000000001",
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: "20000000-0000-0000-0000-000000000001",
      schedule_date: date,
      start_time: "07:30",
      end_time: "09:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      created_by: lecturer.user.id,
      published_by: lecturer.user.id,
      published_at: new Date().toISOString(),
    });
    assert.ifError(error);
  }

  const { data: catalogItem, error: catalogError } = await admin.supabase
    .from("equipment_catalog")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();
  assert.ifError(catalogError);

  const { error: requestError } = await lecturer.supabase
    .from("equipment_requests")
    .insert({
      id: requestId,
      class_schedule_id: firstScheduleId,
      semester: "HK1",
      registrant_id: lecturer.user.id,
      responsible_lecturer_id: lecturer.user.id,
      phone_snapshot: "0901000004",
      email_snapshot: "giangvien@campus.local",
      receive_at: "2035-09-09T02:00:00.000Z",
      return_at: "2035-09-09T04:00:00.000Z",
      status: "new",
      created_by: lecturer.user.id,
    });
  assert.ifError(requestError);

  const { error: initialItemError } = await lecturer.supabase
    .from("equipment_request_items")
    .insert({
      request_id: requestId,
      skill_name: "Kỹ năng cũ",
      catalog_item_id: catalogItem.id,
      quantity: 1,
    });
  assert.ifError(initialItemError);

  const { error: statusError } = await lecturer.supabase
    .from("equipment_requests")
    .update({ status: "completed" })
    .eq("id", requestId);
  assert.ok(statusError);
  assert.equal(statusError.code, "42501");

  const { data: updatedId, error: updateError } = await lecturer.supabase.rpc(
    "update_equipment_request_content",
    {
      target_request_id: requestId,
      target_class_schedule_id: secondScheduleId,
      target_semester: "HK2",
      target_responsible_lecturer_id: lecturer.user.id,
      target_receive_at: "2035-09-10T02:00:00.000Z",
      target_return_at: "2035-09-10T04:00:00.000Z",
      target_note: "Nội dung đã điều chỉnh",
      target_items: [
        {
          skill_name: "Kỹ năng mới",
          catalog_item_id: catalogItem.id,
          quantity: 2,
          note: "Ghi chú mới",
        },
      ],
    },
  );
  assert.ifError(updateError);
  assert.equal(updatedId, requestId);

  const { data: updatedRequest, error: readError } = await admin.supabase
    .from("equipment_requests")
    .select(
      "id,class_schedule_id,semester,status,note,equipment_request_items(skill_name,quantity,note)",
    )
    .eq("id", requestId)
    .single();
  assert.ifError(readError);
  assert.equal(updatedRequest.id, requestId);
  assert.equal(updatedRequest.class_schedule_id, secondScheduleId);
  assert.equal(updatedRequest.semester, "HK2");
  assert.equal(updatedRequest.status, "new");
  assert.equal(updatedRequest.note, "Nội dung đã điều chỉnh");
  assert.deepEqual(updatedRequest.equipment_request_items, [
    { skill_name: "Kỹ năng mới", quantity: 2, note: "Ghi chú mới" },
  ]);

  const { error: preparingError } = await admin.supabase
    .from("equipment_requests")
    .update({ status: "preparing" })
    .eq("id", requestId);
  assert.ifError(preparingError);

  const { error: lockedRpcError } = await lecturer.supabase.rpc(
    "update_equipment_request_content",
    {
      target_request_id: requestId,
      target_class_schedule_id: secondScheduleId,
      target_semester: "HK2",
      target_responsible_lecturer_id: lecturer.user.id,
      target_receive_at: "2035-09-10T02:00:00.000Z",
      target_return_at: "2035-09-10T04:00:00.000Z",
      target_note: "Không được cập nhật",
      target_items: [
        {
          skill_name: "Kỹ năng bị khóa",
          catalog_item_id: catalogItem.id,
          quantity: 1,
          note: "Không được lưu",
        },
      ],
    },
  );
  assert.ok(lockedRpcError);
  assert.equal(lockedRpcError.code, "42501");

  const { error: lockedItemError } = await lecturer.supabase
    .from("equipment_request_items")
    .insert({
      request_id: requestId,
      skill_name: "Kỹ năng bị khóa",
      catalog_item_id: catalogItem.id,
      quantity: 1,
    });
  assert.ok(lockedItemError);
  assert.equal(lockedItemError.code, "42501");

  for (const id of [firstScheduleId, secondScheduleId]) {
    const { error } = await admin.supabase
      .from("class_schedules")
      .delete()
      .eq("id", id);
    assert.ifError(error);
  }
});

test("mỗi dòng import hợp lệ tạo lịch và bản ghi kiểm tra trong một RPC", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const importer = await signIn("importer@campus.local", "LocalImporter123!");
  const batchId = crypto.randomUUID();
  const hash = crypto.randomUUID().replaceAll("-", "");

  const { error: batchError } = await importer.supabase
    .from("import_batches")
    .insert({
      id: batchId,
      source_type: "import",
      original_file_name: "atomic-test.csv",
      file_hash: hash,
      status: "importing",
      total_rows: 1,
      created_by: importer.user.id,
    });
  assert.ifError(batchError);

  const { data: scheduleId, error: rpcError } = await importer.supabase.rpc(
    "create_import_schedule_row",
    {
      target_batch_id: batchId,
      target_row_number: 1,
      target_hash: hash,
      target_raw: { course_code: "PHA 110" },
      target_normalized: { schedule_date: "2031-09-02" },
      target_status: "imported",
      target_errors: [],
      target_warnings: [],
      target_course_id: "10000000-0000-0000-0000-000000000003",
      target_course_code: "PHA 110",
      target_course_name: "Dược lý cơ bản",
      target_room_id: "20000000-0000-0000-0000-000000000003",
      target_lecturer_id: null,
      target_date: "2031-09-02",
      target_start: "12:30",
      target_end: "16:30",
      target_note: null,
      target_student_count: 20,
    },
  );
  assert.ifError(rpcError);
  assert.ok(scheduleId);

  const { data: importedRow, error: rowError } = await importer.supabase
    .from("import_rows")
    .select("class_schedule_id, validation_status")
    .eq("import_batch_id", batchId)
    .single();
  assert.ifError(rowError);
  assert.equal(importedRow.class_schedule_id, scheduleId);
  assert.equal(importedRow.validation_status, "imported");

  const { data: importedSchedule, error: scheduleError } = await admin.supabase
    .from("class_schedules")
    .select("schedule_status")
    .eq("id", scheduleId)
    .single();
  assert.ifError(scheduleError);
  assert.equal(importedSchedule.schedule_status, "published");

  const { error: finishError } = await importer.supabase
    .from("import_batches")
    .update({
      status: "completed",
      total_rows: 1,
      valid_rows: 1,
      imported_rows: 1,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  assert.ifError(finishError);

  const { data: summaries, error: summaryError } = await admin.supabase
    .from("email_notifications")
    .select("recipient_id, payload")
    .eq("notification_type", "class_schedule_import_summary");
  assert.ifError(summaryError);
  const batchSummaries = (summaries ?? []).filter(
    ({ payload }) => payload.batch_id === batchId,
  );
  const { data: recipientRoles } = await admin.supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["staff", "admin"]);
  assert.equal(
    batchSummaries.length,
    new Set((recipientRoles ?? []).map(({ user_id }) => user_id)).size,
  );
  assert.ok(
    batchSummaries.every(({ payload }) => payload.schedules.length === 1),
  );

  await admin.supabase.from("class_schedules").delete().eq("id", scheduleId);
  await admin.supabase.from("import_batches").delete().eq("id", batchId);
});

test("RLS giới hạn Y cơ sở, số sinh viên bắt buộc và đổi ngày chặn trùng phòng", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const roomId = crypto.randomUUID();
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const yScope = "40000000-0000-0000-0000-000000000002";

  assert.ifError(
    (
      await admin.supabase.from("rooms").insert({
        id: roomId,
        room_code: "YTEST",
        building_code: "YC",
        room_type_id: yScope,
      })
    ).error,
  );

  const common = {
    course_id: "10000000-0000-0000-0000-000000000001",
    course_code_snapshot: "NUR 101",
    course_name_snapshot: "Thăm khám thể chất",
    room_id: roomId,
    start_time: "07:30",
    end_time: "11:30",
    source: "manual",
    schedule_status: "published",
    created_by: admin.user.id,
    published_by: admin.user.id,
    published_at: new Date().toISOString(),
  };
  assert.ifError(
    (
      await admin.supabase.from("class_schedules").insert([
        {
          ...common,
          id: firstId,
          schedule_date: "2034-08-20",
          student_count: 25,
        },
        {
          ...common,
          id: secondId,
          schedule_date: "2034-08-21",
          student_count: 30,
        },
      ])
    ).error,
  );

  const { data: hidden } = await staff.supabase
    .from("class_schedules")
    .select("id")
    .in("id", [firstId, secondId]);
  assert.equal(hidden.length, 0);

  assert.ifError(
    (
      await admin.supabase.from("profile_room_types").insert({
        profile_id: staff.user.id,
        room_type_id: yScope,
        created_by: admin.user.id,
      })
    ).error,
  );
  const { data: visible } = await staff.supabase
    .from("class_schedules")
    .select("id, student_count")
    .in("id", [firstId, secondId]);
  assert.equal(visible.length, 2);
  assert.deepEqual(
    visible.map(({ student_count }) => student_count).sort((a, b) => a - b),
    [25, 30],
  );

  const conflict = await staff.supabase.rpc("reschedule_class", {
    target_schedule_id: firstId,
    target_schedule_date: "2034-08-21",
  });
  assert.ok(conflict.error);

  await admin.supabase
    .from("class_schedules")
    .delete()
    .in("id", [firstId, secondId]);
  await admin.supabase.from("rooms").delete().eq("id", roomId);
  await admin.supabase
    .from("profile_room_types")
    .delete()
    .eq("profile_id", staff.user.id)
    .eq("room_type_id", yScope);
});

test("Admin xóa được danh mục khi chỉ còn lịch hoặc ca đã hủy", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const roomId = crypto.randomUUID();
  const courseId = crypto.randomUUID();
  const courseRoomId = crypto.randomUUID();
  const activeScheduleId = crypto.randomUUID();
  const cancelledCourseScheduleId = crypto.randomUUID();
  const shiftTemplateId = crypto.randomUUID();
  const shiftId = crypto.randomUUID();
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const cancelledAt = new Date().toISOString();

  try {
    assert.ifError(
      (
        await admin.supabase.from("courses").insert({
          id: courseId,
          course_code: `DEL-${suffix}`,
          course_name: "Môn kiểm thử xóa danh mục",
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("rooms").insert([
          {
            id: roomId,
            room_code: `DEL-${suffix}`,
            building_code: "QA",
            room_type_id: "40000000-0000-0000-0000-000000000001",
          },
          {
            id: courseRoomId,
            room_code: `COURSE-${suffix}`,
            building_code: "QA",
            room_type_id: "40000000-0000-0000-0000-000000000001",
          },
        ])
      ).error,
    );

    const scheduleBase = {
      course_id: courseId,
      course_code_snapshot: `DEL-${suffix}`,
      course_name_snapshot: "Môn kiểm thử xóa danh mục",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      student_count: 10,
      created_by: admin.user.id,
    };
    assert.ifError(
      (
        await admin.supabase.from("class_schedules").insert([
          {
            ...scheduleBase,
            id: activeScheduleId,
            room_id: roomId,
            schedule_date: "2042-08-20",
            schedule_status: "published",
            published_by: admin.user.id,
            published_at: cancelledAt,
          },
          {
            ...scheduleBase,
            id: cancelledCourseScheduleId,
            room_id: courseRoomId,
            schedule_date: "2042-08-21",
            schedule_status: "published",
            published_by: admin.user.id,
            published_at: cancelledAt,
          },
        ])
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase
          .from("class_schedules")
          .update({
            schedule_status: "cancelled",
            cancelled_by: admin.user.id,
            cancelled_at: cancelledAt,
          })
          .eq("id", cancelledCourseScheduleId)
      ).error,
    );

    const blockedRoom = await admin.supabase.rpc("delete_catalog_room", {
      target_room_id: roomId,
    });
    assert.ok(blockedRoom.error);
    assert.match(blockedRoom.error.message, /CATALOG_HAS_ACTIVE_SCHEDULES/);

    assert.ifError(
      (
        await admin.supabase
          .from("class_schedules")
          .update({
            schedule_status: "cancelled",
            cancelled_by: admin.user.id,
            cancelled_at: cancelledAt,
          })
          .eq("id", activeScheduleId)
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.rpc("delete_catalog_room", {
          target_room_id: roomId,
        })
      ).error,
    );

    assert.ifError(
      (
        await admin.supabase.rpc("delete_catalog_course", {
          target_course_id: courseId,
        })
      ).error,
    );

    assert.ifError(
      (
        await admin.supabase.from("shift_templates").insert({
          id: shiftTemplateId,
          shift_code: `DEL-${suffix}`,
          shift_name: "Ca kiểm thử xóa danh mục",
          start_time: "07:30",
          end_time: "11:30",
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("staff_shifts").insert({
          id: shiftId,
          staff_id: admin.user.id,
          shift_date: "2042-08-22",
          start_time: "07:30",
          end_time: "11:30",
          shift_type: "MORNING",
          shift_template_id: shiftTemplateId,
          status: "scheduled",
          registration_source: "admin_assigned",
          created_by: admin.user.id,
        })
      ).error,
    );

    const blockedTemplate = await admin.supabase.rpc(
      "delete_catalog_shift_template",
      { target_shift_template_id: shiftTemplateId },
    );
    assert.ok(blockedTemplate.error);
    assert.match(blockedTemplate.error.message, /CATALOG_HAS_ACTIVE_SHIFTS/);

    assert.ifError(
      (
        await admin.supabase
          .from("staff_shifts")
          .update({
            status: "cancelled",
            cancelled_by: admin.user.id,
            cancelled_at: cancelledAt,
          })
          .eq("id", shiftId)
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.rpc("delete_catalog_shift_template", {
          target_shift_template_id: shiftTemplateId,
        })
      ).error,
    );

    for (const [table, id] of [
      ["rooms", roomId],
      ["courses", courseId],
      ["shift_templates", shiftTemplateId],
    ]) {
      const { data, error } = await admin.supabase
        .from(table)
        .select("id")
        .eq("id", id)
        .maybeSingle();
      assert.ifError(error);
      assert.equal(data, null);
    }
  } finally {
    await admin.supabase.from("staff_shifts").delete().eq("id", shiftId);
    await admin.supabase
      .from("shift_templates")
      .delete()
      .eq("id", shiftTemplateId);
    await admin.supabase
      .from("class_schedules")
      .delete()
      .in("id", [activeScheduleId, cancelledCourseScheduleId]);
    await admin.supabase.from("courses").delete().eq("id", courseId);
    await admin.supabase
      .from("rooms")
      .delete()
      .in("id", [roomId, courseRoomId]);
  }
});

test("Admin và Staff xóa phiếu, người dùng thường không thể xóa", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const equipmentScheduleId = crypto.randomUUID();
  const equipmentRequestId = crypto.randomUUID();
  const equipmentItemId = crypto.randomUUID();
  const registrationId = crypto.randomUUID();
  const basicScheduleId = crypto.randomUUID();
  const basicSessionId = crypto.randomUUID();

  try {
    assert.ifError(
      (
        await admin.supabase.from("class_schedules").insert({
          id: equipmentScheduleId,
          course_id: "10000000-0000-0000-0000-000000000001",
          course_code_snapshot: "NUR 101",
          course_name_snapshot: "Thăm khám thể chất",
          room_id: "20000000-0000-0000-0000-000000000001",
          schedule_date: "2043-08-20",
          start_time: "07:30",
          end_time: "11:30",
          source: "manual",
          schedule_status: "published",
          student_count: 20,
          created_by: admin.user.id,
          published_by: admin.user.id,
          published_at: new Date().toISOString(),
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("equipment_requests").insert({
          id: equipmentRequestId,
          class_schedule_id: equipmentScheduleId,
          semester: "HK1",
          registrant_id: admin.user.id,
          responsible_lecturer_id: lecturer.user.id,
          phone_snapshot: "0901000001",
          email_snapshot: "admin@campus.local",
          receive_at: "2043-08-20T02:00:00.000Z",
          return_at: "2043-08-20T04:00:00.000Z",
          status: "new",
          created_by: admin.user.id,
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("equipment_request_items").insert({
          id: equipmentItemId,
          request_id: equipmentRequestId,
          skill_name: "Kiểm thử xóa phiếu",
          catalog_item_id: "60000000-0000-0000-0000-000000000001",
          quantity: 1,
        })
      ).error,
    );

    const lecturerDelete = await lecturer.supabase
      .from("equipment_requests")
      .delete()
      .eq("id", equipmentRequestId)
      .select("id");
    assert.ifError(lecturerDelete.error);
    assert.equal(lecturerDelete.data.length, 0);

    const staffDelete = await staff.supabase
      .from("equipment_requests")
      .delete()
      .eq("id", equipmentRequestId)
      .select("id")
      .single();
    assert.ifError(staffDelete.error);
    assert.equal(staffDelete.data.id, equipmentRequestId);

    const { data: deletedItems, error: deletedItemsError } =
      await admin.supabase
        .from("equipment_request_items")
        .select("id")
        .eq("id", equipmentItemId);
    assert.ifError(deletedItemsError);
    assert.equal(deletedItems.length, 0);
    const { data: keptSchedule, error: keptScheduleError } =
      await admin.supabase
        .from("class_schedules")
        .select("id")
        .eq("id", equipmentScheduleId)
        .single();
    assert.ifError(keptScheduleError);
    assert.equal(keptSchedule.id, equipmentScheduleId);

    assert.ifError(
      (
        await admin.supabase.from("basic_medical_registrations").insert({
          id: registrationId,
          academic_year: "2043-2044",
          semester: "HK1",
          start_date: "2043-08-21",
          end_date: "2043-08-21",
          course_id: "10000000-0000-0000-0000-000000000001",
          room_id: "20000000-0000-0000-0000-000000000006",
          student_count: 20,
          registrant_id: admin.user.id,
          responsible_lecturer_id: lecturer.user.id,
          created_by: admin.user.id,
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("class_schedules").insert({
          id: basicScheduleId,
          course_id: "10000000-0000-0000-0000-000000000001",
          course_code_snapshot: "NUR 101",
          course_name_snapshot: "Thăm khám thể chất",
          room_id: "20000000-0000-0000-0000-000000000006",
          lecturer_id: lecturer.user.id,
          schedule_date: "2043-08-21",
          start_time: "07:30",
          end_time: "11:30",
          source: "manual",
          schedule_status: "published",
          student_count: 20,
          basic_medical_registration_id: registrationId,
          created_by: admin.user.id,
          published_by: admin.user.id,
          published_at: new Date().toISOString(),
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase
          .from("basic_medical_registration_sessions")
          .insert({
            id: basicSessionId,
            registration_id: registrationId,
            class_schedule_id: basicScheduleId,
            lesson_title: "Kiểm thử xóa phiếu Y cơ sở",
            teaching_lecturer_id: lecturer.user.id,
            session_number: 1,
          })
      ).error,
    );

    const adminDelete = await admin.supabase
      .from("basic_medical_registrations")
      .delete()
      .eq("id", registrationId)
      .select("id")
      .single();
    assert.ifError(adminDelete.error);
    assert.equal(adminDelete.data.id, registrationId);

    for (const [table, id] of [
      ["class_schedules", basicScheduleId],
      ["basic_medical_registration_sessions", basicSessionId],
    ]) {
      const { data: deletedRows, error } = await admin.supabase
        .from(table)
        .select("id")
        .eq("id", id);
      assert.ifError(error);
      assert.equal(deletedRows.length, 0);
    }
  } finally {
    await admin.supabase
      .from("equipment_request_items")
      .delete()
      .eq("id", equipmentItemId);
    await admin.supabase
      .from("equipment_requests")
      .delete()
      .eq("id", equipmentRequestId);
    await admin.supabase
      .from("basic_medical_registrations")
      .delete()
      .eq("id", registrationId);
    await admin.supabase
      .from("class_schedules")
      .delete()
      .in("id", [equipmentScheduleId, basicScheduleId]);
  }
});

test("Phiếu thiết bị chỉ cho ký giao sau khi kho xác nhận và GV phụ trách có thể ký", async () => {
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");
  const roomId = crypto.randomUUID();
  const scheduleId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const invalidRequestId = crypto.randomUUID();
  const catalogItemId = crypto.randomUUID();
  const signature =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

  try {
    assert.ifError(
      (
        await admin.supabase.from("rooms").insert({
          id: roomId,
          room_code: `WF-${crypto.randomUUID().slice(0, 8)}`,
          building_code: "QA",
          room_type_id: "40000000-0000-0000-0000-000000000001",
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("class_schedules").insert({
          id: scheduleId,
          course_id: null,
          course_code_snapshot: "WF 101",
          course_name_snapshot: "Kiểm thử luồng phiếu thiết bị",
          room_id: roomId,
          schedule_date: "2045-08-20",
          start_time: "07:30",
          end_time: "11:30",
          source: "manual",
          schedule_status: "published",
          student_count: 20,
          created_by: admin.user.id,
          published_by: admin.user.id,
          published_at: new Date().toISOString(),
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("equipment_catalog").insert({
          id: catalogItemId,
          item_name: `Thiết bị workflow ${catalogItemId.slice(0, 8)}`,
          commercial_name: "Workflow QA",
          unit: "Cái",
        })
      ).error,
    );
    assert.ifError(
      (
        await admin.supabase.from("equipment_requests").insert({
          id: requestId,
          class_schedule_id: scheduleId,
          semester: "HK1",
          registrant_id: admin.user.id,
          responsible_lecturer_id: lecturer.user.id,
          phone_snapshot: "0901000001",
          email_snapshot: "admin@campus.local",
          receive_at: "2045-08-19T02:00:00.000Z",
          return_at: "2045-08-20T09:00:00.000Z",
          status: "new",
          created_by: admin.user.id,
        })
      ).error,
    );

    const invalidTiming = await admin.supabase
      .from("equipment_requests")
      .insert({
        id: invalidRequestId,
        class_schedule_id: scheduleId,
        semester: "HK1",
        registrant_id: admin.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901000001",
        email_snapshot: "admin@campus.local",
        receive_at: "2045-08-18T02:00:00.000Z",
        return_at: "2045-08-19T09:00:00.000Z",
        status: "new",
        created_by: admin.user.id,
      });
    assert.ok(invalidTiming.error);
    assert.match(invalidTiming.error.message, /Ngày trả.*ngày học/i);

    const lecturerTooEarly = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "handover",
        target_signature: signature,
      },
    );
    assert.ok(lecturerTooEarly.error);
    assert.match(lecturerTooEarly.error.message, /Kho.*Đã giao/i);

    const staffTooEarly = await staff.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "handed_over" },
    );
    assert.ok(staffTooEarly.error);
    assert.match(staffTooEarly.error.message, /Đã soạn/i);

    const adminEarly = await admin.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "handed_over" },
    );
    assert.ifError(adminEarly.error);
    assert.equal(adminEarly.data.status, "new");
    assert.ok(adminEarly.data.handover_staff_confirmed_at);

    const responsibleEarlySign = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "handover",
        target_signature: signature,
      },
    );
    assert.ifError(responsibleEarlySign.error);
    assert.equal(responsibleEarlySign.data.status, "handed_over");

    assert.ifError(
      (
        await admin.supabase.rpc("manager_confirm_equipment_status", {
          target_request_id: requestId,
          target_status: "new",
        })
      ).error,
    );
    assert.ifError(
      (
        await staff.supabase.rpc("manager_confirm_equipment_status", {
          target_request_id: requestId,
          target_status: "preparing",
        })
      ).error,
    );

    const editWhilePreparing = await admin.supabase.rpc(
      "update_equipment_request_content",
      {
        target_request_id: requestId,
        target_class_schedule_id: scheduleId,
        target_semester: "HK2",
        target_responsible_lecturer_id: lecturer.user.id,
        target_receive_at: "2045-08-19T02:00:00.000Z",
        target_return_at: "2045-08-20T09:00:00.000Z",
        target_note: "Điều chỉnh khi Đã soạn",
        target_items: [
          {
            skill_name: "Kỹ năng workflow",
            catalog_item_id: catalogItemId,
            quantity: 1,
            note: null,
          },
        ],
      },
    );
    assert.ifError(editWhilePreparing.error);
    assert.equal(editWhilePreparing.data, requestId);

    const managerAddsWhilePreparing = await staff.supabase
      .from("equipment_request_items")
      .insert({
        request_id: requestId,
        skill_name: "Kỹ năng workflow",
        catalog_item_id: catalogItemId,
        quantity: 2,
        note: "Bổ sung trước khi giao",
      });
    assert.ifError(managerAddsWhilePreparing.error);

    const responsibleSignsBeforeWarehouse = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "handover",
        target_signature: signature,
      },
    );
    assert.ok(responsibleSignsBeforeWarehouse.error);
    assert.match(
      responsibleSignsBeforeWarehouse.error.message,
      /Kho.*Đã giao/i,
    );

    const staffConfirmsHandover = await staff.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "handed_over" },
    );
    assert.ifError(staffConfirmsHandover.error);
    assert.equal(staffConfirmsHandover.data.status, "preparing");
    assert.ok(staffConfirmsHandover.data.handover_staff_confirmed_at);

    const responsibleSignsHandover = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "handover",
        target_signature: signature,
      },
    );
    assert.ifError(responsibleSignsHandover.error);
    assert.equal(responsibleSignsHandover.data.status, "handed_over");

    const managerAddsAfterHandover = await staff.supabase
      .from("equipment_request_items")
      .insert({
        request_id: requestId,
        skill_name: "Kỹ năng workflow",
        catalog_item_id: catalogItemId,
        quantity: 1,
      });
    assert.ok(managerAddsAfterHandover.error);

    const responsibleSignsReturn = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "return",
        target_signature: signature,
      },
    );
    assert.ifError(responsibleSignsReturn.error);
    assert.equal(responsibleSignsReturn.data.status, "handed_over");

    const staffConfirmsReturn = await staff.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "returned" },
    );
    assert.ifError(staffConfirmsReturn.error);
    assert.equal(staffConfirmsReturn.data.status, "completed");

    const adminRollsBackToHandover = await admin.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "handed_over" },
    );
    assert.ifError(adminRollsBackToHandover.error);
    assert.equal(adminRollsBackToHandover.data.status, "handed_over");
    assert.ok(adminRollsBackToHandover.data.handover_recipient_signed_at);
    assert.equal(adminRollsBackToHandover.data.return_staff_confirmed_at, null);
    assert.equal(
      adminRollsBackToHandover.data.return_recipient_signed_at,
      null,
    );

    const staffConfirmsReturnFirst = await staff.supabase.rpc(
      "manager_confirm_equipment_status",
      { target_request_id: requestId, target_status: "returned" },
    );
    assert.ifError(staffConfirmsReturnFirst.error);
    assert.equal(staffConfirmsReturnFirst.data.status, "handed_over");
    assert.ok(staffConfirmsReturnFirst.data.return_staff_confirmed_at);
    assert.equal(
      staffConfirmsReturnFirst.data.return_recipient_signed_at,
      null,
    );

    const responsibleSignsReturnLast = await lecturer.supabase.rpc(
      "registrant_confirm_equipment_handoff",
      {
        target_request_id: requestId,
        target_phase: "return",
        target_signature: signature,
      },
    );
    assert.ifError(responsibleSignsReturnLast.error);
    assert.equal(responsibleSignsReturnLast.data.status, "completed");
  } finally {
    await admin.supabase
      .from("equipment_requests")
      .delete()
      .in("id", [requestId, invalidRequestId]);
    await admin.supabase.from("class_schedules").delete().eq("id", scheduleId);
    await admin.supabase.from("rooms").delete().eq("id", roomId);
    await admin.supabase
      .from("equipment_catalog")
      .delete()
      .eq("id", catalogItemId);
  }
});
