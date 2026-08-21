begin;
select plan(31);

-- Setup test users
create or replace function pg_temp.setup_test_data() returns void language plpgsql as $$
declare
  skills_type_id uuid;
  basic_type_id uuid;
  staff_user_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  admin_user_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  root_user_id uuid := '33333333-3333-3333-3333-333333333333'::uuid;
  basic_only_id uuid := '44444444-4444-4444-4444-444444444444'::uuid;
  history_mgr_id uuid := '55555555-5555-5555-5555-555555555555'::uuid;
begin
  select id into skills_type_id from public.room_types where code = 'nursing_skills';
  select id into basic_type_id from public.room_types where code = 'basic_medical';

  -- Auth users
  insert into auth.users (id, email)
  values
    (staff_user_id, 'staff.skills@eiu.edu.vn'),
    (admin_user_id, 'admin.skills@eiu.edu.vn'),
    (root_user_id, 'root.user@eiu.edu.vn'),
    (basic_only_id, 'basic.staff@eiu.edu.vn'),
    (history_mgr_id, 'history.manager@eiu.edu.vn')
  on conflict (id) do nothing;

  -- Profiles
  insert into public.profiles (id, email, full_name, is_active, can_manage_shift_history)
  values
    (staff_user_id, 'staff.skills@eiu.edu.vn', 'Staff Skills User', true, false),
    (admin_user_id, 'admin.skills@eiu.edu.vn', 'Admin Skills User', true, false),
    (root_user_id, 'root.user@eiu.edu.vn', 'Root Administrator User', true, false),
    (basic_only_id, 'basic.staff@eiu.edu.vn', 'Basic Medical Staff', true, false),
    (history_mgr_id, 'history.manager@eiu.edu.vn', 'History Manager User', true, true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    can_manage_shift_history = excluded.can_manage_shift_history;

  -- Roles
  insert into public.user_roles (user_id, role, created_by)
  values
    (staff_user_id, 'staff', staff_user_id),
    (admin_user_id, 'admin', admin_user_id),
    (root_user_id, 'admin', root_user_id),
    (basic_only_id, 'staff', basic_only_id),
    (history_mgr_id, 'staff', history_mgr_id)
  on conflict do nothing;

  -- System security principals
  insert into public.system_security_principals (singleton, root_admin_id, personnel_manager_id)
  values (true, root_user_id, admin_user_id)
  on conflict (singleton) do update set
    root_admin_id = excluded.root_admin_id,
    personnel_manager_id = excluded.personnel_manager_id;

  -- Room types
  delete from public.profile_room_types where profile_id in (staff_user_id, admin_user_id, root_user_id, basic_only_id, history_mgr_id);

  insert into public.profile_room_types (profile_id, room_type_id, receive_schedule_emails, created_by)
  values
    (staff_user_id, skills_type_id, false, staff_user_id),
    (admin_user_id, skills_type_id, false, admin_user_id),
    (root_user_id, skills_type_id, false, root_user_id),
    (basic_only_id, basic_type_id, false, basic_only_id),
    (history_mgr_id, skills_type_id, false, history_mgr_id);
end;
$$;

select pg_temp.setup_test_data();

-- Helper function to set test auth context
create or replace function pg_temp.set_test_user(target_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', target_user_id::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', target_user_id, 'role', 'authenticated')::text, false);
end;
$$;

-- 1. Test list_operational_shift_assignees directory
select pg_temp.set_test_user('11111111-1111-1111-1111-111111111111'::uuid);

select results_eq(
  $$
    select full_name from public.list_operational_shift_assignees()
    where full_name in ('Staff Skills User', 'Admin Skills User', 'Root Administrator User', 'Basic Medical Staff', 'History Manager User')
    order by full_name
  $$,
  $$
    values
      ('Admin Skills User'::text),
      ('History Manager User'::text),
      ('Staff Skills User'::text)
  $$,
  'list_operational_shift_assignees excludes Root and Basic-Medical-only users'
);

-- 2. Test Morning registration valid time & grid
select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00',
          'note', 'Morning shift test'
        )
      )
    )
  $$,
  'Staff can register valid morning shift for self'
);

-- 3. Duplicate active slot throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:30',
          'end_time', '10:30'
        )
      )
    )
  $$,
  'ACTIVE_SHIFT_EXISTS: Staff 11111111-1111-1111-1111-111111111111 already has an active MORNING shift on ' || (((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date)::text,
  'Duplicate active morning shift is rejected'
);

-- 4. Invalid morning time (< 07:00) throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '06:30',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid',
  'Morning shift earlier than 07:00 is rejected'
);

