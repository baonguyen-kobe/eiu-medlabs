-- 24_consolidated_skills_class_edit_and_equipment_lock.sql
-- Consolidated Skills Class Edit Authority and Equipment Registration Integrity Lock

-- 1. Private helper: Check if ANY equipment_requests row exists for the schedule (row existence rule)
create or replace function private.class_schedule_has_equipment_request(target_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.equipment_requests
    where class_schedule_id = target_schedule_id
  );
$$;

revoke all on function private.class_schedule_has_equipment_request(uuid) from public, anon, authenticated;

-- 2. Public batch RPC for UI equipment lock status querying without RLS information leaks
create or replace function public.get_class_schedules_equipment_lock_status(
  target_schedule_ids uuid[]
)
returns table (
  schedule_id uuid,
  has_equipment_request boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not (select private.is_active_user()) then
    return;
  end if;

  return query
  select
    schedules.id as schedule_id,
    exists (
      select 1
      from public.equipment_requests as req
      where req.class_schedule_id = schedules.id
    ) as has_equipment_request
  from public.class_schedules as schedules
  where schedules.id = any(coalesce(target_schedule_ids, '{}'::uuid[]))
    and schedules.schedule_status <> 'cancelled'
    and (
      (select private.has_role('admin'))
      or exists (
        select 1
        from public.rooms as r
        where r.id = schedules.room_id
          and (select private.has_room_type(r.room_type_id))
      )
    );
end;
$$;

revoke all on function public.get_class_schedules_equipment_lock_status(uuid[]) from public, anon;
grant execute on function public.get_class_schedules_equipment_lock_status(uuid[]) to authenticated;

-- 3. Dedicated atomic RPC for Skills Lab class schedule editing
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

  select schedules.* into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Basic Medical schedule => hard reject
  if before_row.basic_medical_registration_id is not null then
    raise exception 'BASIC_MEDICAL_SCHEDULE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  select rooms.room_type_id into source_room_type
  from public.rooms as rooms
  where rooms.id = before_row.room_id;

  if source_room_type is distinct from nursing_skills_room_type_id then
    raise exception 'SKILLS_LAB_SCHEDULE_REQUIRED' using errcode = '42501';
  end if;

  -- Equipment Request Lock Guard: Any row in equipment_requests locks the class
  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  -- Check actor scope for source room type
  if not is_admin and not (select private.has_room_type(source_room_type)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  -- Validate target room
  select rooms.room_type_id into target_room_type
  from public.rooms as rooms
  where rooms.id = target_room_id and rooms.is_active;

  if target_room_type is null or target_room_type is distinct from nursing_skills_room_type_id then
    raise exception 'INVALID_ROOM_SELECTION' using errcode = '22023';
  end if;

  if not is_admin and not (select private.has_room_type(target_room_type)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  -- Authoritatively resolve target course
  select * into course_row
  from public.courses as courses
  where courses.id = target_course_id
    and courses.is_active
    and courses.room_type_id = nursing_skills_room_type_id;

  if course_row.id is null then
    raise exception 'INVALID_COURSE_SELECTION' using errcode = '22023';
  end if;

  -- Validate date, times, operating hours, and student count
  if target_schedule_date is null
    or target_start_time is null
    or target_end_time is null
    or target_end_time <= target_start_time
    or target_student_count is null
    or target_student_count < 1 then
    raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023';
  end if;

  if not (
    (target_start_time >= '07:30'::time and target_end_time <= '11:30'::time) or
    (target_start_time >= '12:30'::time and target_end_time <= '16:30'::time)
  ) then
    raise exception 'OPERATING_HOURS_VIOLATION' using errcode = '23514';
  end if;

  -- Evaluate actor authority
  is_manager := is_admin or (is_staff and (select private.has_room_type(nursing_skills_room_type_id)));
  is_eligible_lecturer := is_lecturer
    and (select private.has_room_type(nursing_skills_room_type_id))
    and (
      coalesce(actor_id in (before_row.lecturer_id, before_row.lecturer_2_id), false)
      or before_row.created_by = actor_id
    );
  is_eligible_ta := is_ta
    and (select private.has_room_type(nursing_skills_room_type_id))
    and (before_row.created_by = actor_id);

  if not (is_manager or is_eligible_lecturer or is_eligible_ta) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Determine lecturer assignments:
  -- For Manager: can assign lecturers if provided
  -- For Lecturer / TA own-edit: MUST strictly preserve existing lecturer_id and lecturer_2_id
  if is_manager then
    if target_lecturer_ids is not null then
      select coalesce(array_agg(distinct id_val order by id_val), '{}'::uuid[])
      into normalized_lecturer_ids
      from unnest(target_lecturer_ids) as id_val
      where id_val is not null;

      if cardinality(normalized_lecturer_ids) > 2 then
        raise exception 'TOO_MANY_CLASS_LECTURERS' using errcode = '22023';
      end if;

      if cardinality(normalized_lecturer_ids) <> cardinality(array_remove(target_lecturer_ids, null)) then
        raise exception 'DUPLICATE_CLASS_LECTURER' using errcode = '22023';
      end if;

      if exists (
        select 1
        from unnest(normalized_lecturer_ids) as req(id)
        where not exists (
          select 1
          from public.profiles as profiles
          join public.user_roles as roles on roles.user_id = profiles.id and roles.role = 'lecturer'
          join public.profile_room_types as scopes on scopes.profile_id = profiles.id and scopes.room_type_id = nursing_skills_room_type_id
          where profiles.id = req.id and profiles.is_active
        )
      ) then
        raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501';
      end if;

      final_lecturer_1 := case when cardinality(normalized_lecturer_ids) >= 1 then normalized_lecturer_ids[1] else null end;
      final_lecturer_2 := case when cardinality(normalized_lecturer_ids) >= 2 then normalized_lecturer_ids[2] else null end;
    else
      final_lecturer_1 := before_row.lecturer_id;
      final_lecturer_2 := before_row.lecturer_2_id;
    end if;
  else
    -- Own edit: IMMUTABLE lecturer assignments
    final_lecturer_1 := before_row.lecturer_id;
    final_lecturer_2 := before_row.lecturer_2_id;
  end if;

  -- Detect actual change
  if before_row.schedule_date is distinct from target_schedule_date
    or before_row.start_time is distinct from target_start_time
    or before_row.end_time is distinct from target_end_time
    or before_row.course_id is distinct from course_row.id
    or before_row.course_code_snapshot is distinct from course_row.course_code
    or before_row.course_name_snapshot is distinct from course_row.course_name
    or before_row.room_id is distinct from target_room_id
    or before_row.student_count is distinct from target_student_count
    or before_row.lecturer_id is distinct from final_lecturer_1
    or before_row.lecturer_2_id is distinct from final_lecturer_2 then
    has_actual_change := true;
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      start_time = target_start_time,
      end_time = target_end_time,
      course_id = course_row.id,
      course_code_snapshot = course_row.course_code,
      course_name_snapshot = course_row.course_name,
      room_id = target_room_id,
      student_count = target_student_count,
      lecturer_id = final_lecturer_1,
      lecturer_2_id = final_lecturer_2,
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  -- Transactional outbox event on actual change
  if has_actual_change then
    select concat_ws(' · ', rooms.room_code, rooms.building_code)
    into room_label
    from public.rooms as rooms
    where rooms.id = target_room_id;

    select profiles.full_name into actor_name
    from public.profiles as profiles where profiles.id = actor_id;

    select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
    into lecturer_name
    from public.profiles as profiles
    where profiles.id in (changed_row.lecturer_id, changed_row.lecturer_2_id);

    schedule_code := to_char(
      before_row.created_at at time zone 'Asia/Ho_Chi_Minh',
      'YYMMDDHH24MISS'
    );

    insert into public.email_outbox_events (
      domain,
      event_type,
      aggregate_id,
      event_key,
      payload,
      recipients,
      delivery_mode_at_event
    )
    select
      'skills_lab_schedule',
      'class_schedule_rescheduled',
      before_row.id,
      concat('skills_lab:updated:', change_id, ':', before_row.id),
      jsonb_build_object(
        'schedule_id', before_row.id,
        'course_code', changed_row.course_code_snapshot,
        'course_name', changed_row.course_name_snapshot,
        'old_schedule_date', before_row.schedule_date,
        'schedule_date', changed_row.schedule_date,
        'start_time', changed_row.start_time,
        'end_time', changed_row.end_time,
        'room', room_label,
        'student_count', changed_row.student_count,
        'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
        'request_code', schedule_code,
        'actor', coalesce(actor_name, 'Người dùng hệ thống'),
        'room_type_code', 'nursing_skills'
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object('id', recipients.id, 'email', recipients.email)), '[]'::jsonb)
        from public.profiles as recipients
        where recipients.is_active
          and (
            recipients.id in (changed_row.lecturer_id, changed_row.lecturer_2_id, before_row.lecturer_id, before_row.lecturer_2_id)
            or recipients.id = before_row.created_by
            or exists (
              select 1 from public.user_roles as roles
              where roles.user_id = recipients.id
                and roles.role in ('admin', 'staff', 'viewer')
                and (
                  roles.role = 'admin'
                  or exists (
                    select 1 from public.profile_room_types as assignments
                    where assignments.profile_id = recipients.id
                      and assignments.room_type_id = nursing_skills_room_type_id
                      and (
                        roles.role <> 'viewer'
                        or assignments.receive_schedule_emails
                      )
                  )
                )
            )
          )
      ),
      (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
    on conflict (event_key) do nothing;
  end if;

  return changed_row;
exception
  when exclusion_violation then
    raise exception 'ROOM_OR_LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.update_skills_lab_class_schedule(uuid, date, time, time, uuid, uuid, integer, uuid[]) from public, anon;
grant execute on function public.update_skills_lab_class_schedule(uuid, date, time, time, uuid, uuid, integer, uuid[]) to authenticated;

-- 4. Harden withdraw_class with equipment lock guard
create or replace function public.withdraw_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  withdrawn public.class_schedules;
begin
  if not ((select private.has_role('lecturer')) or (select private.has_role('admin'))) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.class_schedules
  where id = target_schedule_id
    and (select auth.uid()) in (lecturer_id, lecturer_2_id)
  for update;

  if before_row.id is null then
    raise exception 'NOT_CLASS_OWNER' using errcode = '42501';
  end if;

  if not (select private.can_access_room(before_row.room_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  if before_row.schedule_status = 'cancelled'
     or (before_row.schedule_date + before_row.start_time) <=
        (now() at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'CLASS_WITHDRAWAL_CLOSED' using errcode = 'P0001';
  end if;

  update public.class_schedules
  set lecturer_id = case
        when lecturer_id = (select auth.uid()) then lecturer_2_id
        else lecturer_id
      end,
      lecturer_2_id = null,
      updated_at = now()
  where id = target_schedule_id
  returning * into withdrawn;

  return withdrawn;
end;
$$;

revoke all on function public.withdraw_class(uuid) from public, anon;
grant execute on function public.withdraw_class(uuid) to authenticated;

-- 5. Harden delete_skills_lab_class_schedule with equipment lock guard
create or replace function public.delete_skills_lab_class_schedule(
  target_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  room_type_value uuid;
  room_type_code_value text;
  room_label text;
  actor_name text;
  lecturer_name text;
  schedule_code text;
  is_manager boolean;
  is_eligible_lecturer boolean;
  is_eligible_ta boolean;
begin
  if actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select schedules.* into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if before_row.basic_medical_registration_id is not null then
    raise exception 'BASIC_MEDICAL_SCHEDULE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  select rooms.room_type_id, room_types.code,
         concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_type_value, room_type_code_value, room_label
  from public.rooms as rooms
  join public.room_types as room_types on room_types.id = rooms.room_type_id
  where rooms.id = before_row.room_id;

  if not (select private.has_room_type(room_type_value)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  is_manager := (select private.has_role('admin')) or (select private.has_role('staff'));

  is_eligible_lecturer := (
    room_type_code_value = 'nursing_skills'
    and before_row.created_by = actor_id
    and (select private.has_role('lecturer'))
  );

  is_eligible_ta := (
    before_row.created_by = actor_id
    and (select private.has_role('teaching_assistant'))
  );

  if not (is_manager or is_eligible_lecturer or is_eligible_ta) then
    raise exception 'CLASS_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  if room_type_code_value = 'nursing_skills' and not is_manager then
    select profiles.full_name into actor_name
    from public.profiles as profiles where profiles.id = actor_id;

    select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
    into lecturer_name
    from public.profiles as profiles
    where profiles.id in (before_row.lecturer_id, before_row.lecturer_2_id);

    schedule_code := to_char(
      before_row.created_at at time zone 'Asia/Ho_Chi_Minh',
      'YYMMDDHH24MISS'
    );

    insert into public.email_outbox_events (
      domain,
      event_type,
      aggregate_id,
      event_key,
      payload,
      recipients,
      delivery_mode_at_event
    )
    select
      'skills_lab_schedule',
      'skills_lab_deleted',
      before_row.id,
      concat('skills_lab:lecturer_deleted:', before_row.id),
      jsonb_build_object(
        'schedule_id', before_row.id,
        'course_code', before_row.course_code_snapshot,
        'course_name', before_row.course_name_snapshot,
        'schedule_date', before_row.schedule_date,
        'start_time', before_row.start_time,
        'end_time', before_row.end_time,
        'room', room_label,
        'student_count', before_row.student_count,
        'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
        'request_code', schedule_code,
        'actor', coalesce(actor_name, 'Giảng viên')
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email)), '[]'::jsonb)
        from public.profiles as r
        where r.is_active
          and (
            r.id in (actor_id, before_row.lecturer_id, before_row.lecturer_2_id)
            or exists (
              select 1 from public.user_roles as roles
              where roles.user_id = r.id and roles.role in ('admin', 'staff')
                and (
                  roles.role = 'admin'
                  or exists (
                    select 1 from public.profile_room_types as assignments
                    where assignments.profile_id = r.id
                      and assignments.room_type_id = room_type_value
                  )
                )
            )
          )
      ),
      (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
    on conflict (event_key) do nothing;
  end if;

  delete from public.class_schedules where id = target_schedule_id;

  return true;
end;
$$;

revoke all on function public.delete_skills_lab_class_schedule(uuid) from public, anon;
grant execute on function public.delete_skills_lab_class_schedule(uuid) to authenticated;

-- 6. Harden reschedule_class with equipment lock guard
create or replace function public.reschedule_class(
  target_schedule_id uuid,
  target_schedule_date date
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  changed_row public.class_schedules;
  room_type_value uuid;
  room_type_code_value text;
  room_label text;
  actor_name text;
  change_id uuid := gen_random_uuid();
  lecturer_name text;
  schedule_code text;
  actor_id uuid := (select auth.uid());
begin
  if target_schedule_date is null then
    raise exception 'INVALID_SCHEDULE_DATE' using errcode = '22023';
  end if;

  select schedules.* into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
  end if;

  select rooms.room_type_id, room_types.code,
         concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_type_value, room_type_code_value, room_label
  from public.rooms as rooms
  join public.room_types as room_types on room_types.id = rooms.room_type_id
  where rooms.id = before_row.room_id;

  select profiles.full_name into actor_name
  from public.profiles as profiles where profiles.id = actor_id;

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name
  from public.profiles as profiles
  where profiles.id in (before_row.lecturer_id, before_row.lecturer_2_id);

  schedule_code := to_char(
    before_row.created_at at time zone 'Asia/Ho_Chi_Minh',
    'YYMMDDHH24MISS'
  );

  if not (select private.can_modify_class_schedule(target_schedule_id, 'reschedule')) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  if target_schedule_date is distinct from before_row.schedule_date then
    if room_type_code_value = 'basic_medical' then
      insert into public.email_notifications (
        notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
      )
      select
        'class_schedule_basic_medical_updated',
        recipients.id, recipients.email,
        concat('class_schedule_basic_medical_updated:', change_id, ':', before_row.id, ':', recipients.id),
        concat('[MedLabs Calendar] Đổi ngày học Y cơ sở · ', coalesce(before_row.course_code_snapshot, '')),
        jsonb_build_object(
          'schedule_id', before_row.id,
          'course_code', before_row.course_code_snapshot,
          'course_name', before_row.course_name_snapshot,
          'old_schedule_date', before_row.schedule_date,
          'schedule_date', changed_row.schedule_date,
          'start_time', before_row.start_time,
          'end_time', before_row.end_time,
          'room', room_label,
          'student_count', before_row.student_count,
          'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
          'request_code', schedule_code,
          'actor', coalesce(actor_name, 'Người dùng hệ thống')
        )
      from public.profiles as recipients
      where recipients.is_active
        and (
          recipients.id in (before_row.lecturer_id, before_row.lecturer_2_id)
          or exists (
            select 1 from public.user_roles as roles
            where roles.user_id = recipients.id
              and roles.role in ('admin', 'staff', 'viewer')
              and (
                roles.role = 'admin'
                or exists (
                  select 1 from public.profile_room_types as assignments
                  where assignments.profile_id = recipients.id
                    and assignments.room_type_id = room_type_value
                    and (
                      roles.role <> 'viewer'
                      or assignments.receive_schedule_emails
                    )
                )
              )
          )
        )
      on conflict (dedupe_key) do nothing;
    else
      insert into public.email_outbox_events (
        domain,
        event_type,
        aggregate_id,
        event_key,
        payload,
        recipients,
        delivery_mode_at_event
      )
      select
        'skills_lab_schedule',
        'class_schedule_rescheduled',
        before_row.id,
        concat('skills_lab:rescheduled:', change_id, ':', before_row.id),
        jsonb_build_object(
          'schedule_id', before_row.id,
          'course_code', before_row.course_code_snapshot,
          'course_name', before_row.course_name_snapshot,
          'old_schedule_date', before_row.schedule_date,
          'schedule_date', changed_row.schedule_date,
          'start_time', before_row.start_time,
          'end_time', before_row.end_time,
          'room', room_label,
          'student_count', before_row.student_count,
          'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
          'request_code', schedule_code,
          'actor', coalesce(actor_name, 'Người dùng hệ thống'),
          'room_type_code', room_type_code_value
        ),
        (
          select coalesce(jsonb_agg(jsonb_build_object('id', recipients.id, 'email', recipients.email)), '[]'::jsonb)
          from public.profiles as recipients
          where recipients.is_active
            and (
              recipients.id in (before_row.lecturer_id, before_row.lecturer_2_id)
              or recipients.id = before_row.created_by
              or exists (
                select 1 from public.user_roles as roles
                where roles.user_id = recipients.id
                  and roles.role in ('admin', 'staff', 'viewer')
                  and (
                    roles.role = 'admin'
                    or exists (
                      select 1 from public.profile_room_types as assignments
                      where assignments.profile_id = recipients.id
                        and assignments.room_type_id = room_type_value
                        and (
                          roles.role <> 'viewer'
                          or assignments.receive_schedule_emails
                        )
                    )
                  )
              )
            )
        ),
        (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
      on conflict (event_key) do nothing;
    end if;
  end if;

  return changed_row;
exception
  when exclusion_violation then
    raise exception 'ROOM_OR_LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.reschedule_class(uuid, date) from public, anon;
grant execute on function public.reschedule_class(uuid, date) to authenticated;

-- 7. Harden assign_class_lecturers with equipment lock guard
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
  from public.rooms rooms
  where rooms.id = target_row.room_id;

  if not (select private.can_modify_class_schedule(target_schedule_id, 'assign_lecturers')) then
    raise exception 'CLASS_MANAGEMENT_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct id_value order by id_value), '{}'::uuid[])
  into normalized_ids
  from unnest(coalesce(target_lecturer_ids, '{}'::uuid[])) values_list(id_value)
  where id_value is not null;

  if cardinality(normalized_ids) > 2 then
    raise exception 'TOO_MANY_CLASS_LECTURERS' using errcode = '22023';
  end if;

  if cardinality(normalized_ids) <> cardinality(array_remove(coalesce(target_lecturer_ids, '{}'::uuid[]), null)) then
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
  set lecturer_id = case when cardinality(normalized_ids) >= 1 then normalized_ids[1] else null end,
      lecturer_2_id = case when cardinality(normalized_ids) >= 2 then normalized_ids[2] else null end,
      updated_at = now()
  where id = target_schedule_id
  returning * into target_row;

  return target_row;
end;
$$;

revoke all on function public.assign_class_lecturers(uuid, uuid[]) from public, anon;
grant execute on function public.assign_class_lecturers(uuid, uuid[]) to authenticated;

-- 8. Harden update_class_schedule_details_core with equipment lock guard
create or replace function public.update_class_schedule_details_core(
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

  -- Equipment lock check
  if (select private.class_schedule_has_equipment_request(target_schedule_id)) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '42501';
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

  if source_room_type = basic_medical_room_type_id or target_room_type = basic_medical_room_type_id then
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

revoke all on function public.update_class_schedule_details_core(uuid, date, time, time, uuid, integer, uuid[]) from public, anon, authenticated;
