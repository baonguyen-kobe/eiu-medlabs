set check_function_bodies = false;

-- Expired reservations may already have updated Auth before the application
-- persisted the marker. Keep them active until the service reconciler compares
-- Auth and profile state.
drop index if exists public.personnel_update_operations_reconcile_idx;
create index personnel_update_operations_reconcile_idx
  on public.personnel_update_operations(status, expires_at)
  where status in ('reserved', 'auth_updated', 'rollback_required', 'reconciliation_required');

do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.begin_personnel_update(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    E'  update public.personnel_update_operations\n  set status = case when status = ''reserved'' then ''expired'' else ''reconciliation_required'' end,\n      resolved_at = case when status = ''reserved'' then clock_timestamp() else resolved_at end,\n      last_error = coalesce(last_error, ''Operation expired before a new reservation was requested'')\n  where profile_id = target_profile_id\n    and status in (''reserved'', ''auth_updated'')\n    and expires_at <= clock_timestamp();',
    E'  update public.personnel_update_operations\n  set status = ''reconciliation_required'',\n      last_error = coalesce(last_error, ''Operation expired and requires Auth/Profile reconciliation'')\n  where profile_id = target_profile_id\n    and status = ''auth_updated''\n    and expires_at <= clock_timestamp();'
  );
  execute definition;
end;
$$;

create or replace function public.resolve_personnel_update_operation(
  target_operation_id uuid,
  target_status text,
  target_error text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('committed','rolled_back','reconciliation_required','expired') then
    raise exception 'INVALID_PERSONNEL_OPERATION_STATUS' using errcode = '22023';
  end if;
  update public.personnel_update_operations
  set status = target_status,
      committed_at = case when target_status = 'committed' then coalesce(committed_at, clock_timestamp()) else committed_at end,
      resolved_at = case when target_status in ('committed','rolled_back','expired') then clock_timestamp() else null end,
      last_error = target_error
  where id = target_operation_id
    and status in ('reserved','auth_updated','rollback_required','reconciliation_required');
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;
revoke all on function public.resolve_personnel_update_operation(uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_personnel_update_operation(uuid,text,text) to service_role;

-- Only the registration RPCs may mutate linked class schedules. This prevents
-- generic schedule policies from bypassing the registration aggregate.
create or replace function private.guard_basic_medical_linked_schedule_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.basic_medical_registration_id is not null
    and current_setting('app.basic_medical_registration_mutation', true) is distinct from 'true' then
    raise exception 'BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_basic_medical_linked_schedule_mutation() from public, anon, authenticated;

drop trigger if exists guard_basic_medical_linked_schedule_mutation on public.class_schedules;
create trigger guard_basic_medical_linked_schedule_mutation
before update or delete on public.class_schedules
for each row execute function private.guard_basic_medical_linked_schedule_mutation();

-- Recreate the save function with the transaction-local guard enabled before
-- it replaces linked schedules.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    E'begin\n  if not (select private.can_manage_basic_medical()) then',
    E'begin\n  perform set_config(''app.basic_medical_registration_mutation'', ''true'', true);\n  if not (select private.can_manage_basic_medical()) then'
  );
  execute definition;
end;
$$;

create or replace function public.cancel_basic_medical_registration(
  target_registration_id uuid,
  target_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  target_row public.basic_medical_registrations%rowtype;
  cancelled_schedule_count integer := 0;
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  select * into target_row from public.basic_medical_registrations
  where id = target_registration_id for update;
  if target_row.id is null then
    raise exception 'BASIC_MEDICAL_REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_row.cancelled_at is not null then
    return jsonb_build_object('id', target_row.id, 'already_cancelled', true, 'cancelled_schedules', 0);
  end if;

  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules schedules
  set schedule_status = 'cancelled', cancelled_by = actor_id,
      cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where schedules.basic_medical_registration_id = target_registration_id
    and schedules.schedule_status not in ('cancelled', 'completed')
    and schedules.schedule_date >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics cancelled_schedule_count = row_count;

  update public.basic_medical_session_confirmations confirmations
  set invalidated_at = coalesce(confirmations.invalidated_at, clock_timestamp()),
      invalidated_reason = coalesce(confirmations.invalidated_reason, 'Buổi học Y cơ sở đã được hủy.')
  from public.basic_medical_registration_sessions sessions
  join public.class_schedules schedules on schedules.id = sessions.class_schedule_id
  where confirmations.registration_id_snapshot = target_registration_id
    and confirmations.session_id = sessions.id
    and schedules.schedule_status = 'cancelled'
    and confirmations.invalidated_at is null;

  update public.basic_medical_registrations
  set cancelled_at = clock_timestamp(), cancelled_by = actor_id,
      cancel_reason = nullif(btrim(target_reason), ''), updated_at = clock_timestamp()
  where id = target_registration_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    actor_id, 'basic_medical.registration_cancelled', 'basic_medical_registration',
    target_registration_id,
    jsonb_build_object('cancelled_at', null),
    jsonb_build_object('cancelled_at', clock_timestamp(), 'reason', nullif(btrim(target_reason), '')),
    jsonb_build_object('cancelled_schedules', cancelled_schedule_count)
  );
  return jsonb_build_object('id', target_registration_id, 'already_cancelled', false,
    'cancelled_schedules', cancelled_schedule_count);
end;
$$;
revoke all on function public.cancel_basic_medical_registration(uuid,text) from public, anon;
grant execute on function public.cancel_basic_medical_registration(uuid,text) to authenticated;

create or replace view public.basic_medical_registration_list
with (security_invoker = true)
as
select registrations.id, registrations.created_at, registrations.start_date,
       registrations.end_date, registrations.academic_year, registrations.semester,
  registrations.student_count, courses.course_code, courses.course_name,
       rooms.room_code, rooms.building_code, rooms.room_name,
       registrants.full_name as registrant_name,
       responsible.full_name as responsible_name,
       completion.session_count, completion.confirmed_session_count,
       completion.is_completed,
       concat_ws(' ', registrations.registration_code, courses.course_code,
         courses.course_name, rooms.room_code, rooms.building_code, rooms.room_name,
         registrants.full_name, responsible.full_name) as search_text,
       registrations.registration_code,
       registrations.cancelled_at, registrations.cancelled_by,
       registrations.cancel_reason
from public.basic_medical_registrations registrations
join public.courses courses on courses.id = registrations.course_id
join public.rooms rooms on rooms.id = registrations.room_id
join public.profiles registrants on registrants.id = registrations.registrant_id
join public.profiles responsible on responsible.id = registrations.responsible_lecturer_id
left join public.basic_medical_registration_completion completion
  on completion.registration_id = registrations.id;
grant select on public.basic_medical_registration_list to authenticated, service_role;