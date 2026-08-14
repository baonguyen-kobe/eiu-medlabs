begin;
select plan(36);

create temp table y03_cancel_context (
  admin_id uuid,
  scoped_staff_id uuid,
  ordinary_id uuid,
  course_id uuid,
  room_one_id uuid,
  room_two_id uuid,
  registration_id uuid,
  staff_registration_id uuid,
  past_schedule_id uuid,
  same_day_started_schedule_id uuid,
  ongoing_schedule_id uuid,
  exact_schedule_id uuid,
  future_schedule_id uuid,
  completed_schedule_id uuid,
  already_cancelled_schedule_id uuid,
  preserved_confirmation_id uuid,
  future_confirmation_id uuid,
  staff_future_schedule_id uuid,
  first_result jsonb,
  second_result jsonb,
  staff_result jsonb
);
grant select, update on y03_cancel_context to authenticated;
grant select on y03_cancel_context to anon;

do $$
declare
  ctx y03_cancel_context%rowtype;
  basic_medical_room_type_id uuid;
  nursing_skills_room_type_id uuid;
  past_session_id uuid;
  same_day_started_session_id uuid;
  ongoing_session_id uuid;
  exact_session_id uuid;
  future_session_id uuid;
  completed_session_id uuid;
  cancelled_session_id uuid;
  staff_future_session_id uuid;
  signature text := 'data:image/png;base64,' || repeat('A', 120);
