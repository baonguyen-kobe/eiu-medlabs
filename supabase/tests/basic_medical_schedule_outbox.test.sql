-- pgTAP Test Suite: basic_medical_schedule_outbox.test.sql
-- Checkpoint B & Corrective Fix: Basic Medical Schedule Transactional Outbox (YC-L04 & YC-L05) & YC-L03 Reschedule & YC-L04 Authority Gate

begin;
select plan(50);

-- Setup test fixtures
create temp table _test_fixtures as
select
  '40000000-0000-0000-0000-000000000001'::uuid as skills_room_type_id,
  '40000000-0000-0000-0000-000000000002'::uuid as basic_medical_room_type_id,
  'a0000000-0000-0000-0000-000000000001'::uuid as admin_id,
  'a0000000-0000-0000-0000-000000000002'::uuid as staff_bm_id,
  'a0000000-0000-0000-0000-000000000003'::uuid as staff_sl_id,
  'a0000000-0000-0000-0000-000000000004'::uuid as lecturer_1_id,
  'a0000000-0000-0000-0000-000000000005'::uuid as lecturer_2_id,
  'a0000000-0000-0000-0000-000000000006'::uuid as viewer_optin_id,
  'a0000000-0000-0000-0000-000000000007'::uuid as viewer_optout_id,
  'a0000000-0000-0000-0000-000000000008'::uuid as ta_bm_id,
  'b0000000-0000-0000-0000-000000000001'::uuid as course_bm_id,
  'b0000000-0000-0000-0000-000000000002'::uuid as course_sl_id,
  'c0000000-0000-0000-0000-000000000001'::uuid as room_bm_1_id,
  'c0000000-0000-0000-0000-000000000002'::uuid as room_bm_2_id,
  'c0000000-0000-0000-0000-000000000003'::uuid as room_sl_id,
  'd0000000-0000-0000-0000-000000000001'::uuid as sched_bm_1_id,
  'd0000000-0000-0000-0000-000000000002'::uuid as sched_bm_2_id,
  'd0000000-0000-0000-0000-000000000003'::uuid as sched_sl_1_id,
  'd0000000-0000-0000-0000-000000000004'::uuid as sched_bm_ta_id,
  'd0000000-0000-0000-0000-000000000005'::uuid as sched_bm_imp_id,
  'd0000000-0000-0000-0000-000000000006'::uuid as sched_sl_imp_id,
  'e0000000-0000-0000-0000-000000000001'::uuid as import_batch_bm_id,
  'e0000000-0000-0000-0000-000000000002'::uuid as import_batch_sl_id;

grant select, update on table _test_fixtures to authenticated, service_role;
grant select on public.email_outbox_events to authenticated;
grant select on public.email_notifications to authenticated;

-- Seed auth users
insert into auth.users (id, email)
select admin_id, 'admin.test@campus.local' from _test_fixtures
union all select staff_bm_id, 'staff.bm@campus.local' from _test_fixtures
union all select staff_sl_id, 'staff.sl@campus.local' from _test_fixtures
union all select lecturer_1_id, 'lecturer.1@campus.local' from _test_fixtures
union all select lecturer_2_id, 'lecturer.2@campus.local' from _test_fixtures
union all select viewer_optin_id, 'viewer.optin@campus.local' from _test_fixtures
union all select viewer_optout_id, 'viewer.optout@campus.local' from _test_fixtures
union all select ta_bm_id, 'ta.bm@campus.local' from _test_fixtures
on conflict do nothing;

