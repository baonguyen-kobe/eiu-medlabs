begin;

select plan(58);

create temporary table feature_context as
select
  gen_random_uuid() as root_id,
  gen_random_uuid() as manager_id,
  (select id from public.room_types where is_active order by name limit 1) as first_type_id,
  (select id from public.room_types where is_active order by name offset 1 limit 1) as second_type_id,
  gen_random_uuid() as room_one_id,
  gen_random_uuid() as room_two_id,
  gen_random_uuid() as course_id;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, root_id, 'authenticated', 'authenticated',
  'pwb-root@campus.local', crypt('PwbRootPassword123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"PWB Root"}'::jsonb, now(), now()
from feature_context
union all
select
  '00000000-0000-0000-0000-000000000000'::uuid, manager_id, 'authenticated', 'authenticated',
  'pwb-manager@campus.local', crypt('PwbManagerPassword123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"PWB Manager"}'::jsonb, now(), now()
from feature_context;

insert into public.user_roles (user_id, role)
select root_id, 'admin'::public.app_role from feature_context
union all
select manager_id, 'admin'::public.app_role from feature_context;

insert into public.system_security_principals (
  singleton, root_admin_id, personnel_manager_id, configured_by
)
select true, root_id, manager_id, root_id from feature_context
on conflict (singleton) do update set
  root_admin_id = excluded.root_admin_id,
  personnel_manager_id = excluded.personnel_manager_id,
  configured_by = excluded.configured_by;

select ok((select root_id is not null from feature_context), 'seeded Root Administrator is available');
select ok((select first_type_id is not null and second_type_id is not null from feature_context), 'two active room types are available for guarded catalog tests');

insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity)
select room_one_id, 'PWB-101', 'PWB', 'Password batch room one', first_type_id, 10 from feature_context
union all
select room_two_id, 'PWB-102', 'PWB', 'Password batch room two', first_type_id, 20 from feature_context;

insert into public.courses (id, course_code, course_name, room_type_id)
select course_id, 'PWB-COURSE', 'Password batch course', first_type_id from feature_context;

grant select on feature_context to authenticated;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select root_id from feature_context), 'role', 'authenticated')::text, true);

select is(
  public.set_catalog_rooms_active(array[(select room_one_id from feature_context)], false),
  1,
  'Root can deactivate a selected room through the canonical batch RPC'
);

select is(
  (select is_active from public.rooms where id = (select room_one_id from feature_context)),
  false,
  'batch room activation change is persisted'
);

select throws_ok(
  $$select public.update_catalog_rooms_batch(jsonb_build_array(
      jsonb_build_object('id', (select room_one_id from feature_context), 'room_code', 'PWB-101-CHANGED', 'building_code', 'PWB', 'room_name', 'Changed room', 'capacity', 11, 'room_type_id', (select second_type_id from feature_context)),
      jsonb_build_object('id', (select room_two_id from feature_context), 'room_code', 'PWB-102-CHANGED', 'building_code', 'PWB', 'room_name', 'Bad room', 'capacity', 22, 'room_type_id', '00000000-0000-0000-0000-000000000000')
    ))$$,
  '22023',
  'INVALID_CATALOG_BATCH',
  'an invalid record rejects the entire room batch'
);

select is(
  (select room_code from public.rooms where id = (select room_one_id from feature_context)),
  'PWB-101',
  'failed room batch leaves earlier selected rows unchanged'
);

select is(
  public.update_catalog_courses_batch(jsonb_build_array(
    jsonb_build_object('id', (select course_id from feature_context), 'course_code', 'PWB-COURSE-EDIT', 'course_name', 'Password batch course edited', 'room_type_id', (select second_type_id from feature_context))
  )),
  1,
  'Root can atomically edit every supported course field through the batch RPC'
);

select is(
  (select course_code || ':' || course_name from public.courses where id = (select course_id from feature_context)),
  'PWB-COURSE-EDIT:Password batch course edited',
  'course batch edit persists code and name together'
);

select lives_ok(
  $$select public.clear_own_must_change_password('password_recovered')$$,
  'ordinary password recovery completion is a safe no-op when no forced flag exists'
);

select lives_ok(
  $$select public.begin_personnel_password_reset((select root_id from feature_context))$$,
  'Root can begin a password reset only for a password-capable account'
);

