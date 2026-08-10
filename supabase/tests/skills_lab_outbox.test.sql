-- pgTAP test suite for Skills Lab Transactional Outbox (SL-01 through SL-05)
begin;
select plan(33);

-- Ensure test rooms and courses exist for basic_medical
insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity)
select '20000000-0000-0000-0000-000000000088'::uuid, 'BM-1', 'B1', 'Phòng Y cơ sở 1', id, 30
from public.room_types where code = 'basic_medical' limit 1
on conflict do nothing;

insert into public.courses (id, course_code, course_name, room_type_id)
select '10000000-0000-0000-0000-000000000088'::uuid, 'BM-101', 'Y cơ sở 1', id
from public.room_types where code = 'basic_medical' limit 1
on conflict do nothing;

-- Setup test room types, rooms, courses, profiles
insert into public.profile_room_types (profile_id, room_type_id)
select p.id, rt.id
from public.profiles p
cross join (select id from public.room_types where code = 'nursing_skills' limit 1) rt
where p.id in ('10000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid)
   or lower(p.email) in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn', 'giangvien@campus.local')
on conflict do nothing;

insert into public.profile_room_types (profile_id, room_type_id)
select p.id, rt.id
from public.profiles p
cross join (select id from public.room_types where code = 'basic_medical' limit 1) rt
where lower(p.email) = 'admin@campus.local'
on conflict do nothing;

update public.profiles set phone = '0901234567' where id = '10000000-0000-0000-0000-000000000001'::uuid or lower(email) = 'admin@campus.local';
update public.profiles set phone = '0907654321' where id = '10000000-0000-0000-0000-000000000002'::uuid or lower(email) = 'bao.nguyen@eiu.edu.vn';
update public.profiles set phone = '0908888888' where id = '10000000-0000-0000-0000-000000000003'::uuid or lower(email) = 'giangvien@campus.local';

-- Set auth context for Admin
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

-- Test 1: authenticated cannot execute process_email_outbox_events(integer)
select ok(
  not has_function_privilege('authenticated', 'public.process_email_outbox_events(integer)', 'EXECUTE'),
  'Test 1. authenticated cannot execute process_email_outbox_events'
);

-- Test 2: service_role can execute process_email_outbox_events(integer)
select ok(
  has_function_privilege('service_role', 'public.process_email_outbox_events(integer)', 'EXECUTE'),
  'Test 2. service_role can execute process_email_outbox_events'
);

-- Test 3: Direct physical DELETE privilege on class_schedules is revoked from authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.class_schedules', 'DELETE'),
  'Test 3. Direct physical DELETE privilege on class_schedules is revoked from authenticated role'
);

-- Test 4: Direct INSERT privilege on email_outbox_events is revoked from authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.email_outbox_events', 'INSERT'),
  'Test 4. Direct INSERT privilege on email_outbox_events is revoked from authenticated role'
);

-- Test 5: Direct UPDATE privilege on email_outbox_events is revoked from authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.email_outbox_events', 'UPDATE'),
  'Test 5. Direct UPDATE privilege on email_outbox_events is revoked from authenticated role'
);

-- 1. Create test class schedules
-- Schedule A: Skills Lab schedule for manual create (SL-01), reschedule (SL-03), withdraw (SL-04)
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000001'::uuid,
  (select id from public.courses where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  (select id from public.rooms where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '14 days', '07:30', '11:30', 20, 'SL-101', 'Thực hành Điều dưỡng', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

-- Test 6: SL-01 manual create writes pending outbox event
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_created' and status = 'pending' $$,
  array[1],
  'Test 6. SL-01 manual create writes 1 pending class_schedule_created outbox event'
);

-- Test 7: SL-01 outbox event domain is skills_lab_schedule
select results_eq(
  $$ select domain from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_created' $$,
  array['skills_lab_schedule'],
  'Test 7. SL-01 outbox event domain is skills_lab_schedule'
);

-- Test 8: SL-03 Reschedule A -> B creates 1 outbox event
select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '20 days')::date); $$,
  'Test 8. Reschedule class A -> B executes successfully'
);

-- Test 9: Verify SL-03 outbox event count = 1
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_rescheduled' $$,
  array[1],
  'Test 9. SL-03 A -> B writes exactly 1 class_schedule_rescheduled outbox event'
);

