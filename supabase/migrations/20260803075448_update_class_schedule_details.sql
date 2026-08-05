create or replace function public.update_class_schedule_details(
  target_schedule_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_room_id uuid,
  target_student_count integer,
  target_lecturer_ids uuid[] default '{}'::uuid[]
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  changed_row public.class_schedules;
  target_room_type uuid;
  normalized_ids uuid[] := coalesce(target_lecturer_ids, '{}'::uuid[]);
  is_manager boolean;
begin
  select * into before_row from public.class_schedules
  where id = target_schedule_id and schedule_status <> 'cancelled' for update;
  if before_row.id is null then raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001'; end if;

  is_manager := (select private.has_role('admin')) or (select private.has_role('staff')) or (select private.has_role('importer'));
  if not is_manager then
    if (select auth.uid()) not in (before_row.lecturer_id, before_row.lecturer_2_id) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
    if target_start_time is distinct from before_row.start_time
      or target_end_time is distinct from before_row.end_time
      or target_room_id is distinct from before_row.room_id
      or target_student_count is distinct from before_row.student_count
      or normalized_ids is distinct from array_remove(array[before_row.lecturer_id, before_row.lecturer_2_id], null)
    then raise exception 'CLASS_DETAILS_UPDATE_FORBIDDEN' using errcode = '42501'; end if;
  end if;

  if target_schedule_date is null or target_start_time is null or target_end_time <= target_start_time
    or target_student_count < 1 or target_room_id is null or cardinality(normalized_ids) > 2
    or cardinality(normalized_ids) <> cardinality(array(select distinct unnest(normalized_ids)))
  then raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023'; end if;

  select room_type_id into target_room_type from public.rooms where id = target_room_id and is_active;
  if target_room_type is null or not (select private.has_room_type(target_room_type)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(normalized_ids) lecturer_id
    where not exists (select 1 from public.profile_room_types where profile_id = lecturer_id and room_type_id = target_room_type)
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501'; end if;

  update public.class_schedules set
    schedule_date = target_schedule_date, start_time = target_start_time, end_time = target_end_time,
    room_id = target_room_id, student_count = target_student_count,
    lecturer_id = normalized_ids[1], lecturer_2_id = normalized_ids[2], updated_at = now()
  where id = target_schedule_id returning * into changed_row;
  return changed_row;
exception
  when exclusion_violation then raise exception 'SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.update_class_schedule_details(uuid,date,time,time,uuid,integer,uuid[]) from public, anon;
grant execute on function public.update_class_schedule_details(uuid,date,time,time,uuid,integer,uuid[]) to authenticated;
