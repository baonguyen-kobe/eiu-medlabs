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

function anonClient() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

function serviceClient() {
  return createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

async function signIn(email, password) {
  const supabase = anonClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(`SIGN_IN_FAILED: ${email} -> ${error?.message}`);
  }
  return { supabase, user: data.user };
}

test("Staff Shift V2 — list_operational_shift_assignees directory", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const { data, error } = await staff.supabase.rpc(
    "list_operational_shift_assignees",
  );
  assert.ifError(error);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  // Root admin should NOT be in assignees
  const rootAdmin = await serviceClient()
    .from("profiles")
    .select("id")
    .eq("email", "root@campus.local")
    .maybeSingle();
  if (rootAdmin.data) {
    assert.equal(
      data.some((p) => p.id === rootAdmin.data.id),
      false,
    );
  }
});

test("Staff Shift V2 — Self registration, duplicate conflict, and soft cancellation", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const targetDate = "2035-05-15";

  // Register Morning shift
  const registerRes = await staff.supabase.rpc("register_staff_shifts", {
    shifts_payload: [
      {
        staff_id: staff.user.id,
        shift_date: targetDate,
        shift_slot: "MORNING",
        start_time: "07:00",
        end_time: "11:00",
        note: "Unit test morning shift",
      },
    ],
  });
  assert.ifError(registerRes.error);
  assert.equal(registerRes.data.length, 1);
  const createdShift = registerRes.data[0];
  assert.equal(createdShift.shift_slot, "MORNING");
  assert.equal(createdShift.status, "scheduled");

  try {
    // Duplicate active morning shift should fail
    const duplicateRes = await staff.supabase.rpc("register_staff_shifts", {
      shifts_payload: [
        {
          staff_id: staff.user.id,
          shift_date: targetDate,
          shift_slot: "MORNING",
          start_time: "08:00",
          end_time: "10:30",
        },
      ],
    });
    assert.ok(duplicateRes.error);
    assert.match(duplicateRes.error.message, /ACTIVE_SHIFT_EXISTS/);

    // Afternoon shift on same date should succeed
    const afternoonRes = await staff.supabase.rpc("register_staff_shifts", {
      shifts_payload: [
        {
          staff_id: staff.user.id,
          shift_date: targetDate,
          shift_slot: "AFTERNOON",
          start_time: "13:00",
          end_time: "16:00",
        },
      ],
    });
    assert.ifError(afternoonRes.error);
    assert.equal(afternoonRes.data.length, 1);

    // Cancel afternoon shift
    const cancelAfternoon = await staff.supabase.rpc("cancel_staff_shift", {
      target_shift_id: afternoonRes.data[0].id,
      reason: "Cleanup afternoon",
    });
    assert.ifError(cancelAfternoon.error);
    assert.equal(cancelAfternoon.data.status, "cancelled");
  } finally {
    // Cancel morning shift
    await staff.supabase.rpc("cancel_staff_shift", {
      target_shift_id: createdShift.id,
      reason: "Cleanup morning",
    });
  }
});

test("Staff Shift V2 — All Day atomic registration and time boundary enforcement", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const targetDate = "2035-05-16";
  const groupId = crypto.randomUUID();

  // Invalid morning time (< 07:00)
  const invalidTimeRes = await staff.supabase.rpc("register_staff_shifts", {
    shifts_payload: [
      {
        staff_id: staff.user.id,
        shift_date: targetDate,
        shift_slot: "MORNING",
        start_time: "06:30",
        end_time: "11:00",
      },
    ],
  });
  assert.ok(invalidTimeRes.error);
  assert.match(invalidTimeRes.error.message, /INVALID_MORNING_TIME/);

  // All Day atomic creation (Morning + Afternoon)
  const allDayRes = await staff.supabase.rpc("register_staff_shifts", {
    shifts_payload: [
      {
        staff_id: staff.user.id,
        shift_date: targetDate,
        shift_slot: "MORNING",
        start_time: "07:00",
        end_time: "11:00",
        creation_group_id: groupId,
      },
      {
        staff_id: staff.user.id,
        shift_date: targetDate,
        shift_slot: "AFTERNOON",
        start_time: "13:00",
        end_time: "16:00",
        creation_group_id: groupId,
      },
    ],
  });
  assert.ifError(allDayRes.error);
  assert.equal(allDayRes.data.length, 2);

  const [mShift, aShift] = allDayRes.data;
  assert.equal(mShift.shift_slot, "MORNING");
  assert.equal(aShift.shift_slot, "AFTERNOON");
  assert.equal(mShift.creation_group_id, groupId);
  assert.equal(aShift.creation_group_id, groupId);

  // Update time of morning shift
  const updateRes = await staff.supabase.rpc("update_staff_shift_time", {
    target_shift_id: mShift.id,
    target_start_time: "07:30",
    target_end_time: "10:30",
    target_note: "Updated note",
  });
  assert.ifError(updateRes.error);
  assert.equal(updateRes.data.start_time, "07:30:00");
  assert.equal(updateRes.data.end_time, "10:30:00");

  // Cleanup
  await staff.supabase.rpc("cancel_staff_shift", {
    target_shift_id: mShift.id,
  });
  await staff.supabase.rpc("cancel_staff_shift", {
    target_shift_id: aShift.id,
  });
});

test("Staff Shift V2 — Historical date mutation requires capability & mandatory reason", async () => {
  const staff = await signIn("staff@campus.local", "LocalStaff123!");
  const pastDate = "2020-01-15";

  // Normal staff without capability fails on historical date
  const pastRes = await staff.supabase.rpc("register_staff_shifts", {
    shifts_payload: [
      {
        staff_id: staff.user.id,
        shift_date: pastDate,
        shift_slot: "MORNING",
        start_time: "07:00",
        end_time: "11:00",
      },
    ],
    adjustment_reason: "Trying to register in past",
  });
  assert.ok(pastRes.error);
  assert.match(pastRes.error.message, /HISTORICAL_MUTATION_FORBIDDEN/);
});