begin
  select id into basic_medical_room_type_id
  from public.room_types where code = 'basic_medical';
  select id into nursing_skills_room_type_id
  from public.room_types where code = 'nursing_skills';

  ctx.admin_id := gen_random_uuid();
  ctx.scoped_staff_id := gen_random_uuid();
  ctx.ordinary_id := gen_random_uuid();
  ctx.course_id := gen_random_uuid();
  ctx.room_one_id := gen_random_uuid();
  ctx.room_two_id := gen_random_uuid();
  ctx.registration_id := gen_random_uuid();
  ctx.staff_registration_id := gen_random_uuid();

  insert into auth.users (id, email) values
    (ctx.admin_id, 'y03-admin@campus.local'),
    (ctx.scoped_staff_id, 'y03-scoped-staff@campus.local'),
    (ctx.ordinary_id, 'y03-ordinary@campus.local');
  insert into public.profiles (id, email, full_name, is_active, title) values
    (ctx.admin_id, 'y03-admin@campus.local', 'Y03 Admin', true, 'Admin'),
    (ctx.scoped_staff_id, 'y03-scoped-staff@campus.local', 'Y03 Scoped Staff', true, 'Staff'),
    (ctx.ordinary_id, 'y03-ordinary@campus.local', 'Y03 Ordinary Staff', true, 'Staff')
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active,
    title = excluded.title;
  insert into public.user_roles (user_id, role) values
    (ctx.admin_id, 'admin'),
    (ctx.scoped_staff_id, 'staff'),
    (ctx.ordinary_id, 'staff');
  insert into public.profile_room_types (profile_id, room_type_id) values
    (ctx.scoped_staff_id, basic_medical_room_type_id),
    (ctx.ordinary_id, nursing_skills_room_type_id)
  on conflict do nothing;

  insert into public.courses (id, course_code, course_name, room_type_id)
  values (ctx.course_id, 'Y03-BOUNDARY', 'Y03 Boundary Fixture', basic_medical_room_type_id);
  insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity) values
    (ctx.room_one_id, 'Y03R1', 'Y03', 'Y03 Room 1', basic_medical_room_type_id, 30),
    (ctx.room_two_id, 'Y03R2', 'Y03', 'Y03 Room 2', basic_medical_room_type_id, 30);
  insert into public.basic_medical_registrations (
    id, academic_year, semester, start_date, end_date, course_id, room_id,
    student_count, registrant_id, responsible_lecturer_id, created_by
  ) values
    (ctx.registration_id, '2039-2040', 'HK1', '2040-01-02', '2040-01-04', ctx.course_id, ctx.room_one_id, 20, ctx.admin_id, ctx.admin_id, ctx.admin_id),
    (ctx.staff_registration_id, '2039-2040', 'HK1', '2040-01-05', '2040-01-05', ctx.course_id, ctx.room_one_id, 20, ctx.admin_id, ctx.admin_id, ctx.admin_id);

  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  insert into public.class_schedules (
    id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id,
    schedule_date, start_time, end_time, schedule_status, published_by, published_at,
    student_count, created_by, basic_medical_registration_id, cancelled_by, cancelled_at
  ) values
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Past day', ctx.room_one_id, null, '2040-01-02', '09:00', '10:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Same day started', ctx.room_one_id, null, '2040-01-03', '07:00', '08:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Same day ongoing', ctx.room_one_id, null, '2040-01-03', '09:00', '20:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Exact start', ctx.room_two_id, null, '2040-01-03', '10:00', '11:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Future', ctx.room_two_id, null, '2040-01-03', '11:00', '12:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Completed', ctx.room_one_id, null, '2040-01-04', '07:00', '08:00', 'completed', null, null, 20, ctx.admin_id, ctx.registration_id, null, null),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Already cancelled', ctx.room_one_id, null, '2040-01-04', '09:00', '10:00', 'cancelled', null, null, 20, ctx.admin_id, ctx.registration_id, ctx.admin_id, clock_timestamp()),
    (gen_random_uuid(), ctx.course_id, 'Y03-BOUNDARY', 'Staff future', ctx.room_one_id, null, '2040-01-05', '11:00', '12:00', 'published', ctx.admin_id, clock_timestamp(), 20, ctx.admin_id, ctx.staff_registration_id, null, null);

  select id into ctx.past_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Past day';
  select id into ctx.same_day_started_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Same day started';
  select id into ctx.ongoing_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Same day ongoing';
  select id into ctx.exact_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Exact start';
  select id into ctx.future_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Future';
  select id into ctx.completed_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Completed';
  select id into ctx.already_cancelled_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.registration_id and course_name_snapshot = 'Already cancelled';
  select id into ctx.staff_future_schedule_id from public.class_schedules where basic_medical_registration_id = ctx.staff_registration_id;

  insert into public.basic_medical_registration_sessions (registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number) values
    (ctx.registration_id, ctx.past_schedule_id, 'Past', ctx.admin_id, 1),
    (ctx.registration_id, ctx.same_day_started_schedule_id, 'Started', ctx.admin_id, 2),
    (ctx.registration_id, ctx.ongoing_schedule_id, 'Ongoing', ctx.admin_id, 3),
    (ctx.registration_id, ctx.exact_schedule_id, 'Exact', ctx.admin_id, 4),
    (ctx.registration_id, ctx.future_schedule_id, 'Future', ctx.admin_id, 5),
    (ctx.registration_id, ctx.completed_schedule_id, 'Completed', ctx.admin_id, 6),
    (ctx.registration_id, ctx.already_cancelled_schedule_id, 'Cancelled', ctx.admin_id, 7),
    (ctx.staff_registration_id, ctx.staff_future_schedule_id, 'Staff future', ctx.admin_id, 1);
  select id into past_session_id from public.basic_medical_registration_sessions where class_schedule_id = ctx.past_schedule_id;
  select id into same_day_started_session_id from public.basic_medical_registration_sessions where class_schedule_id = ctx.same_day_started_schedule_id;
  select id into future_session_id from public.basic_medical_registration_sessions where class_schedule_id = ctx.future_schedule_id;
  select id into staff_future_session_id from public.basic_medical_registration_sessions where class_schedule_id = ctx.staff_future_schedule_id;

  insert into public.basic_medical_session_confirmations (
    session_id, registration_id_snapshot, class_schedule_id_snapshot, signer_id, signature_data,
    schedule_date_snapshot, start_time_snapshot, end_time_snapshot, room_id_snapshot, teaching_lecturer_id_snapshot
  ) values
    (same_day_started_session_id, ctx.registration_id, ctx.same_day_started_schedule_id, ctx.admin_id, signature, '2040-01-03', '07:00', '08:00', ctx.room_one_id, ctx.admin_id),
    (future_session_id, ctx.registration_id, ctx.future_schedule_id, ctx.admin_id, signature, '2040-01-03', '11:00', '12:00', ctx.room_two_id, ctx.admin_id);
  select id into ctx.preserved_confirmation_id from public.basic_medical_session_confirmations where session_id = same_day_started_session_id;
  select id into ctx.future_confirmation_id from public.basic_medical_session_confirmations where session_id = future_session_id;

  insert into y03_cancel_context select ctx.*;
