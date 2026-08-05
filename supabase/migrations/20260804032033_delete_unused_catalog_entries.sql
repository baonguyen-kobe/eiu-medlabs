-- Allow Admin to remove catalog entries after all remaining schedule rows are cancelled.
-- Related registration/equipment data continues to block deletion.
create or replace function public.delete_catalog_room(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform 1 from public.rooms where id = target_room_id for update;
  if not found then
    raise exception 'CATALOG_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.basic_medical_registrations
    where room_id = target_room_id
  ) then
    raise exception 'CATALOG_HAS_BASIC_MEDICAL_REGISTRATIONS' using errcode = '23503';
  end if;

  if exists (
    select 1 from public.class_schedules
    where room_id = target_room_id and schedule_status <> 'cancelled'
  ) then
    raise exception 'CATALOG_HAS_ACTIVE_SCHEDULES' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.class_schedules as schedules
    where schedules.room_id = target_room_id
      and schedules.schedule_status = 'cancelled'
      and (
        exists (
          select 1 from public.equipment_requests as requests
          where requests.class_schedule_id = schedules.id
        )
        or exists (
          select 1 from public.basic_medical_registration_sessions as sessions
          where sessions.class_schedule_id = schedules.id
        )
      )
  ) then
    raise exception 'CATALOG_HAS_RELATED_REQUESTS' using errcode = '23503';
  end if;

  delete from public.class_schedules
  where room_id = target_room_id and schedule_status = 'cancelled';

  delete from public.rooms where id = target_room_id;
end;
$$;

revoke all on function public.delete_catalog_room(uuid) from public, anon;
grant execute on function public.delete_catalog_room(uuid) to authenticated;

create or replace function public.delete_catalog_course(target_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform 1 from public.courses where id = target_course_id for update;
  if not found then
    raise exception 'CATALOG_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.basic_medical_registrations
    where course_id = target_course_id
  ) then
    raise exception 'CATALOG_HAS_BASIC_MEDICAL_REGISTRATIONS' using errcode = '23503';
  end if;

  if exists (
    select 1 from public.class_schedules
    where course_id = target_course_id and schedule_status <> 'cancelled'
  ) then
    raise exception 'CATALOG_HAS_ACTIVE_SCHEDULES' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.class_schedules as schedules
    where schedules.course_id = target_course_id
      and schedules.schedule_status = 'cancelled'
      and (
        exists (
          select 1 from public.equipment_requests as requests
          where requests.class_schedule_id = schedules.id
        )
        or exists (
          select 1 from public.basic_medical_registration_sessions as sessions
          where sessions.class_schedule_id = schedules.id
        )
      )
  ) then
    raise exception 'CATALOG_HAS_RELATED_REQUESTS' using errcode = '23503';
  end if;

  delete from public.class_schedules
  where course_id = target_course_id and schedule_status = 'cancelled';

  delete from public.courses where id = target_course_id;
end;
$$;

revoke all on function public.delete_catalog_course(uuid) from public, anon;
grant execute on function public.delete_catalog_course(uuid) to authenticated;

create or replace function public.delete_catalog_shift_template(
  target_shift_template_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.shift_templates
  where id = target_shift_template_id
  for update;
  if not found then
    raise exception 'CATALOG_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.staff_shifts
    where shift_template_id = target_shift_template_id and status <> 'cancelled'
  ) then
    raise exception 'CATALOG_HAS_ACTIVE_SHIFTS' using errcode = '23503';
  end if;

  delete from public.staff_shifts
  where shift_template_id = target_shift_template_id and status = 'cancelled';

  delete from public.shift_templates where id = target_shift_template_id;
end;
$$;

revoke all on function public.delete_catalog_shift_template(uuid) from public, anon;
grant execute on function public.delete_catalog_shift_template(uuid) to authenticated;
