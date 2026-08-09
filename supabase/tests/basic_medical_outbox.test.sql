begin;
select plan(30);

-- Setup test fixtures
create temp table _test_context (
  admin_id uuid,
  staff_id uuid,
  staff_unscoped_id uuid,
  lecturer_id uuid,
  viewer_id uuid,
  course_id uuid,
  room_id uuid,
  registration_id uuid,
  session_id uuid,
  inventory_id uuid
);
grant select, update on table _test_context to authenticated, service_role;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_staff_id uuid := gen_random_uuid();
  v_staff_unscoped_id uuid := gen_random_uuid();
  v_lecturer_id uuid := gen_random_uuid();
  v_viewer_id uuid := gen_random_uuid();
  v_course_id uuid;
  v_room_id uuid;
  v_bm_room_type_id uuid;
  v_skills_room_type_id uuid;
begin
  select id into v_bm_room_type_id from public.room_types where code = 'basic_medical' limit 1;
  select id into v_skills_room_type_id from public.room_types where code = 'nursing_skills' limit 1;

  -- Create auth users
  insert into auth.users (id, email) values
    (v_admin_id, 'bm_admin@eiu.edu.vn'),
    (v_staff_id, 'bm_staff_scoped@eiu.edu.vn'),
    (v_staff_unscoped_id, 'bm_staff_unscoped@eiu.edu.vn'),
    (v_lecturer_id, 'bm_lecturer@eiu.edu.vn'),
    (v_viewer_id, 'bm_viewer@eiu.edu.vn')
  on conflict do nothing;

  -- Create / update profiles
  insert into public.profiles (id, email, full_name, is_active, title) values
    (v_admin_id, 'bm_admin@eiu.edu.vn', 'Admin BM User', true, 'chuyên viên'),
    (v_staff_id, 'bm_staff_scoped@eiu.edu.vn', 'Staff Scoped User', true, 'chuyên viên'),
    (v_staff_unscoped_id, 'bm_staff_unscoped@eiu.edu.vn', 'Staff Unscoped User', true, 'chuyên viên'),
    (v_lecturer_id, 'bm_lecturer@eiu.edu.vn', 'Lecturer BM User', true, 'giảng viên'),
    (v_viewer_id, 'bm_viewer@eiu.edu.vn', 'Viewer BM User', true, 'chuyên viên')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active,
    title = excluded.title;

  -- Assign roles
  insert into public.user_roles (user_id, role) values
    (v_admin_id, 'admin'),
    (v_staff_id, 'staff'),
    (v_staff_unscoped_id, 'staff'),
    (v_lecturer_id, 'lecturer'),
    (v_viewer_id, 'viewer')
  on conflict do nothing;

  -- Assign room type scopes
  insert into public.profile_room_types (profile_id, room_type_id) values
    (v_staff_id, v_bm_room_type_id),
    (v_staff_unscoped_id, v_skills_room_type_id),
    (v_lecturer_id, v_bm_room_type_id),
    (v_viewer_id, v_bm_room_type_id)
  on conflict do nothing;

  -- Create test course and room for basic_medical
  insert into public.courses (id, course_code, course_name, room_type_id, is_active)
  values (gen_random_uuid(), 'BM-101', 'Giải phẫu cơ bản', v_bm_room_type_id, true)
  returning id into v_course_id;

  insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
  values (gen_random_uuid(), 'BM-201', 'B2', 'Phòng Y cơ sở 201', v_bm_room_type_id, 30, true)
  returning id into v_room_id;

  -- Clean existing outbox events for pristine test isolation
  delete from public.email_outbox_events;

  insert into _test_context (admin_id, staff_id, staff_unscoped_id, lecturer_id, viewer_id, course_id, room_id)
  values (v_admin_id, v_staff_id, v_staff_unscoped_id, v_lecturer_id, v_viewer_id, v_course_id, v_room_id);
end;
$$;

-- Set delivery mode to live for clear outbox testing
update public.email_delivery_settings set delivery_mode = 'live';

--------------------------------------------------------------------------------
-- TEST GROUP 1: YC-P01 Create Registration
--------------------------------------------------------------------------------

-- Execute save_basic_medical_registration as Admin
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_context))::text, true);

do $$
declare
  v_reg_id uuid;
  v_ctx record;