-- 5. Invalid morning time (> 11:00) throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:30'
        )
      )
    )
  $$,
  'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid',
  'Morning shift later than 11:00 is rejected'
);

-- 6. Invalid 30-minute grid (e.g. 07:15) throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:15',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid',
  'Morning shift off 30-minute grid is rejected'
);

-- 7. Afternoon valid registration
select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      )
    )
  $$,
  'Staff can register valid afternoon shift for self on same date as morning'
);

-- 8. Afternoon invalid time (< 13:00) throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '12:30',
          'end_time', '16:00'
        )
      )
    )
  $$,
  'INVALID_AFTERNOON_TIME: Afternoon shift must be within 13:00-16:00 on 30-minute grid',
  'Afternoon shift earlier than 13:00 is rejected'
);

-- 9. Afternoon invalid time (> 16:00) throws error
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '3 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:30'
        )
      )
    )
  $$,
  'INVALID_AFTERNOON_TIME: Afternoon shift must be within 13:00-16:00 on 30-minute grid',
  'Afternoon shift later than 16:00 is rejected'
);

-- 10. All-Day atomic creation (Morning + Afternoon)
select is(
  (
    select count(*)::integer from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '4 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        ),
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '4 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      )
    )
  ),
  2,
  'All-day registration creates 2 independent shift records atomically'
);

-- 11. All-Day conflict if one slot already taken fails entire batch
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '4 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        ),
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      )
    )
  $$,
  'ACTIVE_SHIFT_EXISTS: Staff 11111111-1111-1111-1111-111111111111 already has an active MORNING shift on ' || (((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '4 days')::date)::text,
  'Batch registration fails atomically when one slot is active'
);

-- 12. Staff cannot register for another person
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '55555555-5555-5555-5555-555555555555'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'PERMISSION_DENIED: Staff members can only register shifts for themselves',
  'Staff cannot register shifts for other users'
);

-- 13. Admin CAN register for eligible staff
select pg_temp.set_test_user('22222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '55555555-5555-5555-5555-555555555555'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'Admin can assign shift to eligible staff'
);

-- 14. Admin assigning to Root fails
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '33333333-3333-3333-3333-333333333333'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      )
    )
  $$,
  'ASSIGNEE_NOT_ELIGIBLE: User 33333333-3333-3333-3333-333333333333 is not eligible for Skills Lab shifts',
  'Admin cannot assign shift to Root user'
);

-- 15. Admin assigning to Basic-Medical-only fails
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '44444444-4444-4444-4444-444444444444'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '5 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      )
    )
  $$,
  'ASSIGNEE_NOT_ELIGIBLE: User 44444444-4444-4444-4444-444444444444 is not eligible for Skills Lab shifts',
  'Admin cannot assign shift to non-skills personnel'
);

-- 16. Soft cancellation test
select pg_temp.set_test_user('11111111-1111-1111-1111-111111111111'::uuid);

do $$
declare
  target_id uuid;
begin
  select id into target_id from public.staff_shifts
  where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
    and shift_slot = 'MORNING'
    and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date;

  perform public.cancel_staff_shift(target_id, 'Personal reason');
end;
$$;

select is(
  (
    select status::text from public.staff_shifts
    where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
      and shift_slot = 'MORNING'
      and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date
  ),
  'cancelled',
  'Shift status updated to cancelled'
);

select is(
  (
    select cancellation_reason from public.staff_shifts
    where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
      and shift_slot = 'MORNING'
      and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date
  ),
  'Personal reason',
  'Shift cancellation reason preserved'
);

-- 17. Re-registration on same slot succeeds after soft-cancellation
select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '08:00',
          'end_time', '11:00',
          'note', 'Re-registered after cancel'
        )
      )
    )
  $$,
  'Re-registration succeeds after soft-cancellation'
);

-- 18. Shift time update within same slot
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.staff_shifts
  where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
    and shift_slot = 'MORNING'
    and status = 'scheduled'
    and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date;

  perform public.update_staff_shift_time(target_id, '07:30'::time, '10:30'::time, 'Updated morning note');
end;
$$;

select is(
  (
    select start_time::text from public.staff_shifts
    where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
      and shift_slot = 'MORNING'
      and status = 'scheduled'
      and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date
  ),
  '07:30:00',
  'Shift start time updated within morning window'
);

-- 19. Shift time update outside slot bounds fails
select throws_ok(
  $$
    select public.update_staff_shift_time(
      (
        select id from public.staff_shifts
        where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
          and shift_slot = 'MORNING'
          and status = 'scheduled'
          and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '2 days')::date
      ),
      '13:00'::time,
      '16:00'::time
    )
  $$,
  'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid',
  'Cannot change morning shift time into afternoon window via edit'
);

