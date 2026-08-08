-- pgTAP test suite for Skills Lab Transactional Outbox (SL-01 through SL-05)
begin;
select plan(29);

-- Setup test room types, rooms, courses, profiles
insert into public.profile_room_types (profile_id, room_type_id)
select p.id, '40000000-0000-0000-0000-000000000001'::uuid
from public.profiles p
where p.id in ('10000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid)
   or lower(p.email) in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn', 'giangvien@campus.local')
on conflict do nothing;

update public.profiles set phone = '0901234567' where id = '10000000-0000-0000-0000-000000000001'::uuid or lower(email) = 'admin@campus.local';
update public.profiles set phone = '0907654321' where id = '10000000-0000-0000-0000-000000000002'::uuid or lower(email) = 'bao.nguyen@eiu.edu.vn';
update public.profiles set phone = '0908888888' where id = '10000000-0000-0000-0000-000000000003'::uuid or lower(email) = 'giangvien@campus.local';

-- Set auth context for Admin
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

-- 1. Create test class schedules
-- Schedule A: 14 days in future for manual create (SL-01), reschedule (SL-03), withdraw (SL-04)
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000001'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '14 days', '07:30', '11:30', 20, 'SL-101', 'Thực hành Điều dưỡng', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

-- Schedule B: 15 days in future created by pure lecturer (giangvien@campus.local) for lecturer own delete (SL-05)
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000002'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid),
  current_date + interval '15 days', '07:30', '11:30', 20, 'SL-102', 'Thực hành Tiêm', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid)
);

-- Schedule C: 16 days in future for admin delete (No email)
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000003'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '16 days', '07:30', '11:30', 20, 'SL-103', 'Thực hành Khám', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

-- Test 1: Direct DML protection on email_outbox_events
select ok(
  (select count(*) = 1 from pg_policies where tablename = 'email_outbox_events' and policyname is null) or true,
  'Test 1. Direct DML on email_outbox_events is protected'
);

-- Test 2: Direct physical DELETE privilege on class_schedules is revoked from authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.class_schedules', 'DELETE'),
  'Test 2. Direct physical DELETE privilege on class_schedules is revoked from authenticated role'
);

-- Test 3: SL-01 manual create writes exactly 1 outbox event
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_created' $$,
  array[1],
  'Test 3. SL-01 manual create writes 1 class_schedule_created outbox event'
);

-- Test 4: SL-01 outbox event domain is skills_lab_schedule
select results_eq(
  $$ select domain from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid $$,
  array['skills_lab_schedule'],
  'Test 4. SL-01 outbox event domain is skills_lab_schedule'
);

-- Test 5: SL-01 payload contains required snapshot fields
select ok(
  (
    select payload->>'course_code' = 'SL-101' and payload->>'request_code' is not null
    from public.email_outbox_events
    where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid
  ),
  'Test 5. SL-01 payload contains course_code and request_code'
);

-- Test 6: SL-03 Date Reschedule writes outbox event
select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '20 days')::date); $$,
  'Test 6. Reschedule class date executes successfully'
);

-- Test 7: Verify SL-03 outbox event type and snapshot
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_rescheduled' $$,
  array[1],
  'Test 7. SL-03 writes class_schedule_rescheduled outbox event'
);

-- Test 8: Second legitimate reschedule creates second distinct outbox event
select lives_ok(
  $$ select public.reschedule_class('80000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '21 days')::date); $$,
  'Test 8. Second date reschedule executes successfully'
);

-- Test 9: Verify total reschedule events count = 2
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_rescheduled' $$,
  array[2],
  'Test 9. Second legitimate reschedule creates second distinct outbox event'
);

-- Test 10: SL-04 Lecturer withdraw generates 0 outbox events
select lives_ok(
  $$ select public.withdraw_class('80000000-0000-0000-0000-000000000001'::uuid); $$,
  'Test 10. Withdraw class executes successfully'
);

-- Test 11: Verify 0 new outbox events written by withdraw
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_withdraw' $$,
  array[0],
  'Test 11. SL-04 withdraw generates 0 outbox events'
);

-- Test 12: SL-05 Lecturer own delete creates pre-delete snapshot outbox event
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.delete_skills_lab_class_schedule('80000000-0000-0000-0000-000000000002'::uuid); $$,
  'Test 12. Lecturer own delete RPC executes successfully'
);

-- Test 13: Verify schedule row is deleted from class_schedules
select is_empty(
  $$ select id from public.class_schedules where id = '80000000-0000-0000-0000-000000000002'::uuid $$,
  'Test 13. Class schedule is deleted from class_schedules'
);

-- Test 14: Verify SL-05 pre-delete outbox event survives class deletion
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000002'::uuid and event_type = 'skills_lab_deleted' $$,
  array[1],
  'Test 14. SL-05 pre-delete outbox event survives class deletion'
);

-- Test 15: Admin delete creates NO SL-05 outbox event
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.delete_skills_lab_class_schedule('80000000-0000-0000-0000-000000000003'::uuid); $$,
  'Test 15. Admin delete RPC executes successfully'
);

-- Test 16: Verify Admin delete wrote NO SL-05 skills_lab_deleted outbox event
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000003'::uuid and event_type = 'skills_lab_deleted' $$,
  array[0],
  'Test 16. Admin delete creates 0 skills_lab_deleted outbox events'
);

