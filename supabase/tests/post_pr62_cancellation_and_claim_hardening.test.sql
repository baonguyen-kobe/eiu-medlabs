begin;
select plan(19);

-- 1. Helper function non-executable by authenticated & anon
select ok(
  not has_function_privilege('authenticated', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE'),
  'authenticated has NO execute privilege on private.class_schedule_has_equipment_request'
);

select ok(
  not has_function_privilege('anon', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE'),
  'anon has NO execute privilege on private.class_schedule_has_equipment_request'
);

-- 2. claim_class RPC contains CLASS_EQUIPMENT_REQUEST_EXISTS guard
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.claim_class(uuid)'::regprocedure)) > 0,
  'claim_class contains CLASS_EQUIPMENT_REQUEST_EXISTS guard'
);

-- 3. claim_class RPC contains private.class_schedule_has_equipment_request check
select ok(
  position('private.class_schedule_has_equipment_request' in pg_get_functiondef('public.claim_class(uuid)'::regprocedure)) > 0,
  'claim_class calls private.class_schedule_has_equipment_request'
);

-- 4. cancel_basic_medical_session contains expanded authorization logic
select ok(
  position('registration_creator_id = actor_id' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0
  and position('session_row.teaching_lecturer_id = actor_id' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0
  and position('private.is_admin()' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0,
  'cancel_basic_medical_session authorizes Admin, Registration Creator, and Session Teaching Lecturer'
);

-- 5. cancel_basic_medical_session preserves confirmation invalidation guard
select ok(
  position('BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0,
  'cancel_basic_medical_session preserves BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED guard'
);

-- 6. cancel_basic_medical_session enforces reason required
select ok(
  position('BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0,
  'cancel_basic_medical_session requires non-blank cancellation reason'
);

-- 7. cancel_basic_medical_session records cancelled_at, cancelled_by, and cancellation_reason
select ok(
  position('cancellation_reason = normalized_reason' in pg_get_functiondef('public.cancel_basic_medical_session(uuid,text)'::regprocedure)) > 0,
  'cancel_basic_medical_session records normalized cancellation_reason on session row'
);

-- Context & Users Setup
create temp table post_pr62_test_ctx (
  admin_id uuid,
  creator_id uuid,
  lecturer_id uuid,
  unrelated_id uuid,
  skills_room_id uuid,
  basic_room_id uuid,
  skills_course_id uuid,
  basic_course_id uuid
);

do $$
declare
  v_skills_room_type uuid;
  v_basic_room_type uuid;
  v_admin uuid := '99000000-0000-4000-8000-000000000001'::uuid;
  v_creator uuid := '99000000-0000-4000-8000-000000000002'::uuid;
  v_lecturer uuid := '99000000-0000-4000-8000-000000000003'::uuid;
  v_unrelated uuid := '99000000-0000-4000-8000-000000000004'::uuid;
  v_skills_room uuid := '99000000-0000-4000-8000-000000000005'::uuid;
  v_basic_room uuid := '99000000-0000-4000-8000-000000000006'::uuid;
  v_skills_course uuid := '99000000-0000-4000-8000-000000000007'::uuid;
  v_basic_course uuid := '99000000-0000-4000-8000-000000000008'::uuid;
begin
  select id into strict v_skills_room_type from public.room_types where code = 'nursing_skills';
  select id into strict v_basic_room_type from public.room_types where code = 'basic_medical';

  insert into auth.users (id, email) values
    (v_admin, 'post62-admin@test.local'),
    (v_creator, 'post62-creator@test.local'),
    (v_lecturer, 'post62-lecturer@test.local'),
    (v_unrelated, 'post62-unrelated@test.local');

  update public.profiles set full_name = 'Admin Post62', is_active = true where id = v_admin;
  update public.profiles set full_name = 'Creator Post62', is_active = true where id = v_creator;
  update public.profiles set full_name = 'Lecturer Post62', is_active = true where id = v_lecturer;
  update public.profiles set full_name = 'Unrelated Post62', is_active = true where id = v_unrelated;

  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'),
    (v_creator, 'lecturer'),
    (v_lecturer, 'lecturer'),
    (v_unrelated, 'lecturer')
  on conflict (user_id, role) do nothing;

  insert into public.profile_room_types (profile_id, room_type_id) values
    (v_admin, v_skills_room_type),
    (v_admin, v_basic_room_type),
    (v_creator, v_basic_room_type),
    (v_creator, v_skills_room_type),
    (v_lecturer, v_basic_room_type),
    (v_lecturer, v_skills_room_type),
    (v_unrelated, v_basic_room_type),
    (v_unrelated, v_skills_room_type)
  on conflict (profile_id, room_type_id) do nothing;

  insert into public.courses (id, course_code, course_name, room_type_id, is_active) values
    (v_skills_course, 'KN-TEST', 'Kỹ năng test', v_skills_room_type, true),
    (v_basic_course, 'YCS-TEST', 'Y cơ sở test', v_basic_room_type, true);

  insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active) values
    (v_skills_room, 'KN-R1', 'B1', 'Phòng KN test', v_skills_room_type, 30, true),
    (v_basic_room, 'YCS-R1', 'B2', 'Phòng YCS test', v_basic_room_type, 30, true);

  insert into post_pr62_test_ctx values (
    v_admin, v_creator, v_lecturer, v_unrelated,
    v_skills_room, v_basic_room, v_skills_course, v_basic_course
  );
end $$;

-- 8. Functional test: claim_class with equipment lock
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_req_id uuid;
  v_sched_date date := (current_date + interval '5 days')::date;
begin
  select * into strict ctx from post_pr62_test_ctx;

  -- Create a future class schedule without equipment request
  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-01', 'Kỹ năng 1', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 30, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  -- Create an equipment request for this schedule as admin actor
  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  insert into public.equipment_requests (
    class_schedule_id, registrant_id, responsible_lecturer_id, created_by, phone_snapshot, email_snapshot, receive_at, return_at, status, semester
  ) values (
    v_schedule_id, ctx.lecturer_id, ctx.lecturer_id, ctx.admin_id, '0901234567', 'post62-lecturer@test.local',
    (v_sched_date::text || ' 09:00:00+07')::timestamptz, (v_sched_date::text || ' 16:00:00+07')::timestamptz, 'new', 'HK1'
  ) returning id into v_req_id;

  -- Test helper directly as postgres superuser
  if not (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report true when equipment request exists';
  end if;

  -- Soft-cancel equipment request: still locks
  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  update public.equipment_requests set status = 'cancelled' where id = v_req_id;
  perform set_config('app.equipment_confirmation_rpc', 'false', true);

  if not (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report true even when equipment request is soft-cancelled';
  end if;

  -- Hard-delete equipment request: unlocks
  delete from public.equipment_requests where id = v_req_id;
  if (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report false after equipment request is hard-deleted';
  end if;
end $$;
select pass('class_schedule_has_equipment_request reports true for active and soft-cancelled, false for hard-deleted');

-- 9. Functional verification of cancel_basic_medical_session
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_reg_id uuid;
  v_sched_id uuid;
  v_session_id uuid;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;

  -- Create a basic medical registration
  insert into public.basic_medical_registrations (
    registration_code, course_id, room_id, registrant_id, responsible_lecturer_id,
    academic_year, semester, start_date, end_date, student_count, created_by
  ) values (
    'YCS-TEST-999', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  -- Create schedule and session
  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-01', 'Y cơ sở 1', ctx.basic_room_id, (current_date + interval '6 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài 1: Giới thiệu mô hình', ctx.lecturer_id
  ) returning id into v_session_id;

  -- Act as unrelated user: should fail with 42501
  perform set_config('request.jwt.claim.sub', ctx.unrelated_id::text, true);
  begin
    perform public.cancel_basic_medical_session(v_session_id, 'Hủy bởi người không liên quan');
    raise exception 'Unrelated user should be forbidden from canceling session';
  exception when sqlstate '42501' then
    -- expected
  end;

  -- Act as teaching lecturer: should succeed
  perform set_config('request.jwt.claim.sub', ctx.lecturer_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Điều chỉnh lịch học theo yêu cầu Bộ môn');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Session cancellation failed for teaching lecturer';
  end if;

  -- Verify session fields
  if not exists (
    select 1 from public.basic_medical_registration_sessions
    where id = v_session_id
      and cancelled_at is not null
      and cancelled_by = ctx.lecturer_id
      and cancellation_reason = 'Điều chỉnh lịch học theo yêu cầu Bộ môn'
  ) then
    raise exception 'Session cancellation fields not properly recorded';
  end if;

  -- Verify linked schedule status
  if not exists (
    select 1 from public.class_schedules
    where id = v_sched_id
      and schedule_status = 'cancelled'
      and cancelled_by = ctx.lecturer_id
  ) then
    raise exception 'Linked class schedule status not set to cancelled';
  end if;
end $$;
select pass('cancel_basic_medical_session allows teaching lecturer, denies unrelated user, and records metadata correctly');

-- 10. Repeat / idempotent cancellation
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_session_id uuid;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select id into v_session_id from public.basic_medical_registration_sessions where cancelled_at is not null limit 1;
  perform set_config('request.jwt.claim.sub', ctx.lecturer_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Lặp lại');
  if (v_result->>'idempotent')::boolean is not true then
    raise exception 'Expected idempotent = true on second cancellation';
  end if;
end $$;
select pass('cancel_basic_medical_session is safe and idempotent on repeated invocation');

-- 11. Blank reason rejected
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_session_id uuid;
  v_admin_id uuid;
begin
  select * into strict ctx from post_pr62_test_ctx;
  v_admin_id := ctx.admin_id;
  select id into v_session_id from public.basic_medical_registration_sessions limit 1;
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  begin
    perform public.cancel_basic_medical_session(v_session_id, '   ');
    raise exception 'Blank reason should have been rejected';
  exception when sqlstate '22023' then
    -- expected
  end;
end $$;
select pass('cancel_basic_medical_session rejects whitespace-only cancellation reason');

-- 12. Active confirmation blocks cancellation
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_reg_id uuid;
  v_sched_id uuid;
  v_session_id uuid;
  v_conf_id uuid;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.basic_medical_registrations (
    registration_code, course_id, room_id, registrant_id, responsible_lecturer_id,
    academic_year, semester, start_date, end_date, student_count, created_by
  ) values (
    'YCS-TEST-CONF', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-01', 'Y cơ sở 1', ctx.basic_room_id, (current_date + interval '7 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài 2: Thực hành', ctx.lecturer_id
  ) returning id into v_session_id;

  -- Add active confirmation with snapshots
  insert into public.basic_medical_session_confirmations (
    session_id, signer_id, signature_data,
    registration_id_snapshot, class_schedule_id_snapshot,
    schedule_date_snapshot, start_time_snapshot, end_time_snapshot,
    room_id_snapshot, teaching_lecturer_id_snapshot
  ) values (
    v_session_id, ctx.lecturer_id, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    v_reg_id, v_sched_id,
    (current_date + interval '7 days')::date, '08:00', '11:30',
    ctx.basic_room_id, ctx.lecturer_id
  ) returning id into v_conf_id;

  -- Attempt cancel by Admin: should fail with 22023 (BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED)
  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  begin
    perform public.cancel_basic_medical_session(v_session_id, 'Hủy khi đang có xác nhận active');
    raise exception 'Should reject cancellation when active confirmation exists';
  exception when sqlstate '22023' then
    -- expected
  end;
end $$;
select pass('cancel_basic_medical_session blocks cancellation when active confirmation exists');

-- 13. Registration creator cancel allowed
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_reg_id uuid;
  v_sched_id uuid;
  v_session_id uuid;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.basic_medical_registrations (
    registration_code, course_id, room_id, registrant_id, responsible_lecturer_id,
    academic_year, semester, start_date, end_date, student_count, created_by
  ) values (
    'YCS-TEST-CREATOR', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-01', 'Y cơ sở 1', ctx.basic_room_id, (current_date + interval '8 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài 3: Lâm sàng', ctx.lecturer_id
  ) returning id into v_session_id;

  -- Creator cancels: should succeed
  perform set_config('request.jwt.claim.sub', ctx.creator_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Người tạo phiếu hủy buổi học');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Creator cancel failed';
  end if;
end $$;
select pass('cancel_basic_medical_session allows registration creator to cancel session');

-- 14. Admin cancel allowed
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_reg_id uuid;
  v_sched_id uuid;
  v_session_id uuid;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.basic_medical_registrations (
    registration_code, course_id, room_id, registrant_id, responsible_lecturer_id,
    academic_year, semester, start_date, end_date, student_count, created_by
  ) values (
    'YCS-TEST-ADMIN', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-01', 'Y cơ sở 1', ctx.basic_room_id, (current_date + interval '9 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài 4: Khảo sát', ctx.lecturer_id
  ) returning id into v_session_id;

  -- Admin cancels: should succeed
  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Admin hủy buổi học theo yêu cầu');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Admin cancel failed';
  end if;
end $$;
select pass('cancel_basic_medical_session allows Admin to cancel session');

-- 15. Unauthenticated user denied
do $$
declare
  v_session_id uuid;
begin
  select id into v_session_id from public.basic_medical_registration_sessions limit 1;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.cancel_basic_medical_session(v_session_id, 'Hủy ẩn danh');
    raise exception 'Anonymous user should be denied';
  exception when sqlstate '42501' then
    -- expected
  end;
end $$;
select pass('cancel_basic_medical_session denies unauthenticated user');

-- 16. Audit log inserted with correct action and entity_type
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'basic_medical.session_cancelled'
      and entity_type = 'basic_medical_registration_session'
  ),
  'audit_logs receives basic_medical.session_cancelled event'
);

-- 17. Outbox event enqueued for session cancellation
select ok(
  exists (
    select 1 from public.email_outbox_events
    where domain = 'basic_medical_schedule'
      and event_type = 'schedule_cancelled'
  ),
  'email_outbox_events receives schedule_cancelled event'
);

-- 18. Grants on functions
select ok(
  has_function_privilege('authenticated', 'public.claim_class(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancel_basic_medical_session(uuid, text)', 'EXECUTE'),
  'authenticated has EXECUTE on public.claim_class and public.cancel_basic_medical_session'
);

rollback;
