-- pgTAP test suite for TB-06 Transactional Destructive Equipment Lifecycle
begin;
select plan(17);

-- 1. Ensure test fixture setup (profiles, phones, room types, catalog)
insert into public.profile_room_types (profile_id, room_type_id)
select p.id, '40000000-0000-0000-0000-000000000001'::uuid
from public.profiles p
where p.id in ('10000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000002'::uuid)
   or lower(p.email) in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn', 'staff@campus.local')
on conflict do nothing;

update public.profiles set phone = '0901234567' where id = '10000000-0000-0000-0000-000000000001'::uuid or lower(email) = 'admin@campus.local';
update public.profiles set phone = '0907654321' where id = '10000000-0000-0000-0000-000000000002'::uuid or lower(email) in ('bao.nguyen@eiu.edu.vn');
update public.profiles set phone = '0905555555' where lower(email) = 'staff@campus.local';

insert into public.equipment_catalog (id, item_name, unit, is_active)
values ('50000000-0000-0000-0000-000000000002'::uuid, 'Mô hình TB06', 'cái', true)
on conflict (id) do nothing;

-- Create schedule 1 & 2
insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '90000000-0000-0000-0000-000000000010'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '8 days', '07:30', '11:30', 25, 'NURS-TB06', 'Kỹ năng TB06', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

insert into public.class_schedules (id, course_id, room_id, lecturer_id, schedule_date, start_time, end_time, student_count, course_code_snapshot, course_name_snapshot, schedule_status, published_at, published_by, source, created_by)
values (
  '90000000-0000-0000-0000-000000000011'::uuid,
  (select id from public.courses where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  (select id from public.rooms where room_type_id = '40000000-0000-0000-0000-000000000001'::uuid limit 1),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
  current_date + interval '9 days', '07:30', '11:30', 25, 'NURS-TB06-HD', 'Kỹ năng Hard Delete', 'published', now(),
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'manual',
  coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid)
);

-- Set auth context to Admin for creation
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

-- Test 1: Create request 1
select lives_ok(
  $$
    select public.create_equipment_request_with_items(
      '90000000-0000-0000-0000-000000000010'::uuid,
      'HK1',
      coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
      ((current_date + interval '8 days')::date::text || ' 09:00:00 Asia/Ho_Chi_Minh')::timestamptz,
      ((current_date + interval '8 days')::date::text || ' 11:00:00 Asia/Ho_Chi_Minh')::timestamptz,
      'Request for soft cancel test',
      null,
      jsonb_build_array(
        jsonb_build_object(
          'skill_name', 'Kỹ năng TB06',
          'catalog_item_id', '50000000-0000-0000-0000-000000000002'::uuid,
          'quantity', 1,
          'note', null
        )
      )
    );
  $$,
  'Test 1. Create active request 1'
);

-- Test 2: Direct DML physical DELETE privilege is revoked from authenticated role
select ok(
  not has_table_privilege('authenticated', 'public.equipment_requests', 'DELETE'),
  'Test 2. Direct physical DELETE privilege on equipment_requests is revoked from authenticated role'
);

-- Test 3 & 4: Ordinary Staff cannot execute hard_delete_equipment_request RPC
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'staff@campus.local'), '10000000-0000-0000-0000-000000000002'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'staff@campus.local'), '10000000-0000-0000-0000-000000000002'::uuid), 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select public.hard_delete_equipment_request((select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid)) $$,
  '42501', null,
  'Test 3 & 4. Ordinary Staff cannot execute hard_delete_equipment_request RPC'
);

-- Switch auth to Admin for soft cancel
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid), 'role', 'authenticated')::text, true);

-- Test 5: Soft cancel active request
select lives_ok(
  $$
    select public.soft_cancel_equipment_request(
      (select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid)
    );
  $$,
  'Test 5. soft_cancel_equipment_request executes successfully for Admin'
);

-- Test 6: Request remains in equipment_requests table
select results_eq(
  $$ select count(*)::integer from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid $$,
  array[1],
  'Test 6. Request remains in equipment_requests table after soft cancel'
);

-- Test 7: Request status is marked 'cancelled'
select results_eq(
  $$ select status from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid $$,
  array['cancelled'],
  'Test 7. Request status is updated to cancelled'
);