select throws_ok(
  $$select public.clear_own_must_change_password('password_changed')$$,
  '22023',
  'PASSWORD_CHANGE_NOT_COMPLETED',
  'a forced user cannot clear the flag without an Auth password change'
);

select ok(
  (select must_change_password from public.profiles where id = (select root_id from feature_context)),
  'failed direct clear preserves the forced-password state'
);

create temporary table password_operation_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_operation_context to authenticated, service_role;

select throws_ok(
  $$select public.record_personnel_password_auth_result((select operation_id from password_operation_context), true, null)$$,
  '42501',
  'permission denied for function record_personnel_password_auth_result',
  'an authenticated caller cannot forge a successful Auth password phase'
);

select throws_ok(
  $$select public.commit_personnel_password_operation((select operation_id from password_operation_context))$$,
  '42501',
  'permission denied for function commit_personnel_password_operation',
  'an authenticated caller cannot commit a password operation directly'
);

select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_operation_context)),
  'reserved',
  'forged successful phase leaves the durable operation reserved'
);
select set_config('role', 'authenticated', true);

select ok(
  not has_function_privilege('authenticated', 'public.record_personnel_password_auth_result(uuid,boolean,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.commit_personnel_password_operation(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_personnel_password_reconciliation_required(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_personnel_password_auth_result(uuid,boolean,text)', 'EXECUTE'),
  'password Auth-result, commit, and reconciliation RPCs are service-role-only'
);

select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_operation_context))$$,
  'service records the durable pre-Auth update marker before any Auth mutation'
);
select lives_ok(
  $$select public.record_personnel_password_auth_result((select operation_id from password_operation_context), false, 'injected_auth_failure')$$,
  'service role records a truthful terminal Auth failure'
);
select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_operation_context)),
  'auth_failed',
  'Auth failure releases the reservation without claiming success'
);
select ok(
  not exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_operation_context)),
  'terminal direct Auth failure deletes private pre-Auth evidence'
);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table password_partial_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_partial_context to authenticated, service_role;

select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_partial_context))$$,
  'post-Auth partial fixture has durable pre-Auth evidence'
);
select lives_ok(
  $$select public.record_personnel_password_auth_result((select operation_id from password_partial_context), true, null)$$,
  'service role records the completed Auth phase before a later injected DB failure'
);
select set_config('role', 'postgres', true);
create function public.pwb_injected_password_commit_audit_failure()
returns trigger language plpgsql as $$
begin
  if new.action = 'password_reset' then
    raise exception 'PWB_INJECTED_PASSWORD_COMMIT_FAILURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pwb_injected_password_commit_audit_failure
before insert on public.audit_logs for each row
execute function public.pwb_injected_password_commit_audit_failure();
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.commit_personnel_password_operation((select operation_id from password_partial_context))$$,
  'P0001',
  'PWB_INJECTED_PASSWORD_COMMIT_FAILURE',
  'a post-Auth database finalization failure is surfaced instead of being reported as a normal success'
);
select set_config('role', 'postgres', true);
drop trigger pwb_injected_password_commit_audit_failure on public.audit_logs;
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_partial_context)),
  'auth_updated',
  'failed commit retains truthful Auth-updated state for reconciliation'
);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.mark_personnel_password_reconciliation_required((select operation_id from password_partial_context), 'injected_commit_failure')$$,
  'service compensation marks a post-Auth partial failure for reconciliation'
);
select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_partial_context)),
  'reconciliation_required',
  'partial password failure is never misrepresented as an Auth failure or a committed success'
);
select ok(
  exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_partial_context)),
  'active reconciliation-required operation retains private evidence until it can settle'
);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.reconcile_personnel_password_operation((select operation_id from password_partial_context))$$,
  'service reconciliation can finalize only the durably recorded successful Auth phase without password input'
);
select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_partial_context)),
  'committed',
  'safe password reconciliation finalizes the known Auth-success partial state'
);
select ok(
  not exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_partial_context)),
  'terminal reconciled commit deletes private evidence'
);