end;
$$;

update public.email_delivery_settings set delivery_mode = 'live';

select is(private.is_basic_medical_schedule_start_after('2040-01-03', '09:59', '2040-01-03 10:00'), false, 'past local start is not eligible');
select is(private.is_basic_medical_schedule_start_after('2040-01-03', '10:00', '2040-01-03 10:00'), false, 'exact local start is not eligible');
select is(private.is_basic_medical_schedule_start_after('2040-01-03', '10:01', '2040-01-03 10:00'), true, 'future local start is eligible');
select ok(not has_function_privilege('public', 'private.is_basic_medical_schedule_start_after(date,time,timestamp without time zone)'::regprocedure, 'execute'), 'predicate helper is not PUBLIC');

select set_config('role', 'anon', true);
select throws_ok($$ select private.is_basic_medical_schedule_start_after('2040-01-03', '10:01', '2040-01-03 10:00') $$, '42501', 'permission denied for schema private', 'anon cannot execute the private predicate helper');
select throws_ok($$ select public.cancel_basic_medical_registration((select registration_id from y03_cancel_context), 'anon') $$, '42501', 'permission denied for function cancel_basic_medical_registration', 'anon cannot execute the cancellation RPC');
select set_config('role', 'postgres', true);

-- Make public-RPC transition selection deterministic while preserving the production helper's
-- independently tested strict predicate above. The transaction rolls this test seam back.
create or replace function private.is_basic_medical_schedule_start_after(
  target_schedule_date date,
  target_start_time time,
  target_business_now timestamp without time zone
)
returns boolean language sql immutable set search_path = '' as $$
  select (target_schedule_date + target_start_time) > timestamp '2040-01-03 10:00';
$$;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select ordinary_id from y03_cancel_context))::text, true);
select throws_ok($$ select public.cancel_basic_medical_registration((select registration_id from y03_cancel_context), 'ordinary') $$, '42501', 'BASIC_MEDICAL_MANAGER_REQUIRED', 'unscoped staff cannot cancel a Basic Medical registration');

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from y03_cancel_context))::text, true);
update y03_cancel_context set first_result = public.cancel_basic_medical_registration(registration_id, 'Y03 boundary cancel');
select set_config('role', 'postgres', true);

select is((select (first_result->>'cancelled_schedules')::integer from y03_cancel_context), 1, 'admin cancellation returns the actual future transition count');
select is((select string_agg(course_name_snapshot || ':' || schedule_status::text, ',' order by course_name_snapshot) from public.class_schedules where basic_medical_registration_id = (select registration_id from y03_cancel_context)), 'Already cancelled:cancelled,Completed:completed,Exact start:published,Future:cancelled,Past day:published,Same day ongoing:published,Same day started:published', 'only the strict-future schedule transitions');
select is((select invalidated_at is null from public.basic_medical_session_confirmations where id = (select preserved_confirmation_id from y03_cancel_context)), true, 'same-day already-started schedule confirmation remains active');
select is((select invalidated_at is not null from public.basic_medical_session_confirmations where id = (select future_confirmation_id from y03_cancel_context)), true, 'transitioned future schedule confirmation is invalidated');
select is((select count(*)::integer from public.basic_medical_registrations where id = (select registration_id from y03_cancel_context)), 1, 'registration row remains after cancellation');
select is((select count(*)::integer from public.basic_medical_registration_sessions where registration_id = (select registration_id from y03_cancel_context)), 7, 'all linked session rows remain after cancellation');
select is((select count(*)::integer from public.email_outbox_events where event_key = concat('basic_medical:registration:', (select registration_id from y03_cancel_context), ':cancelled')), 1, 'exactly one registration cancellation outbox event is written');
select is(
  (select payload->'schedules' from public.email_outbox_events where event_key = concat('basic_medical:registration:', (select registration_id from y03_cancel_context), ':cancelled')),
  (select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', sessions.id,
    'class_schedule_id', sessions.class_schedule_id,
    'lesson_title', sessions.lesson_title,
    'session_number', sessions.session_number,
    'schedule_date', schedules.schedule_date,
    'start_time', schedules.start_time,
    'end_time', schedules.end_time,
    'room', concat_ws(' ' || chr(183) || ' ', rooms.room_code, rooms.building_code),
    'lecturer', profiles.full_name,
    'student_count', schedules.student_count
  ) order by schedules.schedule_date, schedules.start_time, sessions.session_number, sessions.id), '[]'::jsonb)
  from public.basic_medical_registration_sessions sessions
  left join public.class_schedules schedules on schedules.id = sessions.class_schedule_id
  left join public.rooms rooms on rooms.id = schedules.room_id
  left join public.profiles profiles on profiles.id = sessions.teaching_lecturer_id
  where sessions.registration_id = (select registration_id from y03_cancel_context)),
  'cancellation outbox contains the exact seven-session pre-cancel snapshot'
);
select is((select count(*)::integer from public.audit_logs where action = 'basic_medical.registration_cancelled' and entity_id = (select registration_id from y03_cancel_context)), 1, 'one cancellation audit row is written');
select is((select (metadata->>'cancelled_schedules')::integer from public.audit_logs where action = 'basic_medical.registration_cancelled' and entity_id = (select registration_id from y03_cancel_context)), 1, 'audit metadata equals the actual transition set count');