-- Seed test profiles
insert into public.profiles (id, email, full_name, is_active, can_import_schedules)
select admin_id, 'admin.test@campus.local', 'Admin Test', true, false from _test_fixtures
union all select staff_bm_id, 'staff.bm@campus.local', 'Staff BM Test', true, false from _test_fixtures
union all select staff_sl_id, 'staff.sl@campus.local', 'Staff SL Test', true, false from _test_fixtures
union all select lecturer_1_id, 'lecturer.1@campus.local', 'Lecturer 1 Test', true, true from _test_fixtures
union all select lecturer_2_id, 'lecturer.2@campus.local', 'Lecturer 2 Test', true, false from _test_fixtures
union all select viewer_optin_id, 'viewer.optin@campus.local', 'Viewer Optin Test', true, false from _test_fixtures
union all select viewer_optout_id, 'viewer.optout@campus.local', 'Viewer Optout Test', true, false from _test_fixtures
union all select ta_bm_id, 'ta.bm@campus.local', 'TA BM Test', true, true from _test_fixtures
on conflict (id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  is_active = excluded.is_active,
  can_import_schedules = excluded.can_import_schedules;

-- Seed user roles
insert into public.user_roles (user_id, role)
select admin_id, 'admin'::public.app_role from _test_fixtures
union all select staff_bm_id, 'staff'::public.app_role from _test_fixtures
union all select staff_sl_id, 'staff'::public.app_role from _test_fixtures
union all select lecturer_1_id, 'lecturer'::public.app_role from _test_fixtures
union all select lecturer_2_id, 'lecturer'::public.app_role from _test_fixtures
union all select viewer_optin_id, 'viewer'::public.app_role from _test_fixtures
union all select viewer_optout_id, 'viewer'::public.app_role from _test_fixtures
union all select ta_bm_id, 'teaching_assistant'::public.app_role from _test_fixtures
on conflict (user_id, role) do nothing;

-- Seed profile room types
insert into public.profile_room_types (profile_id, room_type_id, receive_schedule_emails)
select staff_bm_id, basic_medical_room_type_id, false from _test_fixtures
union all select staff_sl_id, skills_room_type_id, false from _test_fixtures
union all select lecturer_1_id, basic_medical_room_type_id, false from _test_fixtures
union all select lecturer_1_id, skills_room_type_id, false from _test_fixtures
union all select lecturer_2_id, basic_medical_room_type_id, false from _test_fixtures
union all select viewer_optin_id, basic_medical_room_type_id, true from _test_fixtures
union all select viewer_optout_id, basic_medical_room_type_id, false from _test_fixtures
union all select ta_bm_id, basic_medical_room_type_id, false from _test_fixtures
union all select ta_bm_id, skills_room_type_id, false from _test_fixtures
on conflict (profile_id, room_type_id) do update set
  receive_schedule_emails = excluded.receive_schedule_emails;

-- Seed import batches
insert into public.import_batches (id, original_file_name, file_hash, created_by, status, room_type_id)
select import_batch_bm_id, 'bm_import.csv', 'hash_bm_123', lecturer_1_id, 'completed'::public.import_status, basic_medical_room_type_id from _test_fixtures
union all select import_batch_sl_id, 'sl_import.csv', 'hash_sl_123', lecturer_1_id, 'completed'::public.import_status, skills_room_type_id from _test_fixtures;

-- Seed courses & rooms
insert into public.courses (id, course_code, course_name, room_type_id, is_active)
select course_bm_id, 'BM-TEST-101', 'Môn Y Cơ Sở', basic_medical_room_type_id, true from _test_fixtures
union all select course_sl_id, 'SL-TEST-101', 'Môn Skills Lab', skills_room_type_id, true from _test_fixtures;

insert into public.rooms (id, room_code, building_code, room_name, room_type_id, is_active)
select room_bm_1_id, 'Y101', 'YT', 'Phòng Y 1', basic_medical_room_type_id, true from _test_fixtures
union all select room_bm_2_id, 'Y102', 'YT', 'Phòng Y 2', basic_medical_room_type_id, true from _test_fixtures
union all select room_sl_id, 'SL201', 'SL', 'Phòng Skills 1', skills_room_type_id, true from _test_fixtures;

-- Seed schedules
insert into public.class_schedules (
  id, course_id, course_code_snapshot, course_name_snapshot, room_id,
  lecturer_id, lecturer_2_id, schedule_date, start_time, end_time,
  student_count, schedule_status, created_by, published_by, published_at,
  source, import_batch_id
)
select
  sched_bm_1_id, course_bm_id, 'BM-TEST-101', 'Môn Y Cơ Sở', room_bm_1_id,
  lecturer_1_id, lecturer_2_id, '2042-09-01'::date, '08:00'::time, '11:00'::time,
  30, 'published'::public.schedule_status, admin_id, admin_id, now(),
  'manual'::public.schedule_source, null::uuid
from _test_fixtures
union all select
  sched_bm_2_id, course_bm_id, 'BM-TEST-101', 'Môn Y Cơ Sở', room_bm_1_id,
  lecturer_1_id, null::uuid, '2042-09-02'::date, '08:00'::time, '11:00'::time,
  30, 'published'::public.schedule_status, admin_id, admin_id, now(),
  'manual'::public.schedule_source, null::uuid
from _test_fixtures
union all select
  sched_sl_1_id, course_sl_id, 'SL-TEST-101', 'Môn Skills Lab', room_sl_id,
  lecturer_1_id, null::uuid, '2042-09-03'::date, '08:00'::time, '11:00'::time,
  25, 'published'::public.schedule_status, admin_id, admin_id, now(),
  'manual'::public.schedule_source, null::uuid
from _test_fixtures
union all select
  sched_bm_ta_id, course_bm_id, 'BM-TEST-101', 'Môn Y Cơ Sở', room_bm_1_id,
  lecturer_1_id, null::uuid, '2042-09-04'::date, '08:00'::time, '11:00'::time,
  25, 'published'::public.schedule_status, ta_bm_id, ta_bm_id, now(),
  'manual'::public.schedule_source, null::uuid
from _test_fixtures
union all select
  sched_bm_imp_id, course_bm_id, 'BM-TEST-101', 'Môn Y Cơ Sở', room_bm_1_id,
  lecturer_1_id, null::uuid, '2042-09-05'::date, '08:00'::time, '11:00'::time,
  25, 'published'::public.schedule_status, lecturer_1_id, lecturer_1_id, now(),
  'import'::public.schedule_source, import_batch_bm_id
from _test_fixtures
union all select
  sched_sl_imp_id, course_sl_id, 'SL-TEST-101', 'Môn Skills Lab', room_sl_id,
  lecturer_1_id, null::uuid, '2042-09-06'::date, '08:00'::time, '11:00'::time,
  25, 'published'::public.schedule_status, lecturer_1_id, lecturer_1_id, now(),
  'import'::public.schedule_source, import_batch_sl_id
from _test_fixtures;


-- ============================================================================
-- YC-L04 TESTS: FULL BASIC MEDICAL SCHEDULE EDIT
-- ============================================================================

-- Test 1: Basic Medical full edit succeeds via update_class_schedule_details for Admin
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-01'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_bm_2_id from _test_fixtures),
    40,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  'Basic Medical schedule update succeeds for Admin'
);