-- Test 10: Same-target SL-03 retry B -> B is a no-op and does not emit a second event
select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '20 days')::date); $$,
  'Test 10. Same-target reschedule retry B -> B executes as no-op'
);

-- Test 11: Event count remains exactly 1 after same-target retry
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_rescheduled' $$,
  array[1],
  'Test 11. Event count remains 1 after same-target retry'
);

-- Test 12: Legitimate B -> C reschedule creates a second outbox event
select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '21 days')::date); $$,
  'Test 12. Legitimate B -> C reschedule executes successfully'
);

-- Test 13: Event count becomes exactly 2
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_rescheduled' $$,
  array[2],
  'Test 13. Event count becomes exactly 2 after legitimate B -> C reschedule'
);

-- Test 14: SL-04 Lecturer withdraw generates 0 outbox events
select lives_ok(
  $$ select public.withdraw_class('80000000-0000-0000-0000-000000000001'::uuid); $$,
  'Test 14. Withdraw class executes successfully'
);

-- Test 15: Verify 0 new outbox events written by withdraw
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_withdraw' $$,
  array[0],
  'Test 15. SL-04 withdraw generates 0 outbox events'
);

-- Schedule B: created by pure lecturer for SL-05 lecturer own delete
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000002'::uuid,
  (select id from public.courses where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  (select id from public.rooms where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid),
  current_date + interval '15 days', '07:30', '11:30', 20, 'SL-102', 'Thực hành Tiêm', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid)
);

-- Test 16: SL-05 Lecturer own delete creates pre-delete snapshot outbox event
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.delete_skills_lab_class_schedule('80000000-0000-0000-0000-000000000002'::uuid); $$,
  'Test 16. Lecturer own delete RPC executes successfully'
);

-- Test 17: Verify schedule row is deleted from class_schedules
select is_empty(
  $$ select id from public.class_schedules where id = '80000000-0000-0000-0000-000000000002'::uuid $$,
  'Test 17. Class schedule is deleted from class_schedules'
);

-- Test 18: Verify SL-05 pre-delete outbox event survives class deletion
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000002'::uuid and event_type = 'skills_lab_deleted' $$,
  array[1],
  'Test 18. SL-05 pre-delete outbox event survives class deletion'
);

-- Schedule C: Admin delete test
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000003'::uuid,
  (select id from public.courses where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  (select id from public.rooms where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '16 days', '07:30', '11:30', 20, 'SL-103', 'Thực hành Khám', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

-- Test 19: Admin delete creates NO SL-05 outbox event
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.delete_skills_lab_class_schedule('80000000-0000-0000-0000-000000000003'::uuid); $$,
  'Test 19. Admin delete RPC executes successfully'
);

-- Test 20: Verify Admin delete wrote NO skills_lab_deleted outbox event
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000003'::uuid and event_type = 'skills_lab_deleted' $$,
  array[0],
  'Test 20. Admin delete creates 0 skills_lab_deleted outbox events'
);

-- Test 21: SL-02 Import batch outbox event on finalize_import_batch
insert into public.import_batches (id, source_type, original_file_name, file_hash, status, total_rows, created_by, room_type_id)
values (
  '72000000-0000-0000-0000-000000000001'::uuid,
  'import', 'test_import.xlsx', 'hash123', 'importing', 2,
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  (select id from public.room_types where code = 'nursing_skills' limit 1)
);

insert into public.import_rows (import_batch_id, row_number, normalized_row_hash, raw_data, normalized_data, validation_status)
values
  ('72000000-0000-0000-0000-000000000001'::uuid, 2, 'h1', '{}'::jsonb, '{}'::jsonb, 'imported'),
  ('72000000-0000-0000-0000-000000000001'::uuid, 3, 'h2', '{}'::jsonb, '{}'::jsonb, 'warning');

insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by, import_batch_id)
values (
  '80000000-0000-0000-0000-000000000010'::uuid,
  (select id from public.courses where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  (select id from public.rooms where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '25 days', '07:30', '11:30', 20, 'SL-IMP', 'Thực hành Import', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'import',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  '72000000-0000-0000-0000-000000000001'::uuid
);

select lives_ok(
  $$ select public.finalize_import_batch('72000000-0000-0000-0000-000000000001'::uuid); $$,
  'Test 21. Finalize import batch executes successfully'
);

-- Test 22: Verify exactly ONE import batch outbox event created
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '72000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_import_summary' $$,
  array[1],
  'Test 22. SL-02 writes exactly 1 class_schedule_import_summary outbox event'
);

-- Test 23: Basic Medical reschedule preserves baseline direct email_notifications behavior (no skills_lab outbox event)
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000088'::uuid,
  '10000000-0000-0000-0000-000000000088'::uuid,
  '20000000-0000-0000-0000-000000000088'::uuid,
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '10 days', '07:30', '11:30', 20, 'BM-101', 'Y cơ sở 1', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000088'::uuid, (current_date + interval '12 days')::date); $$,
  'Test 23. Basic Medical reschedule executes successfully'
);