create temp table y03_after_first_registration as
select cancelled_at, cancelled_by, cancel_reason, updated_at
from public.basic_medical_registrations
where id = (select registration_id from y03_cancel_context);
create temp table y03_after_first_schedules as
select id, schedule_status, cancelled_by, cancelled_at, updated_at
from public.class_schedules
where basic_medical_registration_id = (select registration_id from y03_cancel_context)
order by id;
create temp table y03_after_first_confirmations as
select id, invalidated_at, invalidated_reason
from public.basic_medical_session_confirmations
where id in ((select preserved_confirmation_id from y03_cancel_context), (select future_confirmation_id from y03_cancel_context))
order by id;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from y03_cancel_context))::text, true);
update y03_cancel_context set second_result = public.cancel_basic_medical_registration(registration_id, 'repeat');
select set_config('role', 'postgres', true);

select is((select (second_result->>'already_cancelled')::boolean from y03_cancel_context), true, 'second cancellation is an idempotent success');
select is((select count(*)::integer from public.email_outbox_events where event_key = concat('basic_medical:registration:', (select registration_id from y03_cancel_context), ':cancelled')), 1, 'second cancellation creates no duplicate outbox event');
select is((select count(*)::integer from public.audit_logs where action = 'basic_medical.registration_cancelled' and entity_id = (select registration_id from y03_cancel_context)), 1, 'second cancellation creates no duplicate audit row');
select is((select schedule_status::text from public.class_schedules where id = (select future_schedule_id from y03_cancel_context)), 'cancelled', 'second cancellation does not rewrite transitioned schedule state');
select is(
  (select jsonb_agg(to_jsonb(rows)) from (select cancelled_at, cancelled_by, cancel_reason, updated_at from public.basic_medical_registrations where id = (select registration_id from y03_cancel_context)) rows),
  (select jsonb_agg(to_jsonb(rows)) from (select * from y03_after_first_registration) rows),
  'second cancellation leaves registration cancellation fields byte-for-byte unchanged'
);
select is(
  (select jsonb_agg(to_jsonb(rows) order by rows.id) from (select id, schedule_status, cancelled_by, cancelled_at, updated_at from public.class_schedules where basic_medical_registration_id = (select registration_id from y03_cancel_context)) rows),
  (select jsonb_agg(to_jsonb(rows) order by rows.id) from (select * from y03_after_first_schedules) rows),
  'second cancellation leaves every linked schedule mutation field byte-for-byte unchanged'
);
select is(
  (select jsonb_agg(to_jsonb(rows) order by rows.id) from (select id, invalidated_at, invalidated_reason from public.basic_medical_session_confirmations where id in ((select preserved_confirmation_id from y03_cancel_context), (select future_confirmation_id from y03_cancel_context))) rows),
  (select jsonb_agg(to_jsonb(rows) order by rows.id) from (select * from y03_after_first_confirmations) rows),
  'second cancellation leaves confirmation invalidation timestamps and reasons byte-for-byte unchanged'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select scoped_staff_id from y03_cancel_context))::text, true);
update y03_cancel_context set staff_result = public.cancel_basic_medical_registration(staff_registration_id, 'scoped staff');
select set_config('role', 'postgres', true);