begin
  select * into v_ctx from _test_context;

  v_reg_id := public.save_basic_medical_registration(
    null,
    '2026-2027',
    'HK1',
    '2026-09-01'::date,
    '2026-09-10'::date,
    v_ctx.course_id,
    v_ctx.room_id,
    30,
    v_ctx.lecturer_id,
    'Ghi chú tạo mới',
    jsonb_build_array(
      jsonb_build_object(
        'schedule_date', '2026-09-02',
        'start_time', '08:00',
        'end_time', '11:00',
        'lesson_title', 'Bài 1: Khám tổng quát',
        'teaching_lecturer_id', v_ctx.lecturer_id
      )
    )
  );

  update _test_context set registration_id = v_reg_id;
end;
$$;

select set_config('role', 'postgres', true);

-- 1. Create succeeds & registration ID returned
select isnt(registration_id, null, 'YC-P01: save_basic_medical_registration create returned non-null registration_id')
from _test_context;

-- 2. Exactly one outbox event created for YC-P01
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'created' $$,
  array[1],
  'YC-P01: Exactly one basic_medical_registration created event in outbox'
);

-- 3. Natural event_key format
select results_eq(
  $$ select event_key from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'created' $$,
  array[concat('basic_medical:registration:', (select registration_id from _test_context), ':created')],
  'YC-P01: Event key matches basic_medical:registration:<id>:created'
);

-- 4. Parent payload snapshot
select results_eq(
  $$ select payload->>'academic_year' from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'created' $$,
  array['2026-2027'],
  'YC-P01: Payload snapshots academic_year correctly'
);

-- 5. Sessions list snapshotted
select results_eq(
  $$ select jsonb_array_length(payload->'schedules')::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'created' $$,
  array[1],
  'YC-P01: Payload contains exactly 1 session schedule'
);

-- 6. Recipient matrix exactness (Admin, Scoped Staff, Responsible Lecturer/Registrant. NO Viewer, NO unscoped Staff)
select results_eq(
  $$ select count(*)::integer from (
       select jsonb_array_elements(recipients)->>'recipient_id' as r_id
       from public.email_outbox_events
       where domain = 'basic_medical_registration' and event_type = 'created'
     ) sub
     where r_id in ((select viewer_id from _test_context)::text, (select staff_unscoped_id from _test_context)::text) $$,
  array[0],
  'YC-P01: Recipient list excludes Viewer and Unscoped Staff'
);

-- 7. No child schedule email/outbox event created for Basic Medical manual create (YC-L01 suppressed)
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'skills_lab_schedule' or event_type = 'class_schedule_created' $$,
  array[0],
  'YC-P01 / YC-L01: No child class_schedule outbox event generated'
);

--------------------------------------------------------------------------------
-- TEST GROUP 2: YC-P02 Adjust Registration
--------------------------------------------------------------------------------

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_context))::text, true);

do $$
declare
  v_ctx record;
begin
  select * into v_ctx from _test_context;

  perform public.save_basic_medical_registration(
    v_ctx.registration_id,
    '2026-2027',
    'HK1',
    '2026-09-01'::date,
    '2026-09-12'::date,
    v_ctx.course_id,
    v_ctx.room_id,
    35,
    v_ctx.lecturer_id,
    'Ghi chú đã điều chỉnh',
    jsonb_build_array(
      jsonb_build_object(
        'schedule_date', '2026-09-03',
        'start_time', '09:00',
        'end_time', '12:00',
        'lesson_title', 'Bài 1: Khám tổng quát (Đã đổi ngày)',
        'teaching_lecturer_id', v_ctx.lecturer_id
      )
    )
  );
end;
$$;

select set_config('role', 'postgres', true);

-- 8. Exactly one updated event created for YC-P02
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'updated' $$,
  array[1],
  'YC-P02: Exactly one basic_medical_registration updated event in outbox'
);

-- 9. Updated event key contains mutation_id UUID prefix
select results_eq(
  $$ select (event_key like concat('basic_medical:registration:', (select registration_id from _test_context), ':updated:%')) from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'updated' $$,
  array[true],
  'YC-P02: Event key matches basic_medical:registration:<id>:updated:<mutation_id>'
);

-- 10. Post-update payload snapshot
select results_eq(
  $$ select (payload->>'student_count')::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'updated' $$,
  array[35],
  'YC-P02: Payload reflects updated student count'
);

-- 11. Second legitimate update creates second updated event
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_context))::text, true);

do $$
declare
  v_ctx record;