create temporary table password_result_write_failure_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_result_write_failure_context to authenticated, service_role;
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_result_write_failure_context))$$,
  'exact result-write failure fixture persists pre-Auth evidence before simulated Auth success'
);
select set_config('role', 'postgres', true);
update auth.users set encrypted_password = crypt('ResultWriteChanged123!', gen_salt('bf'))
where id = (select manager_id from feature_context);
create function public.pwb_injected_auth_result_write_failure()
returns trigger language plpgsql as $$
begin
  if new.status = 'auth_updated' then
    raise exception 'PWB_INJECTED_AUTH_RESULT_WRITE_FAILURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pwb_injected_auth_result_write_failure
before update on public.personnel_password_operations for each row
execute function public.pwb_injected_auth_result_write_failure();
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.record_personnel_password_auth_result((select operation_id from password_result_write_failure_context), true, null)$$,
  'P0001',
  'PWB_INJECTED_AUTH_RESULT_WRITE_FAILURE',
  'injected result persistence failure occurs after the simulated external Auth success'
);
select set_config('role', 'postgres', true);
drop trigger pwb_injected_auth_result_write_failure on public.personnel_password_operations;
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_result_write_failure_context)),
  'auth_update_started',
  'failed Auth-result write leaves the pre-Auth durable state discoverable instead of falsely reserved or lost'
);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.reconcile_personnel_password_operation((select operation_id from password_result_write_failure_context))->>'outcome'),
  'committed',
  'service reconciliation derives Auth success from durable pre-Auth evidence and commits without plaintext'
);
select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_result_write_failure_context)),
  'committed',
  'successful reconciliation clears the active unique-index reservation rather than permanently blocking the target'
);

create temporary table password_begin_failure_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_begin_failure_context to authenticated, service_role;
create function public.pwb_injected_password_begin_failure()
returns trigger language plpgsql as $$
begin
  if new.status = 'auth_update_started' then
    raise exception 'PWB_INJECTED_PASSWORD_BEGIN_FAILURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pwb_injected_password_begin_failure
before update on public.personnel_password_operations for each row
execute function public.pwb_injected_password_begin_failure();
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_begin_failure_context))$$,
  'P0001',
  'PWB_INJECTED_PASSWORD_BEGIN_FAILURE',
  'injected pre-Auth begin failure prevents any external Auth call'
);
select set_config('role', 'postgres', true);
drop trigger pwb_injected_password_begin_failure on public.personnel_password_operations;
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_begin_failure_context)),
  'reserved',
  'failed pre-Auth begin leaves only a safe reserved operation for immediate release'
);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  (public.reconcile_personnel_password_operation((select operation_id from password_begin_failure_context))->>'outcome'),
  'auth_failed',
  'service reconciliation releases a failed pre-Auth begin without claiming an Auth change'
);
select set_config('role', 'postgres', true);
select ok(
  not exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_begin_failure_context)),
  'terminal reconciled pre-Auth failure deletes private evidence'
);
-- Model an external updateUserById call that throws after either changing or
-- not changing Auth. The app records outcome-unknown and reconciliation must
-- derive the truth from the private pre-Auth hash, never record false.
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table password_throw_unchanged_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_throw_unchanged_context to authenticated, service_role;
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_throw_unchanged_context))$$,
  'unchanged-then-throw fixture records a durable pre-Auth marker'
);
select lives_ok(
  $$select public.mark_personnel_password_reconciliation_required((select operation_id from password_throw_unchanged_context), 'auth_update_outcome_unknown')$$,
  'unchanged thrown Auth outcome is recorded only as reconciliation-required'
);
select is(
  public.reconcile_personnel_password_operation((select operation_id from password_throw_unchanged_context))->>'outcome',
  'auth_failed',
  'reconciliation truthfully derives unchanged thrown Auth outcome as auth_failed'
);
select set_config('role', 'postgres', true);
select ok(
  not exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_throw_unchanged_context)),
  'unchanged thrown outcome cleanup removes private evidence after terminal failure'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create temporary table password_throw_changed_context as
