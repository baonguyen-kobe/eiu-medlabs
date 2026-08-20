-- 20260819231500_post_pr62_cancellation_and_claim_hardening.sql
-- Post-PR62 Hardening: Claim Class Equipment Lock & Basic Medical Session Cancellation Authority

-- 1. Harden claim_class with equipment lock guard
create or replace function public.claim_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  claimed public.class_schedules;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not ((select private.has_role('lecturer')) or (select private.has_role('admin'))) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.class_schedules
  where id = target_schedule_id
    and schedule_status <> 'cancelled'
    and (schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if not (select private.can_access_room(before_row.room_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  -- Equipment Request Lock Guard: Any row in equipment_requests locks the class
  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  if actor_id in (before_row.lecturer_id, before_row.lecturer_2_id) then
    raise exception 'CLASS_ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  if before_row.lecturer_id is null then
    update public.class_schedules
    set lecturer_id = actor_id,
        updated_at = now()
    where id = target_schedule_id
    returning * into claimed;
  elsif before_row.lecturer_2_id is null then
    update public.class_schedules
    set lecturer_2_id = actor_id,
        updated_at = now()
    where id = target_schedule_id
    returning * into claimed;
  else
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  return claimed;
exception
  when exclusion_violation then
    raise exception 'LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.claim_class(uuid) from public, anon;
grant execute on function public.claim_class(uuid) to authenticated;

-- 2. Expand cancel_basic_medical_session authorization to Admin, Registration Creator, and Session Teaching Lecturer
create or replace function public.cancel_basic_medical_session(
  target_session_id uuid,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.basic_medical_registration_sessions%rowtype;
  registration_creator_id uuid;
  schedule_id uuid;
  already_cancelled boolean;
  normalized_reason text;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  normalized_reason := nullif(btrim(coalesce(target_reason, '')), '');
  if normalized_reason is null then
    raise exception 'BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select sessions.* into session_row
  from public.basic_medical_registration_sessions as sessions
  where sessions.id = target_session_id
  for update;

  if not found then
    raise exception 'BASIC_MEDICAL_SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select reg.created_by into registration_creator_id
  from public.basic_medical_registrations as reg
  where reg.id = session_row.registration_id;

  -- Authorization check: Admin OR Registration Creator OR Session Teaching Lecturer
  if not (
    (select private.is_admin())
    or registration_creator_id = actor_id
    or session_row.teaching_lecturer_id = actor_id
  ) then
    raise exception 'BASIC_MEDICAL_SESSION_CANCEL_FORBIDDEN' using errcode = '42501';
  end if;

  select schedules.id, schedules.schedule_status = 'cancelled'
  into schedule_id, already_cancelled
  from public.class_schedules as schedules
  where schedules.id = session_row.class_schedule_id
  for update;

  if not found then
    raise exception 'BASIC_MEDICAL_LINKED_SCHEDULE_INCONSISTENT' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.basic_medical_session_confirmations as confirmations
    where confirmations.session_id = target_session_id
      and confirmations.invalidated_at is null
  ) then
    raise exception 'BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED' using errcode = '22023';
  end if;

  if already_cancelled then
    return jsonb_build_object('session_id', target_session_id, 'cancelled', true, 'idempotent', true);
  end if;

  -- The linked-schedule trigger rejects generic writes. This transaction-local
  -- marker authorizes only this aggregate mutation and rolls back with it.
  perform set_config('app.basic_medical_registration_mutation', 'true', true);

  update public.class_schedules
  set schedule_status = 'cancelled',
      cancelled_at = clock_timestamp(),
      cancelled_by = actor_id
  where id = schedule_id;

  update public.basic_medical_registration_sessions
  set cancelled_at = clock_timestamp(),
      cancelled_by = actor_id,
      cancellation_reason = normalized_reason
  where id = target_session_id;

  perform private.enqueue_basic_medical_schedule_outbox_event(
    schedule_id, 'schedule_cancelled', actor_id, null
  );

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id,
    'basic_medical.session_cancelled',
    'basic_medical_registration_session',
    target_session_id,
    jsonb_build_object(
      'registration_id', session_row.registration_id,
      'schedule_id', schedule_id,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object('session_id', target_session_id, 'cancelled', true, 'idempotent', false);
end;
$$;

revoke all on function public.cancel_basic_medical_session(uuid, text) from public, anon;
grant execute on function public.cancel_basic_medical_session(uuid, text) to authenticated;