begin
  select * into v_ctx from _test_context;
  perform public.save_basic_medical_registration(
    v_ctx.registration_id,
    '2026-2027',
    'HK1',
    '2026-09-01'::date,
    '2026-09-12'::date,
    v_ctx.course_id,
    v_ctx.room_id,
    40,
    v_ctx.lecturer_id,
    'Điều chỉnh lần 2',
    jsonb_build_array(
      jsonb_build_object(
        'schedule_date', '2026-09-03',
        'start_time', '09:00',
        'end_time', '12:00',
        'lesson_title', 'Bài 1: Khám tổng quát (Đã đổi ngày)',
        'teaching_lecturer_id', v_ctx.lecturer_id
      )
    )
  );
end;
$$;

select set_config('role', 'postgres', true);

select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'updated' $$,
  array[2],
  'YC-P02: Second legitimate update creates second outbox event'
);

--------------------------------------------------------------------------------
-- TEST GROUP 3: YC-P03 Cancel Registration
--------------------------------------------------------------------------------

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_context))::text, true);

do $$
declare
  v_ctx record;
begin
  select * into v_ctx from _test_context;
  perform public.cancel_basic_medical_registration(v_ctx.registration_id, 'Hủy lịch thử nghiệm');
end;
$$;

select set_config('role', 'postgres', true);

-- 12. Exactly one cancelled event created for YC-P03
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'cancelled' $$,
  array[1],
  'YC-P03: Exactly one basic_medical_registration cancelled event in outbox'
);

-- 13. Event key matches basic_medical:registration:<id>:cancelled
select results_eq(
  $$ select event_key from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'cancelled' $$,
  array[concat('basic_medical:registration:', (select registration_id from _test_context), ':cancelled')],
  'YC-P03: Event key matches basic_medical:registration:<id>:cancelled'
);

-- 14. Pre-cancel payload snapshot preserved
select results_eq(
  $$ select payload->>'course_code' from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'cancelled' $$,
  array[(select course_code from public.courses where id = (select course_id from _test_context))],
  'YC-P03: Pre-cancel snapshot preserves course_code'
);

-- 15. Repeat cancel returns already_cancelled: true and emits 0 new events
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from _test_context))::text, true);

do $$
declare
  v_res jsonb;
begin
  v_res := public.cancel_basic_medical_registration((select registration_id from _test_context), 'Hủy lại');
  if (v_res->>'already_cancelled')::boolean is not true then
    raise exception 'Expected already_cancelled true';
  end if;
end;
$$;

select set_config('role', 'postgres', true);

select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_registration' and event_type = 'cancelled' $$,
  array[1],
  'YC-P03: Repeat cancellation emits no second outbox event'
);

--------------------------------------------------------------------------------
-- TEST GROUP 4: YC-E01 Equipment Damage Report
--------------------------------------------------------------------------------

-- Create session confirmation fixture for testing YC-E01
do $$
declare
  v_ctx record;
  v_sess_id uuid;
  v_inv_id uuid;
  v_session_date date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date - 1;
  v_png_sig text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  v_conf_res jsonb;
begin
  select * into v_ctx from _test_context;

  -- Ensure inventory item exists for the room
  insert into public.basic_medical_equipment_catalog (item_name, unit, is_active)
  values ('Mô hình tim 3D', 'Bộ', true)
  returning id into v_inv_id;

  insert into public.basic_medical_room_inventory (room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity, is_active)
  values (v_ctx.room_id, v_inv_id, 10, 10, 0, true)
  returning id into v_inv_id;

  -- Create active session
  insert into public.basic_medical_registrations (academic_year, semester, start_date, end_date, course_id, room_id, student_count, registrant_id, responsible_lecturer_id, created_by)
  values ('2026-2027', 'HK1', v_session_date, v_session_date, v_ctx.course_id, v_ctx.room_id, 20, v_ctx.lecturer_id, v_ctx.lecturer_id, v_ctx.lecturer_id)
  returning id into v_ctx.registration_id;

  insert into public.class_schedules (course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date, start_time, end_time, schedule_status, published_by, published_at, student_count, created_by, basic_medical_registration_id)
  values (v_ctx.course_id, 'BM-101', 'Giải phẫu cơ bản', v_ctx.room_id, v_ctx.lecturer_id, v_session_date, '08:00', '10:00', 'published', v_ctx.lecturer_id, clock_timestamp(), 20, v_ctx.lecturer_id, v_ctx.registration_id)
  returning id into v_sess_id;

  insert into public.basic_medical_registration_sessions (registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
  values (v_ctx.registration_id, v_sess_id, 'Buổi thử nghiệm thiết bị', v_ctx.lecturer_id, 1)
  returning id into v_sess_id;

  update _test_context set session_id = v_sess_id, inventory_id = v_inv_id;
end;
$$;

-- Test Case 16: All Good confirmation produces 0 damage outbox events
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select lecturer_id from _test_context))::text, true);

