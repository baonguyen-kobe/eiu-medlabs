begin;
select plan(29);

-- 1. Helper function non-executable by public, anon, authenticated
select ok(
  not has_function_privilege('public', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE'),
  'public has NO execute privilege on private.class_schedule_has_equipment_request'
);

select ok(
  not has_function_privilege('anon', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE'),
  'anon has NO execute privilege on private.class_schedule_has_equipment_request'
);

select ok(
  not has_function_privilege('authenticated', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE'),
  'authenticated has NO execute privilege on private.class_schedule_has_equipment_request'
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
  claim_lecturer_id uuid,
  unrelated_lecturer_id uuid,
  unrelated_staff_id uuid,
  unrelated_ta_id uuid,
  unrelated_viewer_id uuid,
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
  v_claim_lecturer uuid := '99000000-0000-4000-8000-000000000004'::uuid;
  v_unrelated_lecturer uuid := '99000000-0000-4000-8000-000000000005'::uuid;
  v_unrelated_staff uuid := '99000000-0000-4000-8000-000000000006'::uuid;
  v_unrelated_ta uuid := '99000000-0000-4000-8000-000000000007'::uuid;
  v_unrelated_viewer uuid := '99000000-0000-4000-8000-000000000008'::uuid;
  v_skills_room uuid := '99000000-0000-4000-8000-000000000009'::uuid;
  v_basic_room uuid := '99000000-0000-4000-8000-000000000010'::uuid;
  v_skills_course uuid := '99000000-0000-4000-8000-000000000011'::uuid;
  v_basic_course uuid := '99000000-0000-4000-8000-000000000012'::uuid;
begin
  select id into strict v_skills_room_type from public.room_types where code = 'nursing_skills';
  select id into strict v_basic_room_type from public.room_types where code = 'basic_medical';

  insert into auth.users (id, email) values
    (v_admin, 'post62-admin@test.local'),
    (v_creator, 'post62-creator@test.local'),
    (v_lecturer, 'post62-lecturer@test.local'),
    (v_claim_lecturer, 'post62-claim-lecturer@test.local'),
    (v_unrelated_lecturer, 'post62-unrelated-lec@test.local'),
    (v_unrelated_staff, 'post62-unrelated-staff@test.local'),
    (v_unrelated_ta, 'post62-unrelated-ta@test.local'),
    (v_unrelated_viewer, 'post62-unrelated-viewer@test.local');

  update public.profiles set full_name = 'Admin Post62', is_active = true where id = v_admin;
  update public.profiles set full_name = 'Creator Post62', is_active = true where id = v_creator;
  update public.profiles set full_name = 'Lecturer Post62', is_active = true where id = v_lecturer;
  update public.profiles set full_name = 'Claim Lecturer Post62', is_active = true where id = v_claim_lecturer;
  update public.profiles set full_name = 'Unrelated Lec Post62', is_active = true where id = v_unrelated_lecturer;
  update public.profiles set full_name = 'Unrelated Staff Post62', is_active = true where id = v_unrelated_staff;
  update public.profiles set full_name = 'Unrelated TA Post62', is_active = true where id = v_unrelated_ta;
  update public.profiles set full_name = 'Unrelated Viewer Post62', is_active = true where id = v_unrelated_viewer;

  insert into public.user_roles (user_id, role) values
    (v_admin, 'admin'),
    (v_creator, 'lecturer'),
    (v_lecturer, 'lecturer'),
    (v_claim_lecturer, 'lecturer'),
    (v_unrelated_lecturer, 'lecturer'),
    (v_unrelated_staff, 'staff'),
    (v_unrelated_ta, 'teaching_assistant'),
    (v_unrelated_viewer, 'viewer')
  on conflict (user_id, role) do nothing;

  insert into public.profile_room_types (profile_id, room_type_id) values
    (v_admin, v_skills_room_type),
    (v_admin, v_basic_room_type),
    (v_creator, v_basic_room_type),
    (v_creator, v_skills_room_type),
    (v_lecturer, v_basic_room_type),
    (v_lecturer, v_skills_room_type),
    (v_claim_lecturer, v_skills_room_type),
    (v_unrelated_lecturer, v_basic_room_type),
    (v_unrelated_staff, v_basic_room_type),
    (v_unrelated_ta, v_basic_room_type),
    (v_unrelated_viewer, v_basic_room_type)
  on conflict (profile_id, room_type_id) do nothing;

  insert into public.courses (id, course_code, course_name, room_type_id, is_active) values
    (v_skills_course, 'KN-TEST', 'Kỹ năng test', v_skills_room_type, true),
    (v_basic_course, 'YCS-TEST', 'Y cơ sở test', v_basic_room_type, true);

  insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active) values
    (v_skills_room, 'KN-R1', 'B1', 'Phòng KN test', v_skills_room_type, 30, true),
    (v_basic_room, 'YCS-R1', 'B2', 'Phòng YCS test', v_basic_room_type, 30, true);

  insert into post_pr62_test_ctx values (
    v_admin, v_creator, v_lecturer, v_claim_lecturer,
    v_unrelated_lecturer, v_unrelated_staff, v_unrelated_ta, v_unrelated_viewer,
    v_skills_room, v_basic_room, v_skills_course, v_basic_course
  );
end $$;

-- 8. Helper test: class_schedule_has_equipment_request reports true for active and soft-cancelled, false for hard-deleted
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_req_id uuid;
  v_sched_date date := (current_date + interval '5 days')::date;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-01', 'Kỹ năng 1', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 30, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  insert into public.equipment_requests (
    class_schedule_id, registrant_id, responsible_lecturer_id, created_by, phone_snapshot, email_snapshot, receive_at, return_at, status, semester
  ) values (
    v_schedule_id, ctx.lecturer_id, ctx.lecturer_id, ctx.admin_id, '0901234567', 'post62-lecturer@test.local',
    (v_sched_date::text || ' 09:00:00+07')::timestamptz, (v_sched_date::text || ' 16:00:00+07')::timestamptz, 'new', 'HK1'
  ) returning id into v_req_id;

  if not (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report true when equipment request exists';
  end if;

  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  update public.equipment_requests set status = 'cancelled' where id = v_req_id;
  perform set_config('app.equipment_confirmation_rpc', 'false', true);

  if not (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report true even when equipment request is soft-cancelled';
  end if;

  delete from public.equipment_requests where id = v_req_id;
  if (select private.class_schedule_has_equipment_request(v_schedule_id)) then
    raise exception 'Helper should report false after equipment request is hard-deleted';
  end if;
end $$;
select pass('class_schedule_has_equipment_request reports true for active and soft-cancelled, false for hard-deleted');

-- 9. CASE C1 — UNLOCKED: Eligible Lecturer claims future class with no equipment request
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_sched_date date := (current_date + interval '6 days')::date;
  v_claimed public.class_schedules;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-C1', 'Kỹ năng C1', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 25, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  -- Authenticate as eligible lecturer
  perform set_config('request.jwt.claim.sub', ctx.claim_lecturer_id::text, true);
  v_claimed := public.claim_class(v_schedule_id);

  if v_claimed.lecturer_id <> ctx.claim_lecturer_id then
    raise exception 'Expected lecturer_id = claim_lecturer_id (% vs %)', v_claimed.lecturer_id, ctx.claim_lecturer_id;
  end if;

  if not exists (
    select 1 from public.class_schedules
    where id = v_schedule_id and lecturer_id = ctx.claim_lecturer_id
  ) then
    raise exception 'class_schedules row was not updated with claimed lecturer_id';
  end if;
end $$;
select pass('CASE C1 — UNLOCKED: eligible Lecturer claims class without equipment request');

-- 10. CASE C2 — ACTIVE EQUIPMENT REQUEST: Claim fails and preserves lecturer assignment
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_sched_date date := (current_date + interval '7 days')::date;
  v_req_id uuid;
  v_error_caught boolean := false;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-C2', 'Kỹ năng C2', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 25, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  -- Create active equipment request
  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  insert into public.equipment_requests (
    class_schedule_id, registrant_id, responsible_lecturer_id, created_by, phone_snapshot, email_snapshot, receive_at, return_at, status, semester
  ) values (
    v_schedule_id, ctx.lecturer_id, ctx.lecturer_id, ctx.admin_id, '0901234567', 'post62-lecturer@test.local',
    (v_sched_date::text || ' 09:00:00+07')::timestamptz, (v_sched_date::text || ' 16:00:00+07')::timestamptz, 'new', 'HK1'
  ) returning id into v_req_id;

  -- Attempt to claim as eligible lecturer
  perform set_config('request.jwt.claim.sub', ctx.claim_lecturer_id::text, true);
  begin
    perform public.claim_class(v_schedule_id);
  exception
    when sqlstate '42501' then
      if sqlerrm = 'CLASS_EQUIPMENT_REQUEST_EXISTS' then
        v_error_caught := true;
      else
        raise;
      end if;
  end;

  if not v_error_caught then
    raise exception 'Expected CLASS_EQUIPMENT_REQUEST_EXISTS when claiming class with active equipment request';
  end if;

  -- Verify lecturer_id remains null
  if exists (
    select 1 from public.class_schedules
    where id = v_schedule_id and lecturer_id is not null
  ) then
    raise exception 'Schedule lecturer_id should remain unchanged/null after failed claim';
  end if;
end $$;
select pass('CASE C2 — ACTIVE EQUIPMENT REQUEST: claim_class rejected with CLASS_EQUIPMENT_REQUEST_EXISTS');

-- 11. CASE C3 — SOFT-CANCELLED EQUIPMENT REQUEST: Claim still fails
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_sched_date date := (current_date + interval '8 days')::date;
  v_req_id uuid;
  v_error_caught boolean := false;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-C3', 'Kỹ năng C3', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 25, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  insert into public.equipment_requests (
    class_schedule_id, registrant_id, responsible_lecturer_id, created_by, phone_snapshot, email_snapshot, receive_at, return_at, status, semester
  ) values (
    v_schedule_id, ctx.lecturer_id, ctx.lecturer_id, ctx.admin_id, '0901234567', 'post62-lecturer@test.local',
    (v_sched_date::text || ' 09:00:00+07')::timestamptz, (v_sched_date::text || ' 16:00:00+07')::timestamptz, 'new', 'HK1'
  ) returning id into v_req_id;

  -- Soft-cancel equipment request
  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  update public.equipment_requests set status = 'cancelled' where id = v_req_id;
  perform set_config('app.equipment_confirmation_rpc', 'false', true);

  -- Attempt to claim as eligible lecturer
  perform set_config('request.jwt.claim.sub', ctx.claim_lecturer_id::text, true);
  begin
    perform public.claim_class(v_schedule_id);
  exception
    when sqlstate '42501' then
      if sqlerrm = 'CLASS_EQUIPMENT_REQUEST_EXISTS' then
        v_error_caught := true;
      else
        raise;
      end if;
  end;

  if not v_error_caught then
    raise exception 'Expected CLASS_EQUIPMENT_REQUEST_EXISTS when claiming class with soft-cancelled equipment request';
  end if;

  if exists (
    select 1 from public.class_schedules
    where id = v_schedule_id and lecturer_id is not null
  ) then
    raise exception 'Schedule lecturer_id should remain unchanged/null after failed claim';
  end if;
end $$;
select pass('CASE C3 — SOFT-CANCELLED EQUIPMENT REQUEST: claim_class rejected with CLASS_EQUIPMENT_REQUEST_EXISTS');

-- 12. CASE C4 — HARD DELETE UNLOCK: Claim succeeds after hard deletion of equipment request
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_schedule_id uuid;
  v_sched_date date := (current_date + interval '9 days')::date;
  v_req_id uuid;
  v_claimed public.class_schedules;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.skills_course_id, 'KN-C4', 'Kỹ năng C4', ctx.skills_room_id, v_sched_date, '08:00', '11:30', 25, 'published', 'HK1', ctx.admin_id, now(), ctx.admin_id
  ) returning id into v_schedule_id;

  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  insert into public.equipment_requests (
    class_schedule_id, registrant_id, responsible_lecturer_id, created_by, phone_snapshot, email_snapshot, receive_at, return_at, status, semester
  ) values (
    v_schedule_id, ctx.lecturer_id, ctx.lecturer_id, ctx.admin_id, '0901234567', 'post62-lecturer@test.local',
    (v_sched_date::text || ' 09:00:00+07')::timestamptz, (v_sched_date::text || ' 16:00:00+07')::timestamptz, 'new', 'HK1'
  ) returning id into v_req_id;

  -- Hard delete equipment request
  delete from public.equipment_requests where id = v_req_id;

  -- Now claim as eligible lecturer
  perform set_config('request.jwt.claim.sub', ctx.claim_lecturer_id::text, true);
  v_claimed := public.claim_class(v_schedule_id);

  if v_claimed.lecturer_id <> ctx.claim_lecturer_id then
    raise exception 'Expected lecturer_id = claim_lecturer_id after hard-delete unlock';
  end if;
end $$;
select pass('CASE C4 — HARD DELETE UNLOCK: claim_class succeeds after equipment request hard deletion');

-- Cancellation matrix fixtures helper table
create temp table post_pr62_matrix_fixtures (
  reg_id uuid,
  sched_id uuid,
  session_id uuid
);

do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  v_reg_id uuid;
  v_sched_id uuid;
  v_session_id uuid;
begin
  select * into strict ctx from post_pr62_test_ctx;

  insert into public.basic_medical_registrations (
    registration_code, course_id, room_id, registrant_id, responsible_lecturer_id,
    academic_year, semester, start_date, end_date, student_count, created_by
  ) values (
    'YCS-MATRIX-TEST', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-M1', 'Y cơ sở M1', ctx.basic_room_id, (current_date + interval '6 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài Ma Trận Phân Quyền', ctx.lecturer_id
  ) returning id into v_session_id;

  insert into post_pr62_matrix_fixtures values (v_reg_id, v_sched_id, v_session_id);
end $$;

-- 13. DENY — Unrelated Lecturer fails closed (42501) with no side effects
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_audits_before integer;
  v_outbox_before integer;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;

  select count(*) into v_audits_before from public.audit_logs where entity_id = fix.session_id;
  select count(*) into v_outbox_before from public.email_outbox_events where aggregate_id = fix.sched_id;

  perform set_config('request.jwt.claim.sub', ctx.unrelated_lecturer_id::text, true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, 'Unrelated lecturer attempt');
    raise exception 'Unrelated Lecturer must be denied';
  exception when sqlstate '42501' then
    -- expected
  end;

  -- Assert fail-closed state
  if exists (select 1 from public.basic_medical_registration_sessions where id = fix.session_id and cancelled_at is not null) then
    raise exception 'Session cancelled_at must remain null';
  end if;
  if exists (select 1 from public.class_schedules where id = fix.sched_id and schedule_status = 'cancelled') then
    raise exception 'Schedule status must remain published';
  end if;
  if (select count(*) from public.audit_logs where entity_id = fix.session_id) <> v_audits_before then
    raise exception 'No audit log should be written on denied cancellation';
  end if;
  if (select count(*) from public.email_outbox_events where aggregate_id = fix.sched_id) <> v_outbox_before then
    raise exception 'No outbox event should be enqueued on denied cancellation';
  end if;
end $$;
select pass('DENY — Unrelated Lecturer fails closed (42501) without mutations or side effects');

-- 14. DENY — Unrelated Staff fails closed (42501) with no side effects
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_audits_before integer;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;
  select count(*) into v_audits_before from public.audit_logs where entity_id = fix.session_id;

  perform set_config('request.jwt.claim.sub', ctx.unrelated_staff_id::text, true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, 'Unrelated staff attempt');
    raise exception 'Unrelated Staff must be denied';
  exception when sqlstate '42501' then
    -- expected
  end;

  if exists (select 1 from public.basic_medical_registration_sessions where id = fix.session_id and cancelled_at is not null) then
    raise exception 'Session cancelled_at must remain null';
  end if;
  if exists (select 1 from public.class_schedules where id = fix.sched_id and schedule_status = 'cancelled') then
    raise exception 'Schedule status must remain published';
  end if;
  if (select count(*) from public.audit_logs where entity_id = fix.session_id) <> v_audits_before then
    raise exception 'No audit log should be written on denied cancellation';
  end if;
end $$;
select pass('DENY — Unrelated Staff fails closed (42501) without mutations or side effects');

-- 15. DENY — Unrelated Teaching Assistant fails closed (42501) with no side effects
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_audits_before integer;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;
  select count(*) into v_audits_before from public.audit_logs where entity_id = fix.session_id;

  perform set_config('request.jwt.claim.sub', ctx.unrelated_ta_id::text, true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, 'Unrelated TA attempt');
    raise exception 'Unrelated TA must be denied';
  exception when sqlstate '42501' then
    -- expected
  end;

  if exists (select 1 from public.basic_medical_registration_sessions where id = fix.session_id and cancelled_at is not null) then
    raise exception 'Session cancelled_at must remain null';
  end if;
  if exists (select 1 from public.class_schedules where id = fix.sched_id and schedule_status = 'cancelled') then
    raise exception 'Schedule status must remain published';
  end if;
  if (select count(*) from public.audit_logs where entity_id = fix.session_id) <> v_audits_before then
    raise exception 'No audit log should be written on denied cancellation';
  end if;
end $$;
select pass('DENY — Unrelated Teaching Assistant fails closed (42501) without mutations or side effects');

-- 16. DENY — Viewer fails closed (42501) with no side effects
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_audits_before integer;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;
  select count(*) into v_audits_before from public.audit_logs where entity_id = fix.session_id;

  perform set_config('request.jwt.claim.sub', ctx.unrelated_viewer_id::text, true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, 'Viewer attempt');
    raise exception 'Viewer must be denied';
  exception when sqlstate '42501' then
    -- expected
  end;

  if exists (select 1 from public.basic_medical_registration_sessions where id = fix.session_id and cancelled_at is not null) then
    raise exception 'Session cancelled_at must remain null';
  end if;
  if exists (select 1 from public.class_schedules where id = fix.sched_id and schedule_status = 'cancelled') then
    raise exception 'Schedule status must remain published';
  end if;
  if (select count(*) from public.audit_logs where entity_id = fix.session_id) <> v_audits_before then
    raise exception 'No audit log should be written on denied cancellation';
  end if;
end $$;
select pass('DENY — Viewer fails closed (42501) without mutations or side effects');

-- 17. DENY — Anon / unauthenticated fails closed (42501) with no side effects
do $$
declare
  fix post_pr62_matrix_fixtures%rowtype;
begin
  select * into strict fix from post_pr62_matrix_fixtures;

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, 'Anon attempt');
    raise exception 'Anon must be denied';
  exception when sqlstate '42501' then
    -- expected
  end;

  if exists (select 1 from public.basic_medical_registration_sessions where id = fix.session_id and cancelled_at is not null) then
    raise exception 'Session cancelled_at must remain null';
  end if;
end $$;
select pass('DENY — Anon / unauthenticated fails closed (42501) without mutations or side effects');

-- 18. DENY — Whitespace-only reason rejected (22023)
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;

  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  begin
    perform public.cancel_basic_medical_session(fix.session_id, '    ');
    raise exception 'Whitespace-only reason should be rejected';
  exception when sqlstate '22023' then
    -- expected
  end;
end $$;
select pass('DENY — Whitespace-only reason rejected with 22023');

-- 19. DENY — Active confirmation blocks cancellation (22023)
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
    'YCS-TEST-CONF-GUARD', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-CG1', 'Y cơ sở CG1', ctx.basic_room_id, (current_date + interval '7 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài Xác Nhận Khóa', ctx.lecturer_id
  ) returning id into v_session_id;

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

  -- Attempt cancel by Admin: should fail with 22023
  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  begin
    perform public.cancel_basic_medical_session(v_session_id, 'Hủy khi có xác nhận active');
    raise exception 'Active confirmation must block cancellation';
  exception when sqlstate '22023' then
    -- expected
  end;
