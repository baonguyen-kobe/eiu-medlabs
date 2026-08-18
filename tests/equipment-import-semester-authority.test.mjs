import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.ok(data.session);
  return { client, user: data.user, session: data.session };
}

const ROOM_ID = "20000000-0000-0000-0000-000000000001";
const COURSE_ID = "10000000-0000-0000-0000-000000000001";

test("Application Layer: Equipment Import files and actions enforce schedule semester authority", () => {
  const valuesSource = readFileSync(
    new URL("../lib/equipment-import-values.ts", import.meta.url),
    "utf8",
  );
  const actionsSource = readFileSync(
    new URL("../app/equipment/import/actions.ts", import.meta.url),
    "utf8",
  );
  const schemaSource = readFileSync(
    new URL(
      "../supabase/schemas/03_registration_workflows.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const migrationSource = readFileSync(
    new URL(
      "../supabase/migrations/20260818160000_secure_equipment_import_semester_authority.sql",
      import.meta.url,
    ),
    "utf8",
  );

  // 1. Format check no longer requires semester strictly as mandatory header
  assert.doesNotMatch(
    valuesSource,
    /\["semester",\s*"học kỳ"\]/,
    "semester should not be in requiredText since linked schedule is authoritative",
  );

  // 2. Format check validates semester format if provided
  assert.match(
    valuesSource,
    /row\.semester\s*&&\s*!\["HK1",\s*"HK2",\s*"HK3",\s*"HK4"\]\.includes/,
    "semester should be validated when present in file",
  );

  // 3. actions.ts queries semester from class_schedules
  assert.match(
    actionsSource,
    /\.select\([\s\S]*schedule_status,semester,rooms!inner/,
    "scheduleQuery must select semester column",
  );

  // 4. actions.ts validates schedule.semester and adds warning when file semester differs
  assert.match(
    actionsSource,
    /chưa có thông tin Học kỳ hợp lệ trong lịch/,
    "actions.ts must check schedule.semester validity",
  );
  assert.match(
    actionsSource,
    /hệ thống sử dụng học kỳ của lịch học/,
    "actions.ts must warn if file semester differs from schedule semester",
  );

  // 5. actions.ts payload derives semester from schedule.semester
  assert.match(
    actionsSource,
    /semester:\s*schedule\.semester/,
    "payload must derive semester from schedule.semester",
  );

  // 6. DB function import_equipment_requests derives semester from class_schedules
  for (const src of [schemaSource, migrationSource]) {
    assert.match(
      src,
      /select schedules\.semester into target_sched_semester/,
      "import_equipment_requests must select semester from class_schedules",
    );
    assert.match(
      src,
      /if target_sched_semester is null or target_sched_semester not in \('HK1','HK2','HK3','HK4'\)/,
      "import_equipment_requests must fail closed if schedule semester is null or invalid",
    );
    assert.match(
      src,
      /derived_semester := target_sched_semester;/,
      "import_equipment_requests must set derived_semester from schedule",
    );
  }
});

test("Equipment Import DB RPC: Case I1 — Schedule HK2, caller payload HK4 -> stored HK2", async () => {
  const service = serviceClient();
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const scheduleId = crypto.randomUUID();
  const catalogId = crypto.randomUUID();
  const sourceCode = `I1_${Date.now().toString().slice(-8)}`;

  try {
    // 1. Insert schedule with HK2
    const { error: schedErr } = await service.from("class_schedules").insert({
      id: scheduleId,
      course_id: COURSE_ID,
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: ROOM_ID,
      schedule_date: "2057-01-01",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      semester: "HK2",
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
    assert.ifError(schedErr);

    // 2. Insert catalog item
    const { error: catErr } = await service.from("equipment_catalog").insert({
      id: catalogId,
      item_name: `Thiết bị Test I1 ${sourceCode}`,
      commercial_name: `Thương mại I1 ${sourceCode}`,
      unit: "cái",
      is_active: true,
    });
    assert.ifError(catErr);

    // 3. Import request with payload semester HK4
    const targetRequests = [
      {
        source_code: sourceCode,
        class_schedule_id: scheduleId,
        semester: "HK4", // Caller sends HK4, but schedule has HK2
        registrant_id: admin.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234567",
        email_snapshot: "admin@campus.local",
        receive_at: "2057-01-01T07:00:00+07:00",
        return_at: "2057-01-01T11:30:00+07:00",
        status: "new",
        note: "Import test I1",
        created_at: new Date().toISOString(),
        items: [
          {
            skill_name: "Kỹ năng I1",
            catalog_item_id: catalogId,
            quantity: 2,
            note: null,
          },
        ],
      },
    ];

    const { data, error } = await admin.client.rpc(
      "import_equipment_requests",
      {
        target_requests: targetRequests,
      },
    );
    assert.ifError(error);
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 1);
    assert.equal(data[0].ok, true, `Import failed: ${data[0].message}`);
    const requestId = data[0].request_id;
    assert.ok(requestId);

    // 4. Verify DB stores HK2 (derived from schedule, NOT HK4 from payload)
    const { data: stored, error: fetchErr } = await service
      .from("equipment_requests")
      .select("id, semester, class_schedule_id")
      .eq("id", requestId)
      .single();
    assert.ifError(fetchErr);
    assert.equal(stored.semester, "HK2");
  } finally {
    await service
      .from("equipment_request_items")
      .delete()
      .eq("skill_name", "Kỹ năng I1");
    await service
      .from("equipment_requests")
      .delete()
      .eq("class_schedule_id", scheduleId);
    await service.from("equipment_catalog").delete().eq("id", catalogId);
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("Equipment Import DB RPC: Case I2 — Schedule HK2, caller payload semester omitted/null -> stored HK2", async () => {
  const service = serviceClient();
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const scheduleId = crypto.randomUUID();
  const catalogId = crypto.randomUUID();
  const sourceCode = `I2_${Date.now().toString().slice(-8)}`;

  try {
    const { error: schedErr } = await service.from("class_schedules").insert({
      id: scheduleId,
      course_id: COURSE_ID,
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: ROOM_ID,
      schedule_date: "2057-01-02",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      semester: "HK2",
      created_by: staff.user.id,
      published_by: staff.user.id,
      published_at: new Date().toISOString(),
    });
    assert.ifError(schedErr);

    const { error: catErr } = await service.from("equipment_catalog").insert({
      id: catalogId,
      item_name: `Thiết bị Test I2 ${sourceCode}`,
      commercial_name: `Thương mại I2 ${sourceCode}`,
      unit: "cái",
      is_active: true,
    });
    assert.ifError(catErr);

    // Payload has semester: null (omitted authority)
    const targetRequests = [
      {
        source_code: sourceCode,
        class_schedule_id: scheduleId,
        semester: null,
        registrant_id: staff.user.id,
        responsible_lecturer_id: lecturer.user.id,
        phone_snapshot: "0901234567",
        email_snapshot: "staff@campus.local",
        receive_at: "2057-01-02T07:00:00+07:00",
        return_at: "2057-01-02T11:30:00+07:00",
        status: "new",
        note: "Import test I2",
        created_at: new Date().toISOString(),
        items: [
          {
            skill_name: "Kỹ năng I2",
            catalog_item_id: catalogId,
            quantity: 1,
            note: null,
          },
        ],
      },
    ];

    const { data, error } = await staff.client.rpc(
      "import_equipment_requests",
      {
        target_requests: targetRequests,
      },
    );
    assert.ifError(error);
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 1);
    assert.equal(data[0].ok, true, `Import failed: ${data[0].message}`);
    const requestId = data[0].request_id;
    assert.ok(requestId);

    const { data: stored, error: fetchErr } = await service
      .from("equipment_requests")
      .select("id, semester")
      .eq("id", requestId)
      .single();
    assert.ifError(fetchErr);
    assert.equal(stored.semester, "HK2");
  } finally {
    await service
      .from("equipment_request_items")
      .delete()
      .eq("skill_name", "Kỹ năng I2");
    await service
      .from("equipment_requests")
      .delete()
      .eq("class_schedule_id", scheduleId);
    await service.from("equipment_catalog").delete().eq("id", catalogId);
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("Equipment Import DB RPC: Case I3 & I4 — Schedule semester NULL -> FAIL CLOSED (no fallback)", async () => {
  const service = serviceClient();
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const scheduleId = crypto.randomUUID();
  const catalogId = crypto.randomUUID();
  const sourceCode3 = `I3_${Date.now().toString().slice(-8)}`;
  const sourceCode4 = `I4_${Date.now().toString().slice(-8)}`;

  try {
    // Schedule with semester NULL
    const { error: schedErr } = await service.from("class_schedules").insert({
      id: scheduleId,
      course_id: COURSE_ID,
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: ROOM_ID,
      schedule_date: "2057-01-03",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      semester: null,
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
    assert.ifError(schedErr);

    const { error: catErr } = await service.from("equipment_catalog").insert({
      id: catalogId,
      item_name: `Thiết bị Test I3_I4 ${sourceCode3}`,
      commercial_name: `Thương mại I3_I4 ${sourceCode3}`,
      unit: "cái",
      is_active: true,
    });
    assert.ifError(catErr);

    // Case I3: caller payload sends HK4, but schedule has NULL semester -> FAIL CLOSED
    const { data: data3, error: err3 } = await admin.client.rpc(
      "import_equipment_requests",
      {
        target_requests: [
          {
            source_code: sourceCode3,
            class_schedule_id: scheduleId,
            semester: "HK4",
            registrant_id: admin.user.id,
            responsible_lecturer_id: lecturer.user.id,
            phone_snapshot: "0901234567",
            email_snapshot: "admin@campus.local",
            receive_at: "2057-01-03T07:00:00+07:00",
            return_at: "2057-01-03T11:30:00+07:00",
            status: "new",
            created_at: new Date().toISOString(),
            items: [
              {
                skill_name: "Kỹ năng I3",
                catalog_item_id: catalogId,
                quantity: 1,
              },
            ],
          },
        ],
      },
    );
    assert.ifError(err3);
    assert.equal(data3[0].ok, false);
    assert.match(data3[0].message, /chưa có thông tin Học kỳ hợp lệ/);

    // Case I4: caller payload has null semester and schedule has NULL semester -> FAIL CLOSED
    const { data: data4, error: err4 } = await admin.client.rpc(
      "import_equipment_requests",
      {
        target_requests: [
          {
            source_code: sourceCode4,
            class_schedule_id: scheduleId,
            semester: null,
            registrant_id: admin.user.id,
            responsible_lecturer_id: lecturer.user.id,
            phone_snapshot: "0901234567",
            email_snapshot: "admin@campus.local",
            receive_at: "2057-01-03T07:00:00+07:00",
            return_at: "2057-01-03T11:30:00+07:00",
            status: "new",
            created_at: new Date().toISOString(),
            items: [
              {
                skill_name: "Kỹ năng I4",
                catalog_item_id: catalogId,
                quantity: 1,
              },
            ],
          },
        ],
      },
    );
    assert.ifError(err4);
    assert.equal(data4[0].ok, false);
    assert.match(data4[0].message, /chưa có thông tin Học kỳ hợp lệ/);

    // Ensure no request was inserted
    const { data: reqs } = await service
      .from("equipment_requests")
      .select("id")
      .eq("class_schedule_id", scheduleId);
    assert.equal((reqs ?? []).length, 0);
  } finally {
    await service.from("equipment_catalog").delete().eq("id", catalogId);
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("Equipment Import DB RPC: Case I5 — Schedule HK4, caller payload HK1 -> stored HK4", async () => {
  const service = serviceClient();
  const admin = await signIn("admin@campus.local", "LocalAdmin123!");
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const scheduleId = crypto.randomUUID();
  const catalogId = crypto.randomUUID();
  const sourceCode = `I5_${Date.now().toString().slice(-8)}`;

  try {
    const { error: schedErr } = await service.from("class_schedules").insert({
      id: scheduleId,
      course_id: COURSE_ID,
      course_code_snapshot: "NUR 101",
      course_name_snapshot: "Thăm khám thể chất",
      room_id: ROOM_ID,
      schedule_date: "2057-01-04",
      start_time: "07:30",
      end_time: "11:30",
      source: "manual",
      schedule_status: "published",
      student_count: 20,
      semester: "HK4",
      created_by: admin.user.id,
      published_by: admin.user.id,
      published_at: new Date().toISOString(),
    });
    assert.ifError(schedErr);

    const { error: catErr } = await service.from("equipment_catalog").insert({
      id: catalogId,
      item_name: `Thiết bị Test I5 ${sourceCode}`,
      commercial_name: `Thương mại I5 ${sourceCode}`,
      unit: "cái",
      is_active: true,
    });
    assert.ifError(catErr);

    // Caller passes HK1 -> Schedule has HK4
    const { data, error } = await admin.client.rpc(
      "import_equipment_requests",
      {
        target_requests: [
          {
            source_code: sourceCode,
            class_schedule_id: scheduleId,
            semester: "HK1",
            registrant_id: admin.user.id,
            responsible_lecturer_id: lecturer.user.id,
            phone_snapshot: "0901234567",
            email_snapshot: "admin@campus.local",
            receive_at: "2057-01-04T07:00:00+07:00",
            return_at: "2057-01-04T11:30:00+07:00",
            status: "new",
            note: "Import test I5",
            created_at: new Date().toISOString(),
            items: [
              {
                skill_name: "Kỹ năng I5",
                catalog_item_id: catalogId,
                quantity: 5,
              },
            ],
          },
        ],
      },
    );
    assert.ifError(error);
    assert.equal(data[0].ok, true, `Import failed: ${data[0].message}`);

    const { data: stored, error: fetchErr } = await service
      .from("equipment_requests")
      .select("id, semester")
      .eq("id", data[0].request_id)
      .single();
    assert.ifError(fetchErr);
    assert.equal(stored.semester, "HK4");
  } finally {
    await service
      .from("equipment_request_items")
      .delete()
      .eq("skill_name", "Kỹ năng I5");
    await service
      .from("equipment_requests")
      .delete()
      .eq("class_schedule_id", scheduleId);
    await service.from("equipment_catalog").delete().eq("id", catalogId);
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
});

test("Equipment Import DB RPC: Permissions — Lecturer/unauthorized cannot execute import_equipment_requests", async () => {
  const lecturer = await signIn("giangvien@campus.local", "LocalLecturer123!");

  const { error } = await lecturer.client.rpc("import_equipment_requests", {
    target_requests: [],
  });
  assert.ok(error);
  assert.equal(error.code, "42501");
});
