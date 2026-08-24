-- Lecturer slots are semantic (Lecturer 1 / Lecturer 2), not an unordered
-- set. Equipment commercial names are likewise a catalog identity that may
-- occur only once in the same practical activity.

create or replace function private.guard_equipment_request_item_commercial_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_domain_value public.equipment_request_domain;
  commercial_name_value text;
begin
  -- Locking the parent serializes concurrent item additions for one request.
  select requests.request_domain
  into request_domain_value
  from public.equipment_requests as requests
  where requests.id = new.request_id
  for update;

  if request_domain_value = 'nursing_skills' then
    select lower(btrim(catalog.commercial_name))
    into commercial_name_value
    from public.equipment_catalog as catalog
    where catalog.id = new.catalog_item_id;
  elsif request_domain_value = 'basic_medical' then
    select lower(btrim(catalog.commercial_name))
    into commercial_name_value
    from public.basic_medical_equipment_catalog as catalog
    where catalog.id = new.basic_medical_catalog_item_id;
  end if;

  -- The existing domain-catalog trigger owns invalid catalog errors.
  if commercial_name_value is null or commercial_name_value = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.equipment_request_items as existing
    left join public.equipment_catalog as skills_catalog
      on skills_catalog.id = existing.catalog_item_id
    left join public.basic_medical_equipment_catalog as basic_catalog
      on basic_catalog.id = existing.basic_medical_catalog_item_id
    where existing.request_id = new.request_id
      and existing.id is distinct from new.id
      and lower(btrim(existing.skill_name)) = lower(btrim(new.skill_name))
      and lower(btrim(coalesce(
        case when request_domain_value = 'nursing_skills'
          then skills_catalog.commercial_name
          else basic_catalog.commercial_name
        end,
        ''
      ))) = commercial_name_value
  ) then
    raise exception 'EQUIPMENT_REQUEST_DUPLICATE_COMMERCIAL_NAME_IN_ACTIVITY'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_request_items_commercial_name_guard on public.equipment_request_items;
create trigger equipment_request_items_commercial_name_guard
before insert or update of request_id, skill_name, catalog_item_id, basic_medical_catalog_item_id
on public.equipment_request_items
for each row execute function private.guard_equipment_request_item_commercial_name();

create or replace function private.preserve_schedule_email_lecturer_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lecturer_names text;
begin
  if new.domain <> 'skills_lab_schedule'
    or new.aggregate_id is null
    or new.event_type not in ('class_schedule_created', 'class_schedule_rescheduled', 'skills_lab_deleted') then
    return new;
  end if;

  select nullif(concat_ws(
    ' · ',
    lecturer_1.full_name,
    lecturer_2.full_name
  ), '')
  into lecturer_names
  from public.class_schedules as schedules
  left join public.profiles as lecturer_1 on lecturer_1.id = schedules.lecturer_id
  left join public.profiles as lecturer_2 on lecturer_2.id = schedules.lecturer_2_id
  where schedules.id = new.aggregate_id;

  new.payload := jsonb_set(
    coalesce(new.payload, '{}'::jsonb),
    '{lecturer}',
    to_jsonb(coalesce(lecturer_names, 'Chưa có giảng viên')),
    true
  );
  return new;
end;
$$;

drop trigger if exists email_outbox_preserve_schedule_lecturer_order on public.email_outbox_events;
create trigger email_outbox_preserve_schedule_lecturer_order
before insert on public.email_outbox_events
for each row execute function private.preserve_schedule_email_lecturer_order();

create or replace function public.assign_class_lecturers(
  target_schedule_id uuid,
  target_lecturer_ids uuid[]
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_row public.class_schedules;
  room_type_value uuid;
  normalized_ids uuid[];
begin
  select schedules.* into target_row
  from public.class_schedules schedules
  where schedules.id = target_schedule_id
  for update;

  if target_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  select rooms.room_type_id into room_type_value
  from public.rooms rooms where rooms.id = target_row.room_id;
  if not (select private.can_modify_class_schedule(target_schedule_id, 'assign_lecturers')) then
    raise exception 'CLASS_MANAGEMENT_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  normalized_ids := array_remove(coalesce(target_lecturer_ids, '{}'::uuid[]), null);
  if cardinality(normalized_ids) > 2 then
    raise exception 'TOO_MANY_CLASS_LECTURERS' using errcode = '22023';
  end if;
  if cardinality(normalized_ids) <> cardinality(array_remove(coalesce(target_lecturer_ids, '{}'::uuid[]), null))
    or cardinality(normalized_ids) <> cardinality(array(select distinct unnest(normalized_ids))) then
    raise exception 'DUPLICATE_CLASS_LECTURER' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_ids) requested(id) where not exists (
      select 1 from public.profiles profiles where profiles.id = requested.id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = room_type_value)
    )
  ) then
    raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501';
  end if;

  update public.class_schedules
  set lecturer_id = normalized_ids[1], lecturer_2_id = normalized_ids[2], updated_at = now()
  where id = target_schedule_id
  returning * into target_row;
  return target_row;
