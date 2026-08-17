-- Allow Basic Medical registration creator and Admin to change teaching lecturer
-- on an existing session without recreating the registration and without
-- invalidating existing confirmations or signatures.

create or replace function public.update_basic_medical_session_teaching_lecturer(
  target_session_id uuid,
  target_teaching_lecturer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  session_row public.basic_medical_registration_sessions%rowtype;
  registration_row public.basic_medical_registrations%rowtype;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
  is_admin_user boolean := false;
  is_creator_user boolean := false;
begin
  actor_id := auth.uid();
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select sessions.* into session_row
  from public.basic_medical_registration_sessions as sessions
  where sessions.id = target_session_id
  for update;

  if session_row.id is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select registrations.* into registration_row
  from public.basic_medical_registrations as registrations
  where registrations.id = session_row.registration_id
  for update;

  if registration_row.id is null then
    raise exception 'REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if registration_row.cancelled_at is not null then
    raise exception 'REGISTRATION_CANCELLED' using errcode = '55000';
  end if;

  is_admin_user := (select private.is_admin());
  is_creator_user := (registration_row.created_by = actor_id);

  if not (is_admin_user or is_creator_user) then
    raise exception 'UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Validate target lecturer is active, operationally assignable, has lecturer role, and has Basic Medical room type assignment
  if not (
    (select private.is_operationally_assignable(target_teaching_lecturer_id))
    and exists (
      select 1
      from public.user_roles as roles
      where roles.user_id = target_teaching_lecturer_id
        and roles.role = 'lecturer'
    )
    and exists (
      select 1
      from public.profile_room_types as assignments
      where assignments.profile_id = target_teaching_lecturer_id
        and assignments.room_type_id = basic_medical_room_type_id
    )
  ) then
    raise exception 'INVALID_LECTURER' using errcode = '22023';
  end if;

  if session_row.teaching_lecturer_id is distinct from target_teaching_lecturer_id then
    perform set_config('app.basic_medical_registration_mutation', 'true', true);

    update public.basic_medical_registration_sessions
    set teaching_lecturer_id = target_teaching_lecturer_id
    where id = session_row.id;

    update public.class_schedules
    set lecturer_id = target_teaching_lecturer_id
    where id = session_row.class_schedule_id;

    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      old_data,
      new_data,
      metadata
    ) values (
      actor_id,
      'basic_medical_session.update_teaching_lecturer',
      'basic_medical_registration_sessions',
      session_row.id,
      jsonb_build_object('teaching_lecturer_id', session_row.teaching_lecturer_id),
      jsonb_build_object('teaching_lecturer_id', target_teaching_lecturer_id),
      jsonb_build_object(
        'registration_id', session_row.registration_id,
        'session_number', session_row.session_number,
        'lesson_title', session_row.lesson_title,
        'class_schedule_id', session_row.class_schedule_id
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.update_basic_medical_session_teaching_lecturer(uuid, uuid) from public, anon;
grant execute on function public.update_basic_medical_session_teaching_lecturer(uuid, uuid) to authenticated;