select is((select (staff_result->>'cancelled_schedules')::integer from y03_cancel_context), 1, 'Basic-Medical-scoped Staff can cancel a registration');
select is((select schedule_status::text from public.class_schedules where id = (select staff_future_schedule_id from y03_cancel_context)), 'cancelled', 'scoped Staff cancellation transitions its future schedule');

-- The one-session correction is deliberately independent of the old
-- registration-wide future-only operation: a past unconfirmed session is
-- cancellable and the linked-schedule guard accepts only the RPC-local GUC.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from y03_cancel_context), 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.cancel_basic_medical_session(
    (select sessions.id from public.basic_medical_registration_sessions sessions where sessions.class_schedule_id = (select past_schedule_id from y03_cancel_context)),
    'correct past unconfirmed session'
  )$$,
  'Admin can cancel one past unconfirmed Basic Medical session through the canonical guarded RPC'
);
select set_config('role', 'postgres', true);
select is(
  (select schedule_status::text from public.class_schedules where id = (select past_schedule_id from y03_cancel_context)),
  'cancelled',
  'one-session cancellation passes the linked schedule mutation guard'
);
select is(
  (select cancellation_reason from public.basic_medical_registration_sessions where class_schedule_id = (select past_schedule_id from y03_cancel_context)),
  'correct past unconfirmed session',
  'one-session cancellation persists its accountable trimmed reason'
);
select is(
  (select count(*)::integer from public.email_outbox_events where event_key = concat('basic_medical:schedule:', (select past_schedule_id from y03_cancel_context), ':cancelled')),
  1,
  'one-session cancellation enqueues exactly one canonical schedule_cancelled outbox event'
);
select is(
  (select count(*)::integer from public.audit_logs where action = 'basic_medical.session_cancelled' and entity_id = (select sessions.id from public.basic_medical_registration_sessions sessions where sessions.class_schedule_id = (select past_schedule_id from y03_cancel_context))),
  1,
  'one-session cancellation writes one audit record'
);
select set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.cancel_basic_medical_session((select sessions.id from public.basic_medical_registration_sessions sessions where sessions.class_schedule_id = (select past_schedule_id from y03_cancel_context)), '   ')$$,
  '22023',
  'BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED',
  'one-session cancellation rejects a blank reason directly'
);
select lives_ok(
  $$select public.cancel_basic_medical_session((select sessions.id from public.basic_medical_registration_sessions sessions where sessions.class_schedule_id = (select past_schedule_id from y03_cancel_context)), 'repeat cancellation')$$,
  'one-session cancellation is idempotent with an accountable repeat request'
);
select set_config('role', 'postgres', true);
select is(
  (select count(*)::integer from public.email_outbox_events where event_key = concat('basic_medical:schedule:', (select past_schedule_id from y03_cancel_context), ':cancelled')),
  1,
  'idempotent one-session cancellation does not duplicate its outbox event'
);

create function public.y03_injected_cancel_audit_failure()
returns trigger language plpgsql as $$
begin
  if new.action = 'basic_medical.session_cancelled' then
    raise exception 'Y03_INJECTED_CANCEL_AUDIT_FAILURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger y03_injected_cancel_audit_failure
before insert on public.audit_logs for each row
execute function public.y03_injected_cancel_audit_failure();

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from y03_cancel_context), 'role', 'authenticated')::text, true);
select throws_ok(
  $$select public.cancel_basic_medical_session(
    (select sessions.id from public.basic_medical_registration_sessions sessions where sessions.class_schedule_id = (select exact_schedule_id from y03_cancel_context)),
    'force rollback after schedule write'
  )$$,
  'P0001',
  'Y03_INJECTED_CANCEL_AUDIT_FAILURE',
  'a failure after the guarded schedule mutation aborts the one-session cancellation'
);
select set_config('role', 'postgres', true);
select ok(
  (select schedule_status = 'published' from public.class_schedules where id = (select exact_schedule_id from y03_cancel_context))
  and (select cancelled_at is null from public.basic_medical_registration_sessions where class_schedule_id = (select exact_schedule_id from y03_cancel_context)),
  'injected post-update failure rolls back both schedule and session cancellation state'
);

select * from finish();
rollback;
