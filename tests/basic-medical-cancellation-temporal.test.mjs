import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Basic Medical cancellation uses the strict local start-time boundary", () => {
  const schema = read(
    "supabase/schemas/12_basic_medical_cancellation_time_boundary.sql",
  );
  const migration = read(
    "supabase/migrations/20260812000000_fix_basic_medical_cancellation_time_boundary.sql",
  );

  for (const definition of [schema, migration]) {
    assert.match(
      definition,
      /business_now := clock_timestamp\(\) at time zone 'Asia\/Ho_Chi_Minh';/,
    );
    assert.match(
      definition,
      /private\.is_basic_medical_schedule_start_after\(\s*schedules\.schedule_date,\s*schedules\.start_time,\s*business_now\s*\)/,
    );
    assert.match(
      definition,
      /create or replace function private\.is_basic_medical_schedule_start_after\(/,
    );
    assert.match(
      definition,
      /select \(target_schedule_date \+ target_start_time\) > target_business_now;/,
    );
    assert.match(definition, /with cancelled_schedules as \(/);
    assert.match(definition, /returning schedules\.id/);
    assert.match(
      definition,
      /sessions\.class_schedule_id = any\(cancelled_schedule_ids\)/,
    );
    assert.match(definition, /security definer/);
    assert.match(definition, /set search_path = ''/);
    assert.match(definition, /private\.can_manage_basic_medical\(\)/);
    assert.match(
      definition,
      /revoke all on function public\.cancel_basic_medical_registration\(uuid, text\) from public, anon;/,
    );
    assert.match(
      definition,
      /grant execute on function public\.cancel_basic_medical_registration\(uuid, text\) to authenticated;/,
    );
    assert.match(
      definition,
      /revoke all on function private\.is_basic_medical_schedule_start_after\(\s*date, time, timestamp without time zone\s*\) from public, anon, authenticated;/,
    );

    const cancellationStart = definition.indexOf(
      "create or replace function public.cancel_basic_medical_registration(",
    );
    const cancellationEnd = definition.indexOf(
      "revoke all on function public.cancel_basic_medical_registration",
      cancellationStart,
    );
    const cancellationBody = definition.slice(
      cancellationStart,
      cancellationEnd,
    );
    const enqueueIndex = cancellationBody.indexOf(
      "perform private.enqueue_basic_medical_registration_outbox_event(",
    );
    const transitionIndex = cancellationBody.indexOf(
      "with cancelled_schedules as (",
    );
    assert.ok(enqueueIndex >= 0);
    assert.ok(transitionIndex >= 0);
    assert.ok(enqueueIndex < transitionIndex);
  }
});

test("Basic Medical and shared class calendars keep excluding cancelled schedules", () => {
  for (const path of [
    "app/basic-medical/schedules/page.tsx",
    "app/classes/open/page.tsx",
    "app/classes/mine/page.tsx",
  ]) {
    assert.match(read(path), /\.neq\("schedule_status", "cancelled"\)/);
  }
});
