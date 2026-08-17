begin;
select plan(34);

create temp table y07_context (
  admin_id uuid,
  creator_id uuid,
  lecturer_a_id uuid,
  lecturer_b_id uuid,
  lecturer_c_id uuid,
  outsider_id uuid,
  inactive_lecturer_id uuid,
  non_lecturer_id uuid,
  skills_only_lecturer_id uuid,
  registration_id uuid,
  session_1_id uuid,
  session_2_id uuid,
  session_3_id uuid,
  schedule_1_id uuid,
  schedule_2_id uuid,
  schedule_3_id uuid,
  confirmation_1_id uuid,
  confirmation_2_id uuid,
  confirmation_3_id uuid,
  catalog_id uuid,
  inventory_id uuid,
  course_id uuid,
  room_id uuid,
  room_2_id uuid,
  orig_signed_at timestamptz
);
grant select, update on y07_context to authenticated, anon;

do $$
declare
  ctx y07_context%rowtype;
  basic_med_type uuid;
  skills_type uuid;
  sig_data text := 'data:image/png;base64,' || repeat('B', 100);
begin
  select id into basic_med_type from public.room_types where code = 'basic_medical';
  select id into skills_type from public.room_types where code = 'nursing_skills';

  ctx.admin_id := gen_random_uuid();
  ctx.creator_id := gen_random_uuid();
  ctx.lecturer_a_id := gen_random_uuid();
  ctx.lecturer_b_id := gen_random_uuid();
  ctx.lecturer_c_id := gen_random_uuid();
  ctx.outsider_id := gen_random_uuid();
  ctx.inactive_lecturer_id := gen_random_uuid();
  ctx.non_lecturer_id := gen_random_uuid();
  ctx.skills_only_lecturer_id := gen_random_uuid();
  ctx.course_id := gen_random_uuid();
  ctx.room_id := gen_random_uuid();
  ctx.room_2_id := gen_random_uuid();
  ctx.catalog_id := gen_random_uuid();
  ctx.inventory_id := gen_random_uuid();
  ctx.registration_id := gen_random_uuid();
  ctx.session_1_id := gen_random_uuid();
  ctx.session_2_id := gen_random_uuid();
  ctx.session_3_id := gen_random_uuid();
  ctx.schedule_1_id := gen_random_uuid();
  ctx.schedule_2_id := gen_random_uuid();
  ctx.schedule_3_id := gen_random_uuid();
  ctx.confirmation_1_id := gen_random_uuid();
  ctx.confirmation_2_id := gen_random_uuid();
  ctx.confirmation_3_id := gen_random_uuid();
  ctx.orig_signed_at := timestamptz '2042-06-01 10:00:00+00';

  insert into auth.users (id, email) values
    (ctx.admin_id, 'y07-admin@example.test'),
    (ctx.creator_id, 'y07-creator@example.test'),
    (ctx.lecturer_a_id, 'y07-lecturer-a@example.test'),
    (ctx.lecturer_b_id, 'y07-lecturer-b@example.test'),
    (ctx.lecturer_c_id, 'y07-lecturer-c@example.test'),
    (ctx.outsider_id, 'y07-outsider@example.test'),
    (ctx.inactive_lecturer_id, 'y07-inactive-lec@example.test'),
    (ctx.non_lecturer_id, 'y07-non-lec@example.test'),
    (ctx.skills_only_lecturer_id, 'y07-skills-only@example.test');

  insert into public.profiles (id, email, full_name, is_active) values
    (ctx.admin_id, 'y07-admin@example.test', 'Y07 Admin', true),
    (ctx.creator_id, 'y07-creator@example.test', 'Y07 Creator', true),
    (ctx.lecturer_a_id, 'y07-lecturer-a@example.test', 'Y07 Lecturer A', true),
    (ctx.lecturer_b_id, 'y07-lecturer-b@example.test', 'Y07 Lecturer B', true),
    (ctx.lecturer_c_id, 'y07-lecturer-c@example.test', 'Y07 Lecturer C', true),
    (ctx.outsider_id, 'y07-outsider@example.test', 'Y07 Outsider', true),
    (ctx.inactive_lecturer_id, 'y07-inactive-lec@example.test', 'Y07 Inactive Lec', false),
    (ctx.non_lecturer_id, 'y07-non-lec@example.test', 'Y07 Non Lec', true),
    (ctx.skills_only_lecturer_id, 'y07-skills-only@example.test', 'Y07 Skills Only', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active;

  insert into public.user_roles (user_id, role) values
    (ctx.admin_id, 'admin'),
    (ctx.creator_id, 'lecturer'),
    (ctx.lecturer_a_id, 'lecturer'),
    (ctx.lecturer_b_id, 'lecturer'),
    (ctx.lecturer_c_id, 'lecturer'),
    (ctx.outsider_id, 'viewer'),
    (ctx.inactive_lecturer_id, 'lecturer'),
    (ctx.non_lecturer_id, 'staff'),
    (ctx.skills_only_lecturer_id, 'lecturer');

  insert into public.profile_room_types (profile_id, room_type_id) values
    (ctx.creator_id, basic_med_type),
    (ctx.lecturer_a_id, basic_med_type),
    (ctx.lecturer_b_id, basic_med_type),
    (ctx.lecturer_c_id, basic_med_type),
    (ctx.outsider_id, basic_med_type),
    (ctx.inactive_lecturer_id, basic_med_type),
    (ctx.non_lecturer_id, basic_med_type),
    (ctx.skills_only_lecturer_id, skills_type)
  on conflict do nothing;

  insert into public.courses (id, course_code, course_name, room_type_id, is_active) values
    (ctx.course_id, 'Y07-C01', 'Y07 Basic Med Course', basic_med_type, true);

  insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active) values
    (ctx.room_id, 'Y07-R01', 'Y07-B', 'Y07 Basic Med Room 1', basic_med_type, 30, true),
    (ctx.room_2_id, 'Y07-R02', 'Y07-B', 'Y07 Basic Med Room 2', basic_med_type, 30, true);

  insert into public.basic_medical_equipment_catalog (id, item_name, commercial_name, unit, is_active) values
    (ctx.catalog_id, 'Y07 Test Model', 'Y07 Commercial Model', 'unit', true);

  insert into public.basic_medical_room_inventory (id, room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity, is_active) values
    (ctx.inventory_id, ctx.room_id, ctx.catalog_id, 5, 5, 0, true);

  insert into public.basic_medical_registrations (
    id, academic_year, semester, start_date, end_date, course_id, room_id,
    student_count, registrant_id, responsible_lecturer_id, created_by
  ) values (
    ctx.registration_id, '2042-2043', 'HK1', date '2042-06-01', date '2042-06-30',
    ctx.course_id, ctx.room_id, 25, ctx.creator_id, ctx.lecturer_a_id, ctx.creator_id
  );

  perform set_config('app.basic_medical_registration_mutation', 'true', true);

  insert into public.class_schedules (
    id, course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, schedule_date, start_time, end_time, source,
    basic_medical_registration_id, schedule_status, student_count, created_by,
    published_by, published_at
  ) values
    (ctx.schedule_1_id, ctx.course_id, 'Y07-C01', 'Y07 Basic Med Course', ctx.room_id,
     ctx.lecturer_a_id, date '2042-06-01', time '08:00', time '10:00', 'manual',
     ctx.registration_id, 'published', 25, ctx.creator_id, ctx.creator_id, clock_timestamp()),
    (ctx.schedule_2_id, ctx.course_id, 'Y07-C01', 'Y07 Basic Med Course', ctx.room_id,
     ctx.lecturer_a_id, date '2042-06-02', time '08:00', time '10:00', 'manual',
     ctx.registration_id, 'published', 25, ctx.creator_id, ctx.creator_id, clock_timestamp()),
    (ctx.schedule_3_id, ctx.course_id, 'Y07-C01', 'Y07 Basic Med Course', ctx.room_id,
     ctx.lecturer_a_id, date '2042-06-03', time '08:00', time '10:00', 'manual',
     ctx.registration_id, 'published', 25, ctx.creator_id, ctx.creator_id, clock_timestamp());

  insert into public.basic_medical_registration_sessions (
    id, registration_id, class_schedule_id, lesson_title, session_number, teaching_lecturer_id
  ) values
    (ctx.session_1_id, ctx.registration_id, ctx.schedule_1_id, 'Y07 Lesson 1', 1, ctx.lecturer_a_id),
    (ctx.session_2_id, ctx.registration_id, ctx.schedule_2_id, 'Y07 Lesson 2', 2, ctx.lecturer_a_id),
    (ctx.session_3_id, ctx.registration_id, ctx.schedule_3_id, 'Y07 Lesson 3', 3, ctx.lecturer_a_id);

  insert into public.basic_medical_session_confirmations (
    id, session_id, registration_id_snapshot, class_schedule_id_snapshot,
    signer_id, signature_data, schedule_date_snapshot, start_time_snapshot,
    end_time_snapshot, room_id_snapshot, teaching_lecturer_id_snapshot,
    signed_at
  ) values
    (ctx.confirmation_1_id, ctx.session_1_id, ctx.registration_id, ctx.schedule_1_id,
     ctx.lecturer_a_id, sig_data, date '2042-06-01', time '08:00', time '10:00',
     ctx.room_id, ctx.lecturer_a_id, ctx.orig_signed_at),
    (ctx.confirmation_2_id, ctx.session_2_id, ctx.registration_id, ctx.schedule_2_id,
     ctx.lecturer_a_id, sig_data, date '2042-06-02', time '08:00', time '10:00',
     ctx.room_id, ctx.lecturer_a_id, ctx.orig_signed_at),
    (ctx.confirmation_3_id, ctx.session_3_id, ctx.registration_id, ctx.schedule_3_id,
     ctx.lecturer_a_id, sig_data, date '2042-06-03', time '08:00', time '10:00',
     ctx.room_id, ctx.lecturer_a_id, ctx.orig_signed_at);

  insert into public.basic_medical_session_equipment_checks (
    confirmation_id, inventory_id, item_name_snapshot,
    commercial_name_snapshot, unit_snapshot, total_before, good_before,
    damaged_before, newly_damaged_quantity, good_after, damaged_after
  ) values
    (ctx.confirmation_1_id, ctx.inventory_id, 'Y07 Test Model',
     'Y07 Commercial Model', 'unit', 5, 5, 0, 0, 5, 0),
    (ctx.confirmation_2_id, ctx.inventory_id, 'Y07 Test Model',
     'Y07 Commercial Model', 'unit', 5, 5, 0, 0, 5, 0),
    (ctx.confirmation_3_id, ctx.inventory_id, 'Y07 Test Model',
     'Y07 Commercial Model', 'unit', 5, 5, 0, 0, 5, 0);

  insert into y07_context values (ctx.*);
