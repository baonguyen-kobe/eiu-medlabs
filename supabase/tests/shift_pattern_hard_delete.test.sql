begin;
select plan(12);




-- Create shift pattern
insert into public.staff_shift_patterns (id, staff_id, weekday, start_time, end_time, shift_type, effective_from, effective_to, created_by)
values (
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  2, '13:00:00', '17:00:00', 'AFTERNOON', current_date - interval '10 days', current_date + interval '10 days', 
  (select id from public.profiles where email = 'staff@campus.local')
);

-- Create occurrences

-- 1. future unused generated
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status)
values (
  '11111111-0000-0000-0000-000000000001'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days', '08:00:00', '12:00:00', 'MORNING', 'generated', 
  (select id from public.profiles where email = 'staff@campus.local'), 'scheduled'
);

-- 2. completed
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status)
values (
  '22222222-0000-0000-0000-000000000002'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days', '08:00:00', '12:00:00', 'MORNING', 'generated', 
  (select id from public.profiles where email = 'staff@campus.local'), 'completed'
);

-- 3. cancelled
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status, cancelled_by, cancelled_at)
values (
  '33333333-0000-0000-0000-000000000003'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '4 days', '08:00:00', '12:00:00', 'MORNING', 'generated', 
  (select id from public.profiles where email = 'staff@campus.local'), 'cancelled', 
  (select id from public.profiles where email = 'staff@campus.local'), now()
);

-- 4. past generated
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status)
values (
  '44444444-0000-0000-0000-000000000004'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days', '08:00:00', '12:00:00', 'MORNING', 'generated', 
  (select id from public.profiles where email = 'staff@campus.local'), 'scheduled'
);

-- 5. same-day already started
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status)
values (
  '55555555-0000-0000-0000-000000000005'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date, '00:00:00', '23:59:00', 'MORNING', 'generated',
  (select id from public.profiles where email = 'staff@campus.local'), 'scheduled'
);

-- 6. manual future
insert into public.staff_shifts (id, staff_id, shift_pattern_id, shift_date, start_time, end_time, shift_type, registration_source, created_by, status)
values (
  '66666666-0000-0000-0000-000000000006'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  '88888888-0000-0000-0000-000000000001'::uuid, 
  (now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days', '08:00:00', '12:00:00', 'MORNING', 'admin_assigned', 
  (select id from public.profiles where email = 'staff@campus.local'), 'scheduled'
);

-- Test 1: Ordinary Admin cannot hard delete
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = 'admin.other@campus.local'), 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hard_delete_shift_pattern('88888888-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  'HARD_DELETE_AUTHORITY_REQUIRED',
  'Ordinary Admin should be denied'
);

-- Test 2: Root Admin can hard delete
select set_config('request.jwt.claims', json_build_object('sub', (select root_admin_id from public.system_security_principals limit 1), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hard_delete_shift_pattern('88888888-0000-0000-0000-000000000001'::uuid) $$,
  'Root Admin should be allowed to hard delete'
);

-- Assertions on the consequences
select is_empty(
  $$ select * from public.staff_shifts where id = '11111111-0000-0000-0000-000000000001'::uuid $$,
  'Future unused generated occurrence should be removed'
);

select isnt_empty(
  $$ select * from public.staff_shifts where id = '22222222-0000-0000-0000-000000000002'::uuid $$,
  'Completed occurrence should survive'
);

select isnt_empty(
  $$ select * from public.staff_shifts where id = '33333333-0000-0000-0000-000000000003'::uuid $$,
  'Cancelled occurrence should survive'
);

select isnt_empty(
  $$ select * from public.staff_shifts where id = '44444444-0000-0000-0000-000000000004'::uuid $$,
  'Past historical generated occurrence should survive'
);

select isnt_empty(
  $$ select * from public.staff_shifts where id = '55555555-0000-0000-0000-000000000005'::uuid $$,
  'Same-day already started occurrence should survive'
);

select isnt_empty(
  $$ select * from public.staff_shifts where id = '66666666-0000-0000-0000-000000000006'::uuid $$,
  'Manual shift should survive'
);

-- Verify shift_pattern_id is NULL for preserved rows
select is(
  (select shift_pattern_id from public.staff_shifts where id = '22222222-0000-0000-0000-000000000002'::uuid),
  null::uuid,
  'Preserved history shift_pattern_id becomes NULL'
);

-- Verify parent deleted
select is_empty(
  $$ select * from public.staff_shift_patterns where id = '88888888-0000-0000-0000-000000000001'::uuid $$,
  'Target staff_shift_pattern is deleted'
);

-- Verify audit log
select is(
  (select count(*) from public.audit_logs where action = 'shift_pattern.hard_deleted' and entity_id = '88888888-0000-0000-0000-000000000001'::uuid),
  1::bigint,
  'Audit log contains exactly one hard delete event'
);

-- Test 3: Bao can hard delete
-- Create another pattern for Bao
insert into public.staff_shift_patterns (id, staff_id, weekday, start_time, end_time, shift_type, effective_from, effective_to, created_by)
values (
  '77777777-0000-0000-0000-000000000007'::uuid, 
  (select id from public.profiles where email = 'staff@campus.local'), 
  2, '13:00:00', '17:00:00', 'AFTERNOON', current_date, current_date, 
  (select id from public.profiles where email = 'staff@campus.local')
);

select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where email = 'bao.nguyen@eiu.edu.vn'), 'role', 'authenticated')::text, true);

select lives_ok(
  $$ select public.hard_delete_shift_pattern('77777777-0000-0000-0000-000000000007'::uuid) $$,
  'Bao should be allowed to hard delete'
);

select * from finish();
rollback;