end $$;
select pass('DENY — Active confirmation blocks cancellation with 22023');

-- 20. ALLOW — Teaching Lecturer cancels session
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;

  perform set_config('request.jwt.claim.sub', ctx.lecturer_id::text, true);
  v_result := public.cancel_basic_medical_session(fix.session_id, 'Giảng viên phân công hủy buổi học');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Teaching Lecturer cancellation failed';
  end if;

  if not exists (
    select 1 from public.basic_medical_registration_sessions
    where id = fix.session_id
      and cancelled_at is not null
      and cancelled_by = ctx.lecturer_id
      and cancellation_reason = 'Giảng viên phân công hủy buổi học'
  ) then
    raise exception 'Session cancellation metadata mismatch for teaching lecturer';
  end if;

  if not exists (
    select 1 from public.class_schedules
    where id = fix.sched_id
      and schedule_status = 'cancelled'
      and cancelled_by = ctx.lecturer_id
  ) then
    raise exception 'Schedule status/cancelled_by mismatch for teaching lecturer';
  end if;
end $$;
select pass('ALLOW — Teaching Lecturer cancels session and records metadata');

-- 21. ALLOW — Registration Creator cancels session
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
    'YCS-CREATOR-ALLOW', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-CR1', 'Y cơ sở CR1', ctx.basic_room_id, (current_date + interval '8 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài Creator Hủy', ctx.lecturer_id
  ) returning id into v_session_id;

  perform set_config('request.jwt.claim.sub', ctx.creator_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Người tạo phiếu hủy buổi');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Creator cancel failed';
  end if;

  if not exists (
    select 1 from public.basic_medical_registration_sessions
    where id = v_session_id and cancelled_by = ctx.creator_id
  ) then
    raise exception 'Creator cancellation metadata mismatch';
  end if;
end $$;
select pass('ALLOW — Registration Creator cancels session and records metadata');

-- 22. ALLOW — Admin cancels session
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
    'YCS-ADMIN-ALLOW', ctx.basic_course_id, ctx.basic_room_id, ctx.creator_id, ctx.creator_id,
    '2026-2027', 'HK1', (current_date + interval '5 days')::date, (current_date + interval '10 days')::date,
    40, ctx.creator_id
  ) returning id into v_reg_id;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, schedule_date, start_time, end_time, student_count, schedule_status, semester, created_by, published_at, published_by
  ) values (
    ctx.basic_course_id, 'YCS-AD1', 'Y cơ sở AD1', ctx.basic_room_id, (current_date + interval '9 days')::date, '08:00', '11:30', 40, 'published', 'HK1', ctx.creator_id, now(), ctx.creator_id
  ) returning id into v_sched_id;

  insert into public.basic_medical_registration_sessions (
    registration_id, class_schedule_id, session_number, lesson_title, teaching_lecturer_id
  ) values (
    v_reg_id, v_sched_id, 1, 'Bài Admin Hủy', ctx.lecturer_id
  ) returning id into v_session_id;

  perform set_config('request.jwt.claim.sub', ctx.admin_id::text, true);
  v_result := public.cancel_basic_medical_session(v_session_id, 'Admin hủy buổi học');

  if (v_result->>'cancelled')::boolean is not true then
    raise exception 'Admin cancel failed';
  end if;

  if not exists (
    select 1 from public.basic_medical_registration_sessions
    where id = v_session_id and cancelled_by = ctx.admin_id
  ) then
    raise exception 'Admin cancellation metadata mismatch';
  end if;