do $$
declare
  v_ctx record;
  v_png_sig text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
begin
  select * into v_ctx from _test_context;

  perform public.confirm_basic_medical_session(
    v_ctx.session_id,
    v_png_sig,
    jsonb_build_array(
      jsonb_build_object(
        'inventory_id', v_ctx.inventory_id,
        'newly_damaged_quantity', 0
      )
    )
  );
end;
$$;

select set_config('role', 'postgres', true);

-- 16. All Good confirmation emits 0 damage outbox events
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_damage' $$,
  array[0],
  'YC-E01: All Good confirmation emits 0 damage outbox events'
);

-- Test Case 17: Damage confirmation produces exactly 1 damage outbox event
do $$
declare
  v_ctx record;
  v_sess_id uuid;
  v_png_sig text := 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
begin
  select * into v_ctx from _test_context;

  -- Create a second session for damage test
  insert into public.class_schedules (course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date, start_time, end_time, schedule_status, published_by, published_at, student_count, created_by, basic_medical_registration_id)
  values (v_ctx.course_id, 'BM-101', 'Giải phẫu cơ bản', v_ctx.room_id, v_ctx.lecturer_id, (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date - 1, '10:00', '12:00', 'published', v_ctx.lecturer_id, clock_timestamp(), 20, v_ctx.lecturer_id, v_ctx.registration_id)
  returning id into v_sess_id;

  insert into public.basic_medical_registration_sessions (registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
  values (v_ctx.registration_id, v_sess_id, 'Buổi thử nghiệm báo hư', v_ctx.lecturer_id, 2)
  returning id into v_sess_id;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ctx.lecturer_id)::text, true);

  perform public.confirm_basic_medical_session(
    v_sess_id,
    v_png_sig,
    jsonb_build_array(
      jsonb_build_object(
        'inventory_id', v_ctx.inventory_id,
        'newly_damaged_quantity', 2
      )
    )
  );
end;
$$;

select set_config('role', 'postgres', true);

-- 17. Confirmation with newly damaged quantity > 0 creates exactly 1 damage outbox event
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_damage' $$,
  array[1],
  'YC-E01: Newly damaged > 0 creates exactly 1 damage outbox event'
);

-- 18. Recipient matrix for damage event excludes Viewer and Reporter (unless Admin/Staff)
select results_eq(
  $$ select count(*)::integer from (
       select jsonb_array_elements(recipients)->>'recipient_id' as r_id
       from public.email_outbox_events
       where domain = 'basic_medical_damage'
     ) sub
     where r_id in ((select viewer_id from _test_context)::text, (select lecturer_id from _test_context)::text) $$,
  array[0],
  'YC-E01: Damage event recipient matrix excludes Viewer and Lecturer-reporter'
);

--------------------------------------------------------------------------------
-- TEST GROUP 5: Processor & Security & Delivery Modes
--------------------------------------------------------------------------------

-- 19. process_email_outbox_events execution by authenticated is DENIED
select ok(
  not has_function_privilege('authenticated', 'public.process_email_outbox_events(integer)', 'EXECUTE'),
  'Security: process_email_outbox_events denied for authenticated role'
);

-- 20. process_email_outbox_events execution by service_role processes outbox events into email_notifications
select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.process_email_outbox_events(50) $$,
  'Processor runs successfully under service_role'
);
select set_config('role', 'postgres', true);

-- 21. Notifications expanded into email_notifications table
select results_eq(
  $$ select count(*)::integer > 0 from public.email_notifications where notification_type like 'basic_medical_%' $$,
  array[true],
  'Processor expanded basic_medical outbox events into email_notifications'
);

-- 22. FK Guard: deleted recipient profile is skipped cleanly
do $$
declare
  v_dummy_id uuid := gen_random_uuid();
  v_outbox_id uuid;