-- 20. Historical mutation without history capability fails
select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'HISTORICAL_MUTATION_FORBIDDEN: Historical shifts require history management capability',
  'Normal staff cannot create historical shifts'
);

-- 21. Admin without history capability on historical date fails
select pg_temp.set_test_user('22222222-2222-2222-2222-222222222222'::uuid);

select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'HISTORICAL_MUTATION_FORBIDDEN: Historical shifts require history management capability',
  'Normal admin without history capability cannot create historical shifts'
);

-- 22. User with can_manage_shift_history capability without reason fails
select pg_temp.set_test_user('55555555-5555-5555-5555-555555555555'::uuid);

select throws_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '55555555-5555-5555-5555-555555555555'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'HISTORICAL_REASON_REQUIRED: Reason is required for historical shift mutations',
  'Historical registration requires explicit reason'
);

-- 23. User with can_manage_shift_history capability with reason SUCCEEDS
select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '55555555-5555-5555-5555-555555555555'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      ),
      'Backfilling completed shift from logbook'
    )
  $$,
  'User with history capability can create historical shift with reason'
);

-- 24. Audit log written for historical creation
select pg_temp.set_test_user('22222222-2222-2222-2222-222222222222'::uuid);

select is(
  (
    select count(*)::integer from public.audit_logs
    where action = 'create_historical_shift'
      and actor_id = '55555555-5555-5555-5555-555555555555'::uuid
  ),
  1,
  'Audit log created for historical shift registration'
);

-- 25. Historical cancellation with history capability and reason succeeds
select pg_temp.set_test_user('55555555-5555-5555-5555-555555555555'::uuid);

do $$
declare
  target_id uuid;
begin
  select id into target_id from public.staff_shifts
  where staff_id = '55555555-5555-5555-5555-555555555555'::uuid
    and shift_date = ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '2 days')::date;

  perform public.cancel_staff_shift(target_id, 'Correction of erroneous entry');
end;
$$;

select pg_temp.set_test_user('22222222-2222-2222-2222-222222222222'::uuid);

select is(
  (
    select count(*)::integer from public.audit_logs
    where action = 'cancel_historical_shift'
      and actor_id = '55555555-5555-5555-5555-555555555555'::uuid
  ),
  1,
  'Audit log created for historical shift cancellation'
);

-- 26. Same-day registration / operation is allowed even if start_time has passed
select pg_temp.set_test_user('11111111-1111-1111-1111-111111111111'::uuid);

select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', (now() at time zone 'Asia/Ho_Chi_Minh')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00',
          'note', 'Today shift'
        )
      )
    )
  $$,
  'Same-day shift registration is allowed'
);

-- 27. Same-day cancellation is allowed
select lives_ok(
  $$
    select public.cancel_staff_shift(
      (
        select id from public.staff_shifts
        where staff_id = '11111111-1111-1111-1111-111111111111'::uuid
          and shift_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
          and shift_slot = 'MORNING'
      ),
      'Today emergency'
    )
  $$,
  'Same-day cancellation is allowed'
);

-- 28. Root Administrator implicit historical authority
select pg_temp.set_test_user('33333333-3333-3333-3333-333333333333'::uuid);

select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date - interval '5 days')::date,
          'shift_slot', 'AFTERNOON',
          'start_time', '13:00',
          'end_time', '16:00'
        )
      ),
      'Root administrative historical record creation'
    )
  $$,
  'Root has implicit historical management authority with reason'
);

-- 29. Capacity is unlimited: multiple people can be registered in the same date and slot
select pg_temp.set_test_user('22222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$
    select * from public.register_staff_shifts(
      jsonb_build_array(
        jsonb_build_object(
          'staff_id', '22222222-2222-2222-2222-222222222222'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '10 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        ),
        jsonb_build_object(
          'staff_id', '11111111-1111-1111-1111-111111111111'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '10 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        ),
        jsonb_build_object(
          'staff_id', '55555555-5555-5555-5555-555555555555'::uuid,
          'shift_date', ((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '10 days')::date,
          'shift_slot', 'MORNING',
          'start_time', '07:00',
          'end_time', '11:00'
        )
      )
    )
  $$,
  'Multiple people can be registered in the same date and slot (unlimited capacity)'
);

-- 30. Direct hard DELETE on staff_shifts is revoked
select throws_ok(
  $$
    delete from public.staff_shifts where staff_id = '11111111-1111-1111-1111-111111111111'::uuid;
  $$,
  '42501',
  null,
  'Hard delete on staff_shifts table is forbidden for authenticated users'
);

rollback;
