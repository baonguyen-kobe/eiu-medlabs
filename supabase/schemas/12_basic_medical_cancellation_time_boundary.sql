-- Declarative final state for BUG-Y-CALENDAR-CANCEL-001.
-- Preserve current/history sessions by cancelling only strictly future starts.

create or replace function private.is_basic_medical_schedule_start_after(
  target_schedule_date date,
  target_start_time time,
  target_business_now timestamp without time zone
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (target_schedule_date + target_start_time) > target_business_now;
$$;

revoke all on function private.is_basic_medical_schedule_start_after(
  date, time, timestamp without time zone
) from public, anon, authenticated;

create or replace function public.cancel_basic_medical_registration(
  target_registration_id uuid,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_row public.basic_medical_registrations%rowtype;
  business_now timestamp without time zone;
  cancelled_schedule_ids uuid[] := '{}'::uuid[];
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

  business_now := clock_timestamp() at time zone 'Asia/Ho_Chi_Minh';

  perform private.enqueue_basic_medical_registration_outbox_event(
    target_registration_id,
    'cancelled',
    actor_id,
    null
  );

  perform set_config('app.basic_medical_registration_mutation', 'true', true);

  with cancelled_schedules as (
    update public.class_schedules schedules
    set schedule_status = 'cancelled', cancelled_by = actor_id,
        cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
    where schedules.basic_medical_registration_id = target_registration_id
      and schedules.schedule_status not in ('cancelled', 'completed')
      and private.is_basic_medical_schedule_start_after(
        schedules.schedule_date,
        schedules.start_time,
        business_now
      )
    returning schedules.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into cancelled_schedule_ids
  from cancelled_schedules;
  cancelled_schedule_count := cardinality(cancelled_schedule_ids);

  update public.basic_medical_session_confirmations confirmations
  set invalidated_at = coalesce(confirmations.invalidated_at, clock_timestamp()),
      invalidated_reason = coalesce(confirmations.invalidated_reason, 'Buổi học Y cơ sở đã được hủy.')
  from public.basic_medical_registration_sessions sessions
  where confirmations.registration_id_snapshot = target_registration_id
    and confirmations.session_id = sessions.id
    and sessions.class_schedule_id = any(cancelled_schedule_ids)
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

  return jsonb_build_object(
    'id', target_registration_id,
    'already_cancelled', false,
    'cancelled_schedules', cancelled_schedule_count
  );
end;
$$;

revoke all on function public.cancel_basic_medical_registration(uuid, text) from public, anon;
grant execute on function public.cancel_basic_medical_registration(uuid, text) to authenticated;