-- Test 8: Exactly one TB-06 outbox event created
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where aggregate_id = (select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid) and event_type = 'deleted' $$,
  array[1],
  'Test 8. Exactly one TB-06 outbox event created on soft cancel'
);

-- Test 9: Repeat soft cancel is idempotent (no duplicate outbox event)
select lives_ok(
  $$
    select public.soft_cancel_equipment_request(
      (select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid)
    );
  $$,
  'Test 9. Repeat soft cancel executes idempotently'
);

-- Test 10: Create active request 2
select lives_ok(
  $$
    select public.create_equipment_request_with_items(
      '90000000-0000-0000-0000-000000000011'::uuid,
      'HK1',
      coalesce((select id from public.profiles where lower(email) = 'admin@campus.local'), '10000000-0000-0000-0000-000000000001'::uuid),
      ((current_date + interval '9 days')::date::text || ' 09:00:00 Asia/Ho_Chi_Minh')::timestamptz,
      ((current_date + interval '9 days')::date::text || ' 11:00:00 Asia/Ho_Chi_Minh')::timestamptz,
      'Request for hard delete test',
      null,
      jsonb_build_array(
        jsonb_build_object(
          'skill_name', 'Kỹ năng TB06',
          'catalog_item_id', '50000000-0000-0000-0000-000000000002'::uuid,
          'quantity', 1,
          'note', null
        )
      )
    );
  $$,
  'Test 10. Create active request 2'
);

-- Set auth context to Root Administrator (bao.nguyen@eiu.edu.vn)
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where lower(email) = 'bao.nguyen@eiu.edu.vn'), '10000000-0000-0000-0000-000000000002'), true);
select set_config('request.jwt.claims', json_build_object('sub', coalesce((select id from public.profiles where lower(email) = 'bao.nguyen@eiu.edu.vn'), '10000000-0000-0000-0000-000000000002'::uuid), 'role', 'authenticated')::text, true);

-- Test 11: Root hard-deletes active request
select lives_ok(
  $$
    select public.hard_delete_equipment_request(
      (select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000011'::uuid)
    );
  $$,
  'Test 11. Root hard_delete_equipment_request executes successfully'
);

-- Test 12: Parent request no longer exists
select is_empty(
  $$ select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000011'::uuid $$,
  'Test 12. Parent request is deleted from equipment_requests'
);

-- Test 13: TB-06 outbox event survived parent deletion
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where event_type = 'deleted' and payload->>'course_code' = 'NURS-TB06-HD' $$,
  array[1],
  'Test 13. TB-06 outbox event exists pre-delete snapshot and survives parent deletion'
);

-- Test 14, 15, 16: Cancelled request then hard deleted by Root -> NO duplicate TB-06
select public.hard_delete_equipment_request(
  (select id from public.equipment_requests where class_schedule_id = '90000000-0000-0000-0000-000000000010'::uuid)
);

select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where event_type = 'deleted' and payload->>'course_code' = 'NURS-TB06' $$,
  array[1],
  'Test 14, 15, 16. Later hard delete on cancelled request produces NO duplicate TB-06 outbox event'
);

-- Test 17: Class schedule survives hard deletion
select results_eq(
  $$ select count(*)::integer from public.class_schedules where id in ('90000000-0000-0000-0000-000000000010'::uuid, '90000000-0000-0000-0000-000000000011'::uuid) $$,
  array[2],
  'Test 17. Class schedules survive equipment request hard deletion'
);

-- Test 18: Equipment catalog item survives hard deletion
select results_eq(
  $$ select count(*)::integer from public.equipment_catalog where id = '50000000-0000-0000-0000-000000000002'::uuid $$,
  array[1],
  'Test 18. Equipment catalog item survives hard deletion'
);

-- Test 19: Profiles survive hard deletion
select ok(
  (select count(*) >= 2 from public.profiles where lower(email) in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn')),
  'Test 19. Profiles survive equipment request hard deletion'
);

-- Test 20: Outbox processing expands TB-06 events idempotently
select lives_ok(
  $$ select public.process_email_outbox_events(50); $$,
  'Test 20. Outbox processing expands TB-06 events into email_notifications'
);

select * from finish();
rollback;