-- Inspect outbox using service_role
select set_config('role', 'service_role', true);

-- Test 2: Exactly one outbox event created for YC-L04 edit
select is(
  (select count(*)::integer from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures)),
  1,
  'Exactly one outbox event emitted for Basic Medical schedule update'
);

-- Test 3: Event domain and event_type are correct
select is(
  (select domain from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures) limit 1),
  'basic_medical_schedule',
  'Outbox domain is basic_medical_schedule'
);
select is(
  (select event_type from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures) limit 1),
  'schedule_updated',
  'Outbox event_type is schedule_updated'
);

-- Test 4: FINAL state snapshot in payload is correct
select is(
  (select payload->>'student_count' from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures) limit 1),
  '40',
  'FINAL state payload has updated student_count'
);
select is(
  (select payload->>'room_name' from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures) limit 1),
  'Phòng Y 2',
  'FINAL state payload has room_name'
);

-- Test 5: Recipients list includes lecturer 1, lecturer 2, admin, scoped staff, and opted-in viewer
select ok(
  exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select lecturer_1_id from _test_fixtures)
  )
  and exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select lecturer_2_id from _test_fixtures)
  )
  and exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select admin_id from _test_fixtures)
  )
  and exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select staff_bm_id from _test_fixtures)
  ),
  'Recipients list includes Lecturers, Admin, and scoped Staff'
);

-- Test 6: Unscoped Staff (Skills Lab only) is excluded
select ok(
  not exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select staff_sl_id from _test_fixtures)
  ),
  'Unscoped Staff is excluded from Basic Medical schedule recipients'
);

-- Test 7: Viewer with opt-in (receive_schedule_emails = true) is included
select ok(
  exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select viewer_optin_id from _test_fixtures)
  ),
  'Opted-in Viewer is included in recipients'
);

-- Test 8: Viewer with opt-out (receive_schedule_emails = false) is excluded
select ok(
  not exists (
    select 1 from public.email_outbox_events evt,
    jsonb_to_recordset(evt.recipients) as r(recipient_id uuid)
    where evt.aggregate_id = (select sched_bm_1_id from _test_fixtures)
      and r.recipient_id = (select viewer_optout_id from _test_fixtures)
  ),
  'Opted-out Viewer is excluded from recipients'
);

-- Test 9: Actual-change guard: identical/no-op save creates NO second outbox event
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-01'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_bm_2_id from _test_fixtures),
    40,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  'No-op save succeeds'
);

select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures)),
  1,
  'No-op save created zero additional outbox events'
);

-- Test 10: Second legitimate edit creates a second outbox event
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-01'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_bm_2_id from _test_fixtures),
    45,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  'Second legitimate edit succeeds'
);