begin
  insert into auth.users (id, email) values (v_dummy_id, 'dummy_recipient@eiu.edu.vn') on conflict do nothing;
  insert into public.profiles (id, email, full_name, is_active)
  values (v_dummy_id, 'dummy_recipient@eiu.edu.vn', 'Dummy Recipient', true)
  on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, is_active = true;

  insert into public.email_outbox_events (
    domain, event_type, event_key, payload, recipients, delivery_mode_at_event, status
  ) values (
    'basic_medical_registration', 'created', concat('basic_medical:registration:fk_test:', gen_random_uuid()),
    '{"registrant_name": "FK Test"}'::jsonb,
    jsonb_build_array(jsonb_build_object('recipient_id', v_dummy_id, 'recipient_email', 'dummy_recipient@eiu.edu.vn')),
    'live', 'pending'
  ) returning id into v_outbox_id;

  delete from public.profiles where id = v_dummy_id;
end;
$$;

select set_config('role', 'service_role', true);
select lives_ok(
  $$ select public.process_email_outbox_events(50) $$,
  'Processor cleanly skips deleted recipient profile without error'
);
select set_config('role', 'postgres', true);

-- 23. Delivery mode OFF suppresses outbox events and email_notifications
do $$
declare
  v_ctx record;
begin
  select * into v_ctx from _test_context;
  update public.email_delivery_settings set delivery_mode = 'off';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ctx.admin_id)::text, true);

  perform public.save_basic_medical_registration(
    null,
    '2026-2027',
    'HK1',
    '2026-09-01'::date,
    '2026-09-10'::date,
    v_ctx.course_id,
    v_ctx.room_id,
    20,
    v_ctx.lecturer_id,
    'Off mode test',
    jsonb_build_array(
      jsonb_build_object(
        'schedule_date', '2026-09-05',
        'start_time', '08:00',
        'end_time', '10:00',
        'lesson_title', 'Bài Off mode',
        'teaching_lecturer_id', v_ctx.lecturer_id
      )
    )
  );
end;
$$;

select set_config('role', 'postgres', true);

-- Process suppressed outbox under service_role
select set_config('role', 'service_role', true);
select public.process_email_outbox_events(50);
select set_config('role', 'postgres', true);

-- 24. Off mode event status is suppressed
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where delivery_mode_at_event = 'off' and status = 'suppressed' $$,
  array[1],
  'Delivery mode OFF: Outbox event status set to suppressed'
);

-- 25. Off mode email_notifications status is suppressed
select results_eq(
  $$ select count(*)::integer > 0 from public.email_notifications where delivery_mode_at_enqueue = 'off' and status = 'suppressed' $$,
  array[true],
  'Delivery mode OFF: Notification status set to suppressed'
);

-- 26. Switching OFF -> LIVE does not re-process suppressed events
update public.email_delivery_settings set delivery_mode = 'live';

select set_config('role', 'service_role', true);
select public.process_email_outbox_events(50);
select set_config('role', 'postgres', true);

select results_eq(
  $$ select count(*)::integer from public.email_notifications where delivery_mode_at_enqueue = 'off' and status = 'pending' $$,
  array[0],
  'Delivery mode OFF -> LIVE: Suppressed events are NOT re-sent'
);

-- 27. Processor replay is idempotent (no duplicate email_notifications inserted)
select set_config('role', 'service_role', true);
select public.process_email_outbox_events(50);
select set_config('role', 'postgres', true);

select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where status = 'pending' $$,
  array[0],
  'Processor replay: 0 pending outbox events remain'
);

--------------------------------------------------------------------------------
-- TEST GROUP 6: Security & Regression Guarantees
--------------------------------------------------------------------------------

-- 28. Private enqueue registration function denies authenticated execute
select ok(
  not has_function_privilege('authenticated', 'private.enqueue_basic_medical_registration_outbox_event(uuid, text, uuid, uuid)', 'EXECUTE'),
  'Security: Private enqueue registration function denied to authenticated'
);

-- 29. Private enqueue damage function denies authenticated execute
select ok(
  not has_function_privilege('authenticated', 'private.enqueue_basic_medical_damage_outbox_event(uuid, uuid)', 'EXECUTE'),
  'Security: Private enqueue damage function denied to authenticated'
);

-- 30. Direct DML on email_outbox_events denied for authenticated
select ok(
  not has_table_privilege('authenticated', 'public.email_outbox_events', 'INSERT'),
  'Security: Direct INSERT into email_outbox_events denied for authenticated'
);

-- 31. Regression: No corrupted outbox domains present
select results_eq(
  $$ select count(*)::integer from public.email_outbox_events where domain not in ('basic_medical_registration', 'basic_medical_damage') $$,
  array[0],
  'Regression: No corrupted outbox domains present'
);

select * from finish();
rollback;