end $$;
select pass('ALLOW — Admin cancels session and records metadata');

-- 23. IDEMPOTENT — Repeated cancellation returns idempotent = true
do $$
declare
  ctx post_pr62_test_ctx%rowtype;
  fix post_pr62_matrix_fixtures%rowtype;
  v_result jsonb;
begin
  select * into strict ctx from post_pr62_test_ctx;
  select * into strict fix from post_pr62_matrix_fixtures;

  perform set_config('request.jwt.claim.sub', ctx.lecturer_id::text, true);
  v_result := public.cancel_basic_medical_session(fix.session_id, 'Hủy lặp lại');

  if (v_result->>'idempotent')::boolean is not true then
    raise exception 'Expected idempotent = true on repeated invocation';
  end if;
end $$;
select pass('IDEMPOTENT — Repeated cancellation returns idempotent = true');

-- 24. Audit log received
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'basic_medical.session_cancelled'
      and entity_type = 'basic_medical_registration_session'
  ),
  'AUDIT — audit_logs receives basic_medical.session_cancelled event'
);

-- 25. Outbox event received
select ok(
  exists (
    select 1 from public.email_outbox_events
    where domain = 'basic_medical_schedule'
      and event_type = 'schedule_cancelled'
  ),
  'OUTBOX — email_outbox_events receives schedule_cancelled event'
);

-- 26. Grants on functions
select ok(
  has_function_privilege('authenticated', 'public.claim_class(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancel_basic_medical_session(uuid, text)', 'EXECUTE'),
  'GRANTS — authenticated has EXECUTE on public.claim_class and public.cancel_basic_medical_session'
);

-- 27. Revokes from public, anon
select ok(
  not has_function_privilege('public', 'public.cancel_basic_medical_session(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_basic_medical_session(uuid, text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.claim_class(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_class(uuid)', 'EXECUTE'),
  'REVOKES — public and anon do NOT have EXECUTE on claim_class and cancel_basic_medical_session'
);

rollback;