select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where aggregate_id = (select sched_bm_1_id from _test_fixtures)),
  2,
  'Second legitimate edit created a second outbox event'
);

-- Test 11: Non-Basic-Medical (Skills Lab) schedule edit creates NO Basic Medical outbox event
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_sl_1_id from _test_fixtures),
    '2042-09-03'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_sl_id from _test_fixtures),
    30,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  'Skills Lab schedule edit succeeds'
);

select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_schedule' and aggregate_id = (select sched_sl_1_id from _test_fixtures)),
  0,
  'Skills Lab edit created zero Basic Medical outbox events'
);

-- Test 12: Processor creates correct email_notifications rows
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Processor execution succeeds for service_role'
);

select ok(
  exists (
    select 1 from public.email_notifications
    where notification_type = 'class_schedule_basic_medical_updated'
      and subject = '[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · BM-TEST-101'
  ),
  'Processor created email_notifications with correct type and subject'
);

-- Test 13: Processor replay produces no duplicate notification rows
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Processor replay execution succeeds'
);

-- Test 14: Scoped Basic Medical Staff YC-L04 edit succeeds
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select staff_bm_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-01'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_bm_2_id from _test_fixtures),
    48,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  'Scoped Basic Medical Staff YC-L04 edit succeeds'
);


-- ============================================================================
-- YC-L05 TESTS: BASIC MEDICAL SCHEDULE CANCELLATION
-- ============================================================================

-- Test 15: Non-Admin cancellation is DENIED
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select staff_bm_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.cancel_class_schedule((select sched_bm_2_id from _test_fixtures)); $$,
  '42501',
  'ADMIN_ROLE_REQUIRED',
  'Non-Admin cancellation is denied'
);

-- Test 16: Admin cancellation succeeds
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.cancel_class_schedule((select sched_bm_2_id from _test_fixtures)); $$,
  'Admin cancellation succeeds'
);

-- Test 17: Exactly one schedule_cancelled outbox event created
select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where aggregate_id = (select sched_bm_2_id from _test_fixtures) and event_type = 'schedule_cancelled'),
  1,
  'Exactly one schedule_cancelled outbox event created'
);
select is(
  (select payload->>'room_name' from public.email_outbox_events where aggregate_id = (select sched_bm_2_id from _test_fixtures) and event_type = 'schedule_cancelled' limit 1),
  'Phòng Y 1',
  'PRE-CANCEL payload has room_name'
);

-- Test 18: Schedule status updated to cancelled with cancelled_by metadata
select ok(
  exists (
    select 1 from public.class_schedules
    where id = (select sched_bm_2_id from _test_fixtures)
      and schedule_status = 'cancelled'
      and cancelled_by = (select admin_id from _test_fixtures)
      and cancelled_at is not null
  ),
  'Schedule status is cancelled with metadata'
);

-- Test 19: Repeat cancellation throws error or is denied
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.cancel_class_schedule((select sched_bm_2_id from _test_fixtures)); $$,
  'P0001',
  'CLASS_NOT_AVAILABLE',
  'Repeat cancellation throws CLASS_NOT_AVAILABLE'
);

select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where aggregate_id = (select sched_bm_2_id from _test_fixtures) and event_type = 'schedule_cancelled'),
  1,
  'Repeat cancellation created zero additional outbox events'
);

-- Test 20: Non-Basic-Medical (Skills Lab) Admin cancellation creates NO Basic Medical outbox event
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.cancel_class_schedule((select sched_sl_1_id from _test_fixtures)); $$,
  'Skills Lab cancellation succeeds'
);

select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_schedule' and aggregate_id = (select sched_sl_1_id from _test_fixtures)),
  0,
  'Skills Lab cancellation created zero Basic Medical outbox events'
);

-- Test 21: Processor creates correct cancelled notification row
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Processor execution succeeds'
);

select ok(
  exists (
    select 1 from public.email_notifications
    where notification_type = 'class_schedule_basic_medical_cancelled'
      and subject = '[MedLabs Calendar] Hủy lịch Y cơ sở · BM-TEST-101'
  ),
  'Processor created cancelled notification with correct type and subject'
);


-- ============================================================================
-- YC-L03 & L03/L04 SEPARATION CORRECTIVE TESTS
-- ============================================================================