end;
$$;

-- =========================================================================
-- SCENARIO 1: CREATOR UPDATES LECTURER ON ALREADY CONFIRMED SESSION 1
-- =========================================================================

-- Execute RPC as creator
select set_config('request.jwt.claim.sub', (select creator_id::text from y07_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.update_basic_medical_session_teaching_lecturer(
    (select session_1_id from y07_context),
    (select lecturer_b_id from y07_context)
  ),
  true,
  'Scenario 1: Creator update_basic_medical_session_teaching_lecturer succeeds'
);

-- Assert session 1 teaching_lecturer_id updated to lecturer B
select is(
  (select teaching_lecturer_id from public.basic_medical_registration_sessions where id = (select session_1_id from y07_context)),
  (select lecturer_b_id from y07_context),
  'Scenario 1: Session 1 teaching_lecturer_id is updated to Lecturer B'
);

-- Assert linked class_schedules.lecturer_id updated to lecturer B
select is(
  (select lecturer_id from public.class_schedules where id = (select schedule_1_id from y07_context)),
  (select lecturer_b_id from y07_context),
  'Scenario 1: Linked class_schedules.lecturer_id is updated to Lecturer B'
);

-- Assert confirmation 1 row still exists and is NOT invalidated
select is(
  (select invalidated_at from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  null::timestamptz,
  'Scenario 1: Confirmation 1 invalidated_at remains NULL'
);

select is(
  (select invalidated_reason from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  null::text,
  'Scenario 1: Confirmation 1 invalidated_reason remains NULL'
);

-- Assert historical confirmation fields remain completely intact
select is(
  (select signer_id from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 1: Confirmation 1 signer_id remains historical Lecturer A'
);

select is(
  (select teaching_lecturer_id_snapshot from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 1: Confirmation 1 teaching_lecturer_id_snapshot remains historical Lecturer A'
);

select is(
  (select signer_name_snapshot from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  'Y07 Lecturer A'::text,
  'Scenario 1: Confirmation 1 signer_name_snapshot remains unchanged'
);

select is(
  (select signed_at from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  (select orig_signed_at from y07_context),
  'Scenario 1: Confirmation 1 signed_at remains unchanged'
);

-- Assert equipment checks snapshot remains completely intact
select is(
  (select item_name_snapshot from public.basic_medical_session_equipment_checks where confirmation_id = (select confirmation_1_id from y07_context)),
  'Y07 Test Model'::text,
  'Scenario 1: Equipment checks item_name_snapshot remains unchanged'
);

select is(
  (select good_after from public.basic_medical_session_equipment_checks where confirmation_id = (select confirmation_1_id from y07_context)),
  5,
  'Scenario 1: Equipment checks good_after quantity remains unchanged'
);

-- =========================================================================
-- SCENARIO 2: MULTI-SESSION ISOLATION (SESSION 2 REMAINS UNTOUCHED)
-- =========================================================================

select is(
  (select teaching_lecturer_id from public.basic_medical_registration_sessions where id = (select session_2_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 2: Sibling Session 2 teaching_lecturer_id remains Lecturer A'
);

select is(
  (select lecturer_id from public.class_schedules where id = (select schedule_2_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 2: Sibling Schedule 2 lecturer_id remains Lecturer A'
);

select is(
  (select invalidated_at from public.basic_medical_session_confirmations where id = (select confirmation_2_id from y07_context)),
  null::timestamptz,
  'Scenario 2: Sibling Confirmation 2 invalidated_at remains NULL'
);

-- =========================================================================
-- SCENARIO 3: ADMIN AUTHORIZATION
-- =========================================================================

select set_config('request.jwt.claim.sub', (select admin_id::text from y07_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.update_basic_medical_session_teaching_lecturer(
    (select session_2_id from y07_context),
    (select lecturer_c_id from y07_context)
  ),
  true,
  'Scenario 3: Admin update_basic_medical_session_teaching_lecturer succeeds'
);

select is(
  (select teaching_lecturer_id from public.basic_medical_registration_sessions where id = (select session_2_id from y07_context)),
  (select lecturer_c_id from y07_context),
  'Scenario 3: Session 2 teaching_lecturer_id is updated to Lecturer C by Admin'
);

select is(
  (select invalidated_at from public.basic_medical_session_confirmations where id = (select confirmation_2_id from y07_context)),
  null::timestamptz,
  'Scenario 3: Session 2 confirmation remains active after Admin update'
);

-- =========================================================================
-- SCENARIO 4: UNAUTHORIZED USER REJECTION
-- =========================================================================

select set_config('request.jwt.claim.sub', (select outsider_id::text from y07_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_1_id from y07_context),
    (select lecturer_a_id from y07_context)
  ),
  '42501',
  'UPDATE_FORBIDDEN',
  'Scenario 4: Unauthorized user is rejected with UPDATE_FORBIDDEN'
);

select is(
  (select teaching_lecturer_id from public.basic_medical_registration_sessions where id = (select session_1_id from y07_context)),
  (select lecturer_b_id from y07_context),
  'Scenario 4: Session 1 teaching_lecturer_id remains unchanged after rejected call'
);

-- =========================================================================
-- SCENARIO 5: INVALID LECTURER REJECTION
-- =========================================================================

select set_config('request.jwt.claim.sub', (select admin_id::text from y07_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Inactive lecturer
select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_1_id from y07_context),
    (select inactive_lecturer_id from y07_context)
  ),
  '22023',
  'INVALID_LECTURER',
  'Scenario 5: Inactive lecturer is rejected with INVALID_LECTURER'
);

-- Non-lecturer role (staff)
select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_1_id from y07_context),
    (select non_lecturer_id from y07_context)
  ),
  '22023',
  'INVALID_LECTURER',
  'Scenario 5: Non-lecturer is rejected with INVALID_LECTURER'
);

-- Skills-only lecturer (no Basic Medical assignment)
select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_1_id from y07_context),
    (select skills_only_lecturer_id from y07_context)
  ),
  '22023',
  'INVALID_LECTURER',
  'Scenario 5: Skills-only lecturer is rejected with INVALID_LECTURER'
);

-- =========================================================================
-- SCENARIO 6: EXISTING GENERIC SCHEDULE EDIT PROTECTION REMAINS INTACT
-- =========================================================================

-- Attempt generic schedule edit on confirmed session 1
select throws_ok(
  format(
    'select public.update_class_schedule_details(%L::uuid, date %L, time %L, time %L, %L::uuid, 25, array[%L::uuid])',
    (select schedule_1_id from y07_context),
    '2042-06-01',
    '08:00',
    '10:00',
    (select room_id from y07_context),
    (select lecturer_a_id from y07_context)
  ),
  '55000',
  'BASIC_MEDICAL_SESSION_ALREADY_CONFIRMED',
  'Scenario 6: Generic update_class_schedule_details on confirmed session is blocked'
);

-- =========================================================================
-- SCENARIO 7: NORMAL INVALIDATION CONTRACT FOR ROOM/TIME/UNFLAGGED CHANGES
-- =========================================================================

-- Direct unflagged schedule change (room change) fires trigger and invalidates confirmation
do $$
begin
  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules
  set room_id = (select room_2_id from y07_context)
  where id = (select schedule_1_id from y07_context);
end;
$$;

select isnt(
  (select invalidated_at from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  null::timestamptz,
  'Scenario 7: Normal room change on class_schedules invalidates confirmation 1'
);

select is(
  (select invalidated_reason from public.basic_medical_session_confirmations where id = (select confirmation_1_id from y07_context)),
  'Thông tin phòng, thời gian hoặc Giảng viên giảng dạy/hướng dẫn đã thay đổi.'::text,
  'Scenario 7: Invalidation reason is recorded on normal schedule room change'
);

-- Unflagged lecturer change on schedule 2 without preserve context invalidates confirmation 2
do $$
begin
  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules
  set lecturer_id = (select lecturer_a_id from y07_context)
  where id = (select schedule_2_id from y07_context);
end;
$$;

select isnt(
  (select invalidated_at from public.basic_medical_session_confirmations where id = (select confirmation_2_id from y07_context)),
  null::timestamptz,
  'Scenario 7: Unflagged lecturer change invalidates confirmation 2'
);

select is(
  (select invalidated_reason from public.basic_medical_session_confirmations where id = (select confirmation_2_id from y07_context)),
  'Thông tin phòng, thời gian hoặc Giảng viên giảng dạy/hướng dẫn đã thay đổi.'::text,
  'Scenario 7: Invalidation reason is recorded on unflagged lecturer change'
);

-- =========================================================================
-- SCENARIO 8: INDIVIDUAL CANCELLED SESSION REJECTED SERVER-SIDE
-- =========================================================================

-- Cancel session 3 through canonical semantics
do $$
begin
  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules
  set schedule_status = 'cancelled',
      cancelled_at = timestamptz '2042-06-02 12:00:00+00',
      cancelled_by = (select admin_id from y07_context)
  where id = (select schedule_3_id from y07_context);

  update public.basic_medical_registration_sessions
  set cancelled_at = timestamptz '2042-06-02 12:00:00+00',
      cancelled_by = (select admin_id from y07_context),
      cancellation_reason = 'Y07 Cancelled session for test'
  where id = (select session_3_id from y07_context);
end;
$$;

-- Creator attempts to change teaching lecturer on cancelled session 3
select set_config('request.jwt.claim.sub', (select creator_id::text from y07_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_3_id from y07_context),
    (select lecturer_b_id from y07_context)
  ),
  '55000',
  'BASIC_MEDICAL_SESSION_CANCELLED',
  'Scenario 8: Lecturer edit on individually cancelled session is rejected'
);

-- Assert session 3 teaching_lecturer_id unchanged
select is(
  (select teaching_lecturer_id from public.basic_medical_registration_sessions where id = (select session_3_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 8: Cancelled session teaching_lecturer_id remains unchanged'
);

-- Assert schedule 3 lecturer_id unchanged
select is(
  (select lecturer_id from public.class_schedules where id = (select schedule_3_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 8: Cancelled linked schedule lecturer_id remains unchanged'
);

-- Assert cancellation metadata unchanged
select is(
  (select cancellation_reason from public.basic_medical_registration_sessions where id = (select session_3_id from y07_context)),
  'Y07 Cancelled session for test'::text,
  'Scenario 8: Cancelled session cancellation_reason remains intact'
);

-- Assert confirmation 3 unchanged
select is(
  (select teaching_lecturer_id_snapshot from public.basic_medical_session_confirmations where id = (select confirmation_3_id from y07_context)),
  (select lecturer_a_id from y07_context),
  'Scenario 8: Confirmation 3 teaching_lecturer_id_snapshot remains intact'
);

-- Assert no lecturer-update audit log was written for rejected mutation
select is(
  (select count(*)::integer from public.audit_logs
   where action = 'basic_medical_session.update_teaching_lecturer'
     and entity_id = (select session_3_id from y07_context)),
  0,
  'Scenario 8: No audit log written for rejected mutation on cancelled session'
);

-- =========================================================================
-- SCENARIO 9: REGISTRATION-WIDE CANCELLATION GUARD PRESERVED
-- =========================================================================

do $$
begin
  update public.basic_medical_registrations
  set cancelled_at = timestamptz '2042-06-02 12:00:00+00'
  where id = (select registration_id from y07_context);
end;
$$;

select throws_ok(
  format(
    'select public.update_basic_medical_session_teaching_lecturer(%L::uuid, %L::uuid)',
    (select session_1_id from y07_context),
    (select lecturer_a_id from y07_context)
  ),
  '55000',
  'REGISTRATION_CANCELLED',
  'Scenario 9: Lecturer edit on cancelled registration is rejected with REGISTRATION_CANCELLED'
);

-- End test transaction
rollback;