select public.reserve_personnel_password_operation(
  (select manager_id from feature_context), 'password_reset'
) as operation_id;
grant select on password_throw_changed_context to authenticated, service_role;
select ok(
  (select operation_id is not null from password_throw_changed_context),
  'unchanged thrown outcome releases uniqueness so a retry can reserve the target'
);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.begin_personnel_password_auth_update((select operation_id from password_throw_changed_context))$$,
  'changed-then-throw fixture records a durable pre-Auth marker'
);
select set_config('role', 'postgres', true);
update auth.users set encrypted_password = crypt('ThrownAfterChange123!', gen_salt('bf'))
where id = (select manager_id from feature_context);
select set_config('role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.mark_personnel_password_reconciliation_required((select operation_id from password_throw_changed_context), 'auth_update_outcome_unknown')$$,
  'changed thrown Auth outcome is never recorded as a false Auth failure'
);
select is(
  public.reconcile_personnel_password_operation((select operation_id from password_throw_changed_context))->>'outcome',
  'committed',
  'reconciliation derives changed thrown Auth outcome and commits without plaintext'
);
select set_config('role', 'postgres', true);
select is(
  (select status from public.personnel_password_operations where id = (select operation_id from password_throw_changed_context)),
  'committed',
  'changed thrown outcome is terminally committed and no longer blocks retries'
);
select ok(
  not exists (select 1 from private.personnel_password_auth_evidence where operation_id = (select operation_id from password_throw_changed_context)),
  'changed thrown outcome cleanup removes private evidence after reconciliation'
);
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.reserve_personnel_password_operation((select manager_id from feature_context), 'password_reset')$$,
  'changed thrown outcome releases uniqueness for a subsequent safe retry'
);

select throws_ok(
  $$select public.update_catalog_room(
    (select room_one_id from feature_context), 'PWB-101', 'PWB', 'Invalid capacity', 0,
    (select first_type_id from feature_context)
  )$$,
  '22023',
  'INVALID_ROOM_CAPACITY',
  'single room edit rejects zero capacity with the canonical validation error'
);

select throws_ok(
  $$select public.update_catalog_rooms_batch(jsonb_build_array(jsonb_build_object(
    'id', (select room_one_id from feature_context), 'room_code', 'PWB-101',
    'building_code', 'PWB', 'room_name', 'Invalid capacity', 'capacity', 0,
    'room_type_id', (select first_type_id from feature_context)
  )))$$,
  '22023',
  'INVALID_ROOM_CAPACITY',
  'batch room edit rejects zero capacity through the canonical validation error'
);

select throws_ok(
  $$select public.apply_catalog_room_import(jsonb_build_array(jsonb_build_object(
    'room_code', 'PWB-IMPORT-ZERO', 'building_code', 'PWB', 'room_name', 'Invalid capacity',
    'capacity', 0, 'room_type_id', (select first_type_id from feature_context)
  )))$$,
  '22023',
  'INVALID_ROOM_CAPACITY',
  'room import rejects zero capacity before the generic table constraint'
);

select set_config('role', 'postgres', true);

select throws_ok(
  $$insert into public.rooms (room_code, building_code, room_name, room_type_id, capacity)
    values ('PWB-DIRECT-ZERO', 'PWB', 'Invalid direct capacity',
      (select first_type_id from feature_context), 0)$$,
  '23514',
  'new row for relation "rooms" violates check constraint "rooms_capacity_positive"',
  'direct table writes retain the final non-null capacity >= 1 constraint'
);

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select root_id from feature_context), 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.list_basic_medical_schedule_confirmation_states('{}'::uuid[])$$,
  'Admin can read only the bounded calendar confirmation-state contract'
);
select ok(
  not exists (
    select 1
    from public.list_operational_shift_assignees()
    where id = (select root_id from feature_context)
  ),
  'Root remains visible historically but is absent from the canonical operational shift picker'
);
select set_config('role', 'postgres', true);

select ok(
  exists (select 1 from pg_trigger where tgname = 'rooms_protect_type_history' and tgenabled = 'O')
  and exists (select 1 from pg_trigger where tgname = 'courses_protect_type_history' and tgenabled = 'O'),
  'direct Admin table writes cannot bypass the database type-history trigger'
);

select ok(
  not has_function_privilege('anon', 'public.begin_personnel_password_reset(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_catalog_rooms_batch(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_basic_medical_schedule_confirmation_states(uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.list_basic_medical_schedule_confirmation_states(uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.update_catalog_rooms_batch(jsonb)', 'EXECUTE'),
  'sensitive personnel and catalog batch RPCs are authenticated-only'
);

select * from finish();
rollback;