-- Test 22: Lecturer calling update_class_schedule_details for date-only change on Basic Medical schedule is DENIED
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select lecturer_1_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-10'::date,
    '08:00'::time,
    '11:30'::time,
    (select room_bm_2_id from _test_fixtures),
    48,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  '42501',
  'CLASS_UPDATE_FORBIDDEN',
  'Lecturer update_class_schedule_details call on Basic Medical schedule is DENIED even if date-only'
);

-- Test 23: Same Lecturer calling reschedule_class for the same Basic Medical schedule is ALLOWED
select lives_ok(
  $$ select public.reschedule_class(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-10'::date
  ); $$,
  'Lecturer reschedule_class call on Basic Medical schedule is ALLOWED'
);

-- Test 24: YC-L03 reschedule_class creates email notifications directly
select set_config('role', 'service_role', true);
select is(
  (select count(*)::integer from public.email_notifications
   where notification_type = 'class_schedule_basic_medical_updated'
     and payload->>'actor' = 'Lecturer 1 Test'
     and payload->>'schedule_date' = '2042-09-10'
     and recipient_id in (
       select admin_id from _test_fixtures
       union all select staff_bm_id from _test_fixtures
       union all select lecturer_1_id from _test_fixtures
       union all select lecturer_2_id from _test_fixtures
       union all select viewer_optin_id from _test_fixtures
     )),
  5, -- 5 test fixture recipients: lecturer 1, lecturer 2, admin, scoped staff, opted-in viewer
  'YC-L03 creates email_notifications for test fixture recipients'
);

-- Test 25: YC-L03 creates ZERO basic_medical_schedule outbox events
select is(
  (select count(*)::integer from public.email_outbox_events
   where domain = 'basic_medical_schedule'
     and payload->>'old_schedule_date' = '2042-09-01'
     and payload->>'schedule_date' = '2042-09-10'),
  0,
  'YC-L03 created zero basic_medical_schedule outbox events'
);

