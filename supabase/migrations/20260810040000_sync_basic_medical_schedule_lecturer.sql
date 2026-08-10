-- Keep linked Basic Medical schedules and their confirmation owner in sync.
-- The generic schedule editor remains the public API, while the previous
-- implementation is kept private to this wrapper through EXECUTE privileges.

do $$
begin
  if to_regprocedure(
    'public.update_class_schedule_details_core(uuid,date,time without time zone,time without time zone,uuid,integer,uuid[])'
  ) is null then
    alter function public.update_class_schedule_details(
      uuid, date, time, time, uuid, integer, uuid[]
    ) rename to update_class_schedule_details_core;
  end if;
end;
$$;

revoke all on function public.update_class_schedule_details_core(
  uuid, date, time, time, uuid, integer, uuid[]
) from public, anon, authenticated;

create or replace function public.update_class_schedule_details(
  target_schedule_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_room_id uuid,
  target_student_count integer,
  target_lecturer_ids uuid[] default null
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  changed_row public.class_schedules;
  linked_session public.basic_medical_registration_sessions;
  registration_row public.basic_medical_registrations;
  normalized_ids uuid[] := coalesce(target_lecturer_ids, '{}'::uuid[]);
  changes_confirmation_owner boolean := false;
  source_room_type_id uuid;
begin
  select schedules.* into before_row
  from public.class_schedules schedules
  where schedules.id = target_schedule_id
  for update;

  if before_row.basic_medical_registration_id is null then
    return public.update_class_schedule_details_core(
      target_schedule_id,
      target_schedule_date,
      target_start_time,
      target_end_time,
      target_room_id,
      target_student_count,
      normalized_ids
    );
  end if;

  select rooms.room_type_id into source_room_type_id
  from public.rooms rooms
  where rooms.id = before_row.room_id;

  if not (
    (select private.has_role('admin'))
    or (
      (select private.has_role('staff'))
      and (select private.has_room_type(source_room_type_id))
    )
  ) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  select sessions.* into linked_session
  from public.basic_medical_registration_sessions sessions
  where sessions.class_schedule_id = target_schedule_id
    and sessions.registration_id = before_row.basic_medical_registration_id
  for update;

  select registrations.* into registration_row
  from public.basic_medical_registrations registrations
  where registrations.id = before_row.basic_medical_registration_id
  for update;

  if linked_session.id is null or registration_row.id is null then
    raise exception 'BASIC_MEDICAL_LINKED_SCHEDULE_INCONSISTENT'
      using errcode = '55000';
  end if;

  if cardinality(normalized_ids) <> 1 then
    raise exception 'BASIC_MEDICAL_TEACHING_LECTURER_REQUIRED'
      using errcode = '22023';
  end if;

  -- Room and student count belong to the aggregate registration, not one
  -- individual session. They must be changed through the registration editor.
  if target_room_id is distinct from before_row.room_id
    or target_student_count is distinct from before_row.student_count then
    raise exception 'BASIC_MEDICAL_REGISTRATION_EDIT_REQUIRED'
      using errcode = '55000';
  end if;

  if target_schedule_date < registration_row.start_date
    or target_schedule_date > registration_row.end_date then
    raise exception 'BASIC_MEDICAL_SESSION_DATE_OUTSIDE_REGISTRATION'
      using errcode = '22023';
  end if;

  changes_confirmation_owner :=
    before_row.schedule_date is distinct from target_schedule_date
    or before_row.start_time is distinct from target_start_time
    or before_row.end_time is distinct from target_end_time
    or linked_session.teaching_lecturer_id is distinct from normalized_ids[1];

  if changes_confirmation_owner and exists (
    select 1
    from public.basic_medical_session_confirmations confirmations
    where confirmations.session_id = linked_session.id
      and confirmations.invalidated_at is null
  ) then
    raise exception 'BASIC_MEDICAL_SESSION_ALREADY_CONFIRMED'
      using errcode = '55000';
  end if;

  perform set_config('app.basic_medical_registration_mutation', 'true', true);

  changed_row := public.update_class_schedule_details_core(
    target_schedule_id,
    target_schedule_date,
    target_start_time,
    target_end_time,
    target_room_id,
    target_student_count,
    normalized_ids
  );

  update public.basic_medical_registration_sessions sessions
  set teaching_lecturer_id = normalized_ids[1]
  where sessions.id = linked_session.id
    and sessions.teaching_lecturer_id is distinct from normalized_ids[1];

  return changed_row;
end;
$$;

revoke all on function public.update_class_schedule_details(
  uuid, date, time, time, uuid, integer, uuid[]
) from public, anon;
grant execute on function public.update_class_schedule_details(
  uuid, date, time, time, uuid, integer, uuid[]
) to authenticated;
