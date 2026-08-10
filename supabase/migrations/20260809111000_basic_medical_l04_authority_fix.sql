-- 20260809111000_basic_medical_l04_authority_fix.sql
-- Corrective fix: Enforce strict YC-L04 Basic Medical schedule update authority (Admin and scoped Staff only).
-- Rejects Teaching Assistant ownership, import-owner capability, and Lecturer fallbacks for Basic Medical schedules.

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
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  changed_row public.class_schedules;
  source_room_type uuid;
  target_room_type uuid;
  normalized_ids uuid[] := coalesce(target_lecturer_ids, '{}'::uuid[]);
  is_admin boolean := (select private.has_role('admin'));
  is_staff boolean := (select private.has_role('staff'));
  is_teaching_assistant boolean := (select private.has_role('teaching_assistant'));
  can_import_owner boolean := false;
  can_manage_details boolean := false;
  basic_medical_room_type_id uuid;
  has_actual_change boolean := false;
  mutation_id_val uuid;
begin
  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if not (select private.can_modify_class_schedule(target_schedule_id, 'details')) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into before_row from public.class_schedules schedules
  where schedules.id = target_schedule_id and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select rooms.room_type_id into source_room_type from public.rooms rooms where rooms.id = before_row.room_id;

  can_import_owner := before_row.source = 'import'
    and (select private.can_import_schedules(source_room_type))
    and exists (
      select 1 from public.import_batches batches
      where batches.id = before_row.import_batch_id and batches.created_by = actor_id
    );

  select rooms.room_type_id into target_room_type
  from public.rooms rooms
  where rooms.id = target_room_id and rooms.is_active;

  if target_room_type is null then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  -- Branch authorization logic based on whether schedule involves Basic Medical
  if source_room_type = basic_medical_room_type_id or target_room_type = basic_medical_room_type_id then
    -- YC-L04 Basic Medical full edit is restricted EXCLUSIVELY to Admin and Staff scoped to both room types.
    -- Teaching Assistant ownership, import-owner capability, and Lecturer fallbacks are strictly DENIED.
    if is_admin then
      can_manage_details := true;
    elsif is_staff then
      can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
    else
      can_manage_details := false;
    end if;

    if not can_manage_details then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
  else
    -- Generic non-Basic-Medical authorization (e.g. Skills Lab)
    if is_admin then
      can_manage_details := true;
    elsif is_staff then
      can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
    elsif is_teaching_assistant then
      can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type)) and before_row.created_by = actor_id;
    elsif can_import_owner then
      can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
    end if;

    if not can_manage_details then
      if not coalesce(actor_id in (before_row.lecturer_id, before_row.lecturer_2_id), false) then
        raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
      end if;
      if target_start_time is distinct from before_row.start_time
        or target_end_time is distinct from before_row.end_time
        or target_room_id is distinct from before_row.room_id
        or target_student_count is distinct from before_row.student_count
        or normalized_ids is distinct from array_remove(array[before_row.lecturer_id, before_row.lecturer_2_id], null) then
        raise exception 'CLASS_DETAILS_UPDATE_FORBIDDEN' using errcode = '42501';
      end if;
    end if;
  end if;

  if target_schedule_date is null or target_start_time is null or target_end_time <= target_start_time
    or target_student_count is null or target_student_count < 1 or target_room_id is null
    or cardinality(normalized_ids) > 2
    or cardinality(normalized_ids) <> cardinality(array(select distinct unnest(normalized_ids))) then
    raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023';
  end if;

  if not is_admin and (not (select private.has_room_type(source_room_type)) or not (select private.has_room_type(target_room_type))) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(normalized_ids) lecturer_id where not exists (
      select 1 from public.profiles profiles where profiles.id = lecturer_id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = lecturer_id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = lecturer_id and scopes.room_type_id = target_room_type)
    )
  ) then
    raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501';
  end if;

  if (select private.has_role('lecturer')) and not (is_admin or is_staff or is_teaching_assistant or can_import_owner)
    and actor_id <> all(normalized_ids) then
    raise exception 'LECTURER_MUST_REMAIN_ASSIGNED' using errcode = '42501';
  end if;

  -- Actual-change guard for YC-L04
  if before_row.schedule_date is distinct from target_schedule_date
    or before_row.start_time is distinct from target_start_time
    or before_row.end_time is distinct from target_end_time
    or before_row.room_id is distinct from target_room_id
    or before_row.student_count is distinct from target_student_count
    or before_row.lecturer_id is distinct from (case when cardinality(normalized_ids) >= 1 then normalized_ids[1] else null end)
    or before_row.lecturer_2_id is distinct from (case when cardinality(normalized_ids) >= 2 then normalized_ids[2] else null end) then
    has_actual_change := true;
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      start_time = target_start_time,
      end_time = target_end_time,
      room_id = target_room_id,
      student_count = target_student_count,
      lecturer_id = (case when cardinality(normalized_ids) >= 1 then normalized_ids[1] else null end),
      lecturer_2_id = (case when cardinality(normalized_ids) >= 2 then normalized_ids[2] else null end),
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  -- Enqueue YC-L04 outbox event if actual change occurred on a Basic Medical schedule
  if has_actual_change and target_room_type = basic_medical_room_type_id then
    mutation_id_val := gen_random_uuid();
    perform private.enqueue_basic_medical_schedule_outbox_event(
      changed_row.id,
      'schedule_updated',
      actor_id,
      mutation_id_val
    );
  end if;

  return changed_row;
exception when exclusion_violation then
  raise exception 'SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) from public, anon;
grant execute on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) to authenticated;