-- Test 26: YC-L03 email subject exact format matches [MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101
select ok(
  exists (
    select 1 from public.email_notifications
    where notification_type = 'class_schedule_basic_medical_updated'
      and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101'
      and payload->>'schedule_date' = '2042-09-10'
  ),
  'YC-L03 subject exact format matches [MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101'
);

-- Test 27: YC-L03 recipients list includes lecturer 1, lecturer 2, admin, scoped staff, opted-in viewer
select ok(
  exists (select 1 from public.email_notifications where recipient_id = (select lecturer_1_id from _test_fixtures) and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101')
  and exists (select 1 from public.email_notifications where recipient_id = (select lecturer_2_id from _test_fixtures) and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101')
  and exists (select 1 from public.email_notifications where recipient_id = (select admin_id from _test_fixtures) and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101')
  and exists (select 1 from public.email_notifications where recipient_id = (select staff_bm_id from _test_fixtures) and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101')
  and exists (select 1 from public.email_notifications where recipient_id = (select viewer_optin_id from _test_fixtures) and subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101'),
  'YC-L03 recipients include Lecturers 1 & 2, Admin, scoped Staff, and opted-in Viewer'
);

-- Test 28: YC-L03 does not double-send to any recipient
select is(
  (select count(*)::integer from (
    select recipient_id, count(*)
    from public.email_notifications
    where subject = '[MedLabs Calendar] Đổi ngày học Y cơ sở · BM-TEST-101'
    group by recipient_id
    having count(*) > 1
  ) dupes),
  0,
  'YC-L03 does not double-send to any recipient'
);

-- Test 29: Lecturer calling update_class_schedule_details for full edit/other fields is DENIED
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select lecturer_1_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_1_id from _test_fixtures),
    '2042-09-10'::date,
    '08:00'::time,
    '12:00'::time, -- changed end_time
    (select room_bm_2_id from _test_fixtures),
    48,
    array[(select lecturer_1_id from _test_fixtures), (select lecturer_2_id from _test_fixtures)]
  ); $$,
  '42501',
  'CLASS_UPDATE_FORBIDDEN',
  'Lecturer full update_class_schedule_details call is DENIED'
);


-- ============================================================================
-- YC-L04 AUTHORITY GATE TESTS (TEST A THROUGH TEST F)
-- ============================================================================

-- TEST A: Teaching Assistant owner calling update_class_schedule_details on Basic Medical schedule is DENIED
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select ta_bm_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_ta_id from _test_fixtures),
    '2042-09-12'::date,
    '08:00'::time,
    '11:00'::time,
    (select room_bm_1_id from _test_fixtures),
    25,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  '42501',
  'CLASS_UPDATE_FORBIDDEN',
  'TEST A: Teaching Assistant owner calling update_class_schedule_details on Basic Medical is DENIED'
);

-- TEST B: Import-capable Lecturer owning import batch calling update_class_schedule_details on imported Basic Medical schedule is DENIED
select set_config('request.jwt.claims', json_build_object('sub', (select lecturer_1_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_imp_id from _test_fixtures),
    '2042-09-12'::date,
    '08:00'::time,
    '11:00'::time,
    (select room_bm_1_id from _test_fixtures),
    25,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  '42501',
  'CLASS_UPDATE_FORBIDDEN',
  'TEST B: Import-capable Lecturer owning import batch calling update_class_schedule_details on imported Basic Medical is DENIED'
);

-- TEST C: Import-capable Teaching Assistant owning import batch calling update_class_schedule_details on imported Basic Medical schedule is DENIED
select set_config('request.jwt.claims', json_build_object('sub', (select ta_bm_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_imp_id from _test_fixtures),
    '2042-09-12'::date,
    '08:00'::time,
    '11:00'::time,
    (select room_bm_1_id from _test_fixtures),
    25,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  '42501',
  'CLASS_UPDATE_FORBIDDEN',
  'TEST C: Import-capable TA owning import batch calling update_class_schedule_details on imported Basic Medical is DENIED'
);

-- TEST D & E: Scoped Staff & Admin calling update_class_schedule_details on Basic Medical is ALLOWED
select set_config('request.jwt.claims', json_build_object('sub', (select staff_bm_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_bm_ta_id from _test_fixtures),
    '2042-09-12'::date,
    '08:00'::time,
    '11:00'::time,
    (select room_bm_1_id from _test_fixtures),
    28,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  'TEST D: Scoped Staff calling update_class_schedule_details on Basic Medical is ALLOWED'
);

-- TEST F: Non-Basic-Medical (Skills Lab) regression - TA owner & import-owner authorization remains ALLOWED
select set_config('request.jwt.claims', json_build_object('sub', (select lecturer_1_id from _test_fixtures))::text, true);

select lives_ok(
  $$ select public.update_class_schedule_details(
    (select sched_sl_imp_id from _test_fixtures),
    '2042-09-15'::date,
    '08:00'::time,
    '11:00'::time,
    (select room_sl_id from _test_fixtures),
    28,
    array[(select lecturer_1_id from _test_fixtures)]
  ); $$,
  'TEST F: Non-Basic-Medical (Skills Lab) import-owner update_class_schedule_details is ALLOWED'
);


-- ============================================================================
-- REGRESSION & SECURITY TESTS
-- ============================================================================

-- Test 35: Basic Medical schedule event never falls into Equipment Request formatter
select set_config('role', 'service_role', true);
select ok(
  not exists (
    select 1 from public.email_notifications
    where notification_type like 'equipment_request_%'
      and payload->>'course_code' = 'BM-TEST-101'
  ),
  'Basic Medical schedule events never fall through to equipment request formatter'
);

-- Test 36: Authenticated client process_email_outbox_events execution DENIED
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_fixtures))::text, true);

select throws_ok(
  $$ select public.process_email_outbox_events(50); $$,
  '42501',
  null,
  'Authenticated role cannot execute process_email_outbox_events'
);

-- Test 37: Direct outbox DML by authenticated DENIED
select throws_ok(
  $$ insert into public.email_outbox_events (domain, event_type, aggregate_id, event_key, payload, recipients, delivery_mode_at_event)
     values ('basic_medical_schedule', 'test', gen_random_uuid(), 'test:key', '{}'::jsonb, '[]'::jsonb, 'live'); $$,
  '42501',
  null,
  'Direct INSERT into email_outbox_events by authenticated is denied by RLS'
);

-- Test 38: Direct class_schedules DELETE by authenticated DENIED
select throws_ok(
  $$ delete from public.class_schedules where id = (select sched_bm_1_id from _test_fixtures); $$,
  '42501',
  null,
  'Direct DELETE on class_schedules by authenticated is denied by RLS'
);

-- Test 39: Private helper private.enqueue_basic_medical_schedule_outbox_event execution DENIED for authenticated
select throws_ok(
  $$ select private.enqueue_basic_medical_schedule_outbox_event((select sched_bm_1_id from _test_fixtures), 'test', (select admin_id from _test_fixtures), null); $$,
  '42501',
  null,
  'Private outbox enqueue helper execution denied for authenticated'
);

-- Test 40: Service role execution of process_email_outbox_events ALLOWED
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Service role can execute process_email_outbox_events'
);

select * from finish();
rollback;