-- Test 24: Basic Medical reschedule created NO outbox event in email_outbox_events
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000088'::uuid $$,
  array[0],
  'Test 24. Basic Medical reschedule creates 0 outbox events'
);

-- Test 25: Basic Medical reschedule created direct email_notification row with baseline notification_type
select results_eq(
  $$ select (count(*) > 0)::boolean from public.email_notifications where notification_type = 'class_schedule_basic_medical_updated' and payload->>'schedule_id' = '80000000-0000-0000-0000-000000000088' $$,
  array[true],
  'Test 25. Basic Medical reschedule inserts direct email_notification with class_schedule_basic_medical_updated'
);

-- Test 26: Switch to superuser context for outbox processing
select set_config('request.jwt.claim.role', 'service_role', true);

-- Test 27: Outbox processor expands pending Skills Lab outbox events
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Test 27. process_email_outbox_events processes pending Skills Lab events'
);

-- Test 28: Verify no pending outbox events remain
select is_empty(
  $$ select id from public.email_outbox_events where status = 'pending' $$,
  'Test 28. No pending outbox events remain after processor execution'
);

-- Test 29: Re-running processor is idempotent
select results_eq(
  $$ select public.process_email_outbox_events(50) $$,
  array[0],
  'Test 29. Re-running processor processes 0 events (idempotent)'
);

-- Test 30: Outbox event with a deleted recipient profile and a valid recipient profile
insert into public.email_outbox_events (
  domain, event_type, aggregate_id, event_key, payload, recipients, delivery_mode_at_event, status
) values (
  'skills_lab_schedule',
  'class_schedule_created',
  '80000000-0000-0000-0000-000000000099'::uuid,
  'skills_lab:created:test_deleted_recipient:99',
  jsonb_build_object('schedule_id', '80000000-0000-0000-0000-000000000099'),
  jsonb_build_array(
    jsonb_build_object('id', '99999999-9999-9999-9999-999999999999'::uuid, 'email', 'deleted@campus.local'),
    jsonb_build_object('id', (select id from public.profiles where lower(email) = 'admin@campus.local'), 'email', 'admin@campus.local')
  ),
  'live',
  'pending'
);

select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Test 30. process_email_outbox_events handles deleted-recipient profile without failing transaction'
);

select results_eq(
  $$ select status from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000099'::uuid $$,
  array['processed'],
  'Test 31. Outbox event reaches processed status despite deleted recipient'
);

select results_eq(
  $$ select count(*)::integer from public.email_notifications where payload->>'schedule_id' = '80000000-0000-0000-0000-000000000099' $$,
  array[1],
  'Test 32. Valid recipient received notification while deleted recipient was skipped'
);

-- Test 33: OFF delivery mode creates suppressed outbox event
update public.email_delivery_settings set delivery_mode = 'off' where setting_key = 'primary';

insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000004'::uuid,
  (select id from public.courses where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  (select id from public.rooms where room_type_id = (select id from public.room_types where code = 'nursing_skills' limit 1) limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '30 days', '07:30', '11:30', 20, 'SL-OFF', 'Thực hành OFF', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

select public.process_email_outbox_events(50);

-- Test 34: Outbox event status is suppressed
select results_eq(
  $$ select status from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000004'::uuid $$,
  array['suppressed'],
  'Test 34. Event created while OFF mode is expanded as suppressed outbox status'
);

-- Test 35: Switching to LIVE mode does not resend OFF suppressed notifications
update public.email_delivery_settings set delivery_mode = 'live' where setting_key = 'primary';
select public.process_email_outbox_events(50);

select is_empty(
  $$ select id from public.email_notifications where delivery_mode_at_enqueue = 'off' and status <> 'suppressed' $$,
  'Test 35. Switching to LIVE mode never resends or changes OFF suppressed notifications'
);

select * from finish();
rollback;