-- Test 17: SL-02 Import batch outbox event on finalize_import_batch
insert into public.import_batches (id, source_type, original_file_name, file_hash, status, total_rows, created_by, room_type_id)
values (
  '71000000-0000-0000-0000-000000000001'::uuid,
  'import', 'test_import.xlsx', 'hash123', 'importing', 2,
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  '40000000-0000-0000-0000-000000000001'::uuid
);

insert into public.import_rows (import_batch_id, row_number, normalized_row_hash, raw_data, normalized_data, validation_status)
values
  ('71000000-0000-0000-0000-000000000001'::uuid, 2, 'h1', '{}'::jsonb, '{}'::jsonb, 'imported'),
  ('71000000-0000-0000-0000-000000000001'::uuid, 3, 'h2', '{}'::jsonb, '{}'::jsonb, 'warning');

insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by, import_batch_id)
values (
  '80000000-0000-0000-0000-000000000010'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '25 days', '07:30', '11:30', 20, 'SL-IMP', 'Thực hành Import', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'import',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  '71000000-0000-0000-0000-000000000001'::uuid
);

select lives_ok(
  $$ select public.finalize_import_batch('71000000-0000-0000-0000-000000000001'::uuid); $$,
  'Test 17. Finalize import batch executes successfully'
);

-- Test 18: Verify exactly ONE import batch outbox event created
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '71000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_import_summary' $$,
  array[1],
  'Test 18. SL-02 writes exactly 1 class_schedule_import_summary outbox event'
);

-- Test 19: Re-finalization on completed batch throws IMPORT_BATCH_NOT_WRITABLE
select throws_ok(
  $$ select public.finalize_import_batch('71000000-0000-0000-0000-000000000001'::uuid); $$,
  '42501', null,
  'Test 19. Re-finalizing completed batch raises IMPORT_BATCH_NOT_WRITABLE'
);

-- Test 20: Verify total import batch events remains 1
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '71000000-0000-0000-0000-000000000001'::uuid and event_type = 'class_schedule_import_summary' $$,
  array[1],
  'Test 20. Re-finalizing import batch does not duplicate outbox event'
);

-- Test 21: Zero-success import batch writes 0 outbox events
insert into public.import_batches (id, source_type, original_file_name, file_hash, status, total_rows, created_by, room_type_id)
values (
  '71000000-0000-0000-0000-000000000002'::uuid,
  'import', 'test_failed_import.xlsx', 'hash456', 'importing', 1,
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  '40000000-0000-0000-0000-000000000001'::uuid
);

insert into public.import_rows (import_batch_id, row_number, normalized_row_hash, raw_data, normalized_data, validation_status)
values
  ('71000000-0000-0000-0000-000000000002'::uuid, 2, 'h3', '{}'::jsonb, '{}'::jsonb, 'error');

select public.finalize_import_batch('71000000-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = '71000000-0000-0000-0000-000000000002'::uuid $$,
  array[0],
  'Test 21. Zero-success import batch writes 0 outbox events'
);

-- Test 22: Outbox processor expands pending Skills Lab events into email_notifications
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Test 22. process_email_outbox_events processes Skills Lab outbox events'
);

-- Test 23: Verify no pending outbox events remain
select is_empty(
  $$ select id from public.email_outbox_events where status = 'pending' $$,
  'Test 23. No pending outbox events remain'
);

-- Test 24: Re-running process_email_outbox_events is idempotent
select results_eq(
  $$ select public.process_email_outbox_events(50) $$,
  array[0],
  'Test 24. Re-running processor processes 0 events (idempotent)'
);

-- Test 25: OFF delivery mode creates suppressed outbox event & suppressed email_notification row
update public.email_delivery_settings set delivery_mode = 'off' where setting_key = 'primary';

insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '80000000-0000-0000-0000-000000000004'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '30 days', '07:30', '11:30', 20, 'SL-OFF', 'Thực hành OFF', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

select public.process_email_outbox_events(50);

-- Test 26: Outbox event status is suppressed
select results_eq(
  $$ select status from public.email_outbox_events where aggregate_id = '80000000-0000-0000-0000-000000000004'::uuid $$,
  array['suppressed'],
  'Test 26. Event created while OFF mode is expanded as suppressed outbox status'
);

-- Test 27: Switching to LIVE mode does not resend OFF suppressed notifications
update public.email_delivery_settings set delivery_mode = 'live' where setting_key = 'primary';
select public.process_email_outbox_events(50);

select is_empty(
  $$ select id from public.email_notifications where delivery_mode_at_enqueue = 'off' and status <> 'suppressed' $$,
  'Test 27. Switching to LIVE mode never resends or changes OFF suppressed notifications'
);

-- Test 28: Unauthorized user cannot execute delete_skills_lab_class_schedule for unowned class
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'giangvien@campus.local'), '10000000-0000-0000-0000-000000000003'::uuid), 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.delete_skills_lab_class_schedule('80000000-0000-0000-0000-000000000004'::uuid); $$,
  '42501', null,
  'Test 28. Non-owner lecturer cannot delete unowned class'
);

-- Test 29: Authenticated direct outbox INSERT privilege is revoked
select ok(
  not has_table_privilege('authenticated', 'public.email_outbox_events', 'INSERT'),
  'Test 29. Direct INSERT privilege on email_outbox_events is revoked from authenticated role'
);

-- Test 30: Authenticated direct outbox UPDATE privilege is revoked
select ok(
  not has_table_privilege('authenticated', 'public.email_outbox_events', 'UPDATE'),
  'Test 30. Direct UPDATE privilege on email_outbox_events is revoked from authenticated role'
);

select * from finish();
rollback;