end;
$$;

revoke all on function public.assign_class_lecturers(uuid, uuid[]) from public, anon;
grant execute on function public.assign_class_lecturers(uuid, uuid[]) to authenticated;

create or replace function public.update_skills_lab_class_schedule(
  target_schedule_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_course_id uuid,
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
  nursing_skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
  source_room_type uuid;
  target_room_type uuid;
  course_row public.courses;
  is_admin boolean := (select private.has_role('admin'));
  is_staff boolean := (select private.has_role('staff'));
  is_ta boolean := (select private.has_role('teaching_assistant'));
  is_lecturer boolean := (select private.has_role('lecturer'));
  is_manager boolean := false;
  is_eligible_lecturer boolean := false;
  is_eligible_ta boolean := false;
  normalized_lecturer_ids uuid[];
  final_lecturer_1 uuid;
  final_lecturer_2 uuid;
  actor_name text;
  lecturer_name text;
  schedule_code text;
  room_label text;
  has_actual_change boolean := false;
  change_id uuid := gen_random_uuid();
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select schedules.* into before_row from public.class_schedules as schedules
  where schedules.id = target_schedule_id and schedules.schedule_status <> 'cancelled'
  for update;
  if before_row.id is null then raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  if before_row.basic_medical_registration_id is not null then
    raise exception 'BASIC_MEDICAL_SCHEDULE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  select rooms.room_type_id into source_room_type from public.rooms as rooms where rooms.id = before_row.room_id;
  if source_room_type is distinct from nursing_skills_room_type_id then
    raise exception 'SKILLS_LAB_SCHEDULE_REQUIRED' using errcode = '42501';
  end if;
  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;
  if not is_admin and not (select private.has_room_type(source_room_type)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  select rooms.room_type_id into target_room_type from public.rooms as rooms
  where rooms.id = target_room_id and rooms.is_active;
  if target_room_type is null or target_room_type is distinct from nursing_skills_room_type_id then
    raise exception 'INVALID_ROOM_SELECTION' using errcode = '22023';
  end if;
  if not is_admin and not (select private.has_room_type(target_room_type)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  select * into course_row from public.courses as courses
  where courses.id = target_course_id and courses.is_active and courses.room_type_id = nursing_skills_room_type_id;
  if course_row.id is null then raise exception 'INVALID_COURSE_SELECTION' using errcode = '22023'; end if;
  if target_schedule_date is null or target_start_time is null or target_end_time is null
    or target_end_time <= target_start_time or target_student_count is null or target_student_count < 1 then
    raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023';
  end if;
  if not ((target_start_time >= '07:30'::time and target_end_time <= '11:30'::time)
    or (target_start_time >= '12:30'::time and target_end_time <= '16:30'::time)) then
    raise exception 'OPERATING_HOURS_VIOLATION' using errcode = '23514';
  end if;

  is_manager := is_admin or (is_staff and (select private.has_room_type(nursing_skills_room_type_id)));
  is_eligible_lecturer := is_lecturer and (select private.has_room_type(nursing_skills_room_type_id))
    and (coalesce(actor_id in (before_row.lecturer_id, before_row.lecturer_2_id), false) or before_row.created_by = actor_id);
  is_eligible_ta := is_ta and (select private.has_room_type(nursing_skills_room_type_id)) and before_row.created_by = actor_id;
  if not (is_manager or is_eligible_lecturer or is_eligible_ta) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  if is_manager and target_lecturer_ids is not null then
    normalized_lecturer_ids := array_remove(target_lecturer_ids, null);
    if cardinality(normalized_lecturer_ids) > 2 then raise exception 'TOO_MANY_CLASS_LECTURERS' using errcode = '22023'; end if;
    if cardinality(normalized_lecturer_ids) <> cardinality(array_remove(target_lecturer_ids, null))
      or cardinality(normalized_lecturer_ids) <> cardinality(array(select distinct unnest(normalized_lecturer_ids))) then
      raise exception 'DUPLICATE_CLASS_LECTURER' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(normalized_lecturer_ids) as req(id) where not exists (
        select 1 from public.profiles as profiles
        join public.user_roles as roles on roles.user_id = profiles.id and roles.role = 'lecturer'
        join public.profile_room_types as scopes on scopes.profile_id = profiles.id and scopes.room_type_id = nursing_skills_room_type_id
        where profiles.id = req.id and profiles.is_active
      )
    ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501'; end if;
    final_lecturer_1 := normalized_lecturer_ids[1];
    final_lecturer_2 := normalized_lecturer_ids[2];
  else
    final_lecturer_1 := before_row.lecturer_id;
    final_lecturer_2 := before_row.lecturer_2_id;
  end if;

  has_actual_change := before_row.schedule_date is distinct from target_schedule_date
    or before_row.start_time is distinct from target_start_time
    or before_row.end_time is distinct from target_end_time
    or before_row.course_id is distinct from course_row.id
    or before_row.course_code_snapshot is distinct from course_row.course_code
    or before_row.course_name_snapshot is distinct from course_row.course_name
    or before_row.room_id is distinct from target_room_id
    or before_row.student_count is distinct from target_student_count
    or before_row.lecturer_id is distinct from final_lecturer_1
    or before_row.lecturer_2_id is distinct from final_lecturer_2;

  update public.class_schedules set schedule_date = target_schedule_date, start_time = target_start_time,
    end_time = target_end_time, course_id = course_row.id, course_code_snapshot = course_row.course_code,
    course_name_snapshot = course_row.course_name, room_id = target_room_id, student_count = target_student_count,
    lecturer_id = final_lecturer_1, lecturer_2_id = final_lecturer_2, updated_at = now()
  where id = target_schedule_id returning * into changed_row;

  if has_actual_change then
    select concat_ws(' · ', rooms.room_code, rooms.building_code) into room_label
    from public.rooms as rooms where rooms.id = target_room_id;
    select profiles.full_name into actor_name from public.profiles as profiles where profiles.id = actor_id;
    select nullif(concat_ws(' · ',
      (select profiles.full_name from public.profiles as profiles where profiles.id = changed_row.lecturer_id),
      (select profiles.full_name from public.profiles as profiles where profiles.id = changed_row.lecturer_2_id)
    ), '') into lecturer_name;
    schedule_code := to_char(before_row.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYMMDDHH24MISS');
    insert into public.email_outbox_events(domain,event_type,aggregate_id,event_key,payload,recipients,delivery_mode_at_event)
    select 'skills_lab_schedule','class_schedule_rescheduled',before_row.id,
      concat('skills_lab:updated:', change_id, ':', before_row.id),
      jsonb_build_object('schedule_id', before_row.id, 'course_code', changed_row.course_code_snapshot,
        'course_name', changed_row.course_name_snapshot, 'old_schedule_date', before_row.schedule_date,
        'schedule_date', changed_row.schedule_date, 'start_time', changed_row.start_time, 'end_time', changed_row.end_time,
        'room', room_label, 'student_count', changed_row.student_count,
        'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'), 'request_code', schedule_code,
        'actor', coalesce(actor_name, 'Người dùng hệ thống'), 'room_type_code', 'nursing_skills'),
      (select coalesce(jsonb_agg(jsonb_build_object('id', recipients.id, 'email', recipients.email)), '[]'::jsonb)
       from public.profiles as recipients where recipients.is_active and (
         recipients.id in (changed_row.lecturer_id, changed_row.lecturer_2_id, before_row.lecturer_id, before_row.lecturer_2_id)
         or recipients.id = before_row.created_by or exists (
           select 1 from public.user_roles as roles where roles.user_id = recipients.id and roles.role in ('admin','staff','viewer')
             and (roles.role = 'admin' or exists (
               select 1 from public.profile_room_types as assignments where assignments.profile_id = recipients.id
                 and assignments.room_type_id = nursing_skills_room_type_id
                 and (roles.role <> 'viewer' or assignments.receive_schedule_emails)
             ))
         )
       )),
      (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
    on conflict (event_key) do nothing;
  end if;
  return changed_row;
exception when exclusion_violation then
  raise exception 'ROOM_OR_LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.update_skills_lab_class_schedule(uuid, date, time, time, uuid, uuid, integer, uuid[]) from public, anon;
grant execute on function public.update_skills_lab_class_schedule(uuid, date, time, time, uuid, uuid, integer, uuid[]) to authenticated;
