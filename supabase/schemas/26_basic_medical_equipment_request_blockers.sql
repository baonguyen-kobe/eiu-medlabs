-- Wave 1 external-review blockers: make the shared request lifecycle domain aware
-- without changing the immutable domain/source architecture introduced in Wave 1.

create or replace function private.enforce_equipment_request_semester_authority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_semester text;
  target_room_type_id uuid;
  skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if new.request_domain = 'basic_medical' then
    -- A cancelled Basic Medical request may intentionally outlive its live schedule.
    if new.class_schedule_id is null then
      if tg_op = 'UPDATE' and old.request_domain = 'basic_medical' and old.status = 'cancelled' then
        new.semester := old.semester;
        return new;
      end if;
      raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode = '22023';
    end if;

    select registrations.semester
    into target_semester
    from public.basic_medical_registration_sessions as sessions
    join public.basic_medical_registrations as registrations on registrations.id = sessions.registration_id
    where sessions.id = new.source_identity_id
      and sessions.class_schedule_id = new.class_schedule_id
      and registrations.cancelled_at is null;

    if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
      raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode = '22023';
    end if;
    new.semester := target_semester;
    return new;
  end if;

  if new.class_schedule_id is null then
    raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '22023';
  end if;

  select schedules.semester, rooms.room_type_id
  into target_semester, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id
    and schedules.schedule_status <> 'cancelled';

  if target_room_type_id is null or target_room_type_id <> skills_room_type_id then
    raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
  end if;
  if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode = '22023';
  end if;
  new.semester := target_semester;
  return new;
end;
$$;

create or replace function private.validate_equipment_request_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
  default_responsible_id uuid;
begin
  if new.semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;
  if length(coalesce(new.note, '')) > 2000 then
    raise exception 'Ghi chú không được vượt quá 2000 ký tự.' using errcode = '22023';
  end if;
  if length(coalesce(new.late_registration_reason, '')) > 1000 then
    raise exception 'Lý do đăng ký trễ không được vượt quá 1000 ký tự.' using errcode = '22023';
  end if;

  if new.request_domain = 'basic_medical' then
    select sessions.teaching_lecturer_id
    into default_responsible_id
    from public.basic_medical_registration_sessions as sessions
    where sessions.id = new.source_identity_id
      and sessions.class_schedule_id = new.class_schedule_id;

    if default_responsible_id is null then
      -- Tombstones retain their already validated responsible lecturer.
      if tg_op = 'UPDATE' and new.class_schedule_id is null and old.status = 'cancelled' then
        default_responsible_id := old.responsible_lecturer_id;
      else
        raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode = '22023';
      end if;
    end if;
    if new.responsible_lecturer_id <> default_responsible_id
      and not ((select private.is_admin()) or (select private.can_manage_basic_medical())) then
      raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.profiles as profiles
      where profiles.id = new.responsible_lecturer_id
        and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = basic_medical_room_type_id)
    ) then
      raise exception 'BASIC_MEDICAL_RESPONSIBLE_INVALID' using errcode = '22023';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.profiles as profiles
    where profiles.id = new.responsible_lecturer_id
      and profiles.is_active
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
      and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = skills_room_type_id)
  ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.validate_equipment_request_timing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
  receive_local timestamp;
  return_local timestamp;
  skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then return new; end if;
  if tg_op = 'UPDATE'
    and new.class_schedule_id is not distinct from old.class_schedule_id
    and new.receive_at is not distinct from old.receive_at
    and new.return_at is not distinct from old.return_at then return new; end if;
  if new.class_schedule_id is null and new.request_domain = 'basic_medical' and tg_op = 'UPDATE' and old.status = 'cancelled' then
    return new;
  end if;

  select schedules.schedule_date, rooms.room_type_id
  into target_schedule_date, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id and schedules.schedule_status <> 'cancelled';

  if target_schedule_date is null
    or (new.request_domain = 'nursing_skills' and target_room_type_id <> skills_room_type_id)
    or (new.request_domain = 'basic_medical' and target_room_type_id <> basic_medical_room_type_id) then
    raise exception 'EQUIPMENT_REQUEST_SOURCE_SCHEDULE_INVALID' using errcode = '22023';
  end if;

  receive_local := new.receive_at at time zone 'Asia/Ho_Chi_Minh';
  return_local := new.return_at at time zone 'Asia/Ho_Chi_Minh';
  if receive_local::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    or receive_local::date > target_schedule_date
    or return_local < receive_local
    or return_local::date < target_schedule_date
    or receive_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00')
    or return_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00') then
    raise exception 'EQUIPMENT_REQUEST_TIMING_INVALID' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_equipment_request_room_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_domain_value public.equipment_request_domain := coalesce(new.request_domain, old.request_domain);
begin
  -- Physical deletion is only reachable through the gated hard-delete RPC;
  -- retain TB-06's trigger-level bypass for that SECURITY DEFINER path.
  if tg_op = 'DELETE' then return old; end if;
  if (select auth.role()) = 'service_role' or (select private.has_role('admin')) then return coalesce(new, old); end if;
  if (select private.has_role('staff')) then
    if (request_domain_value = 'basic_medical' and not (select private.can_manage_basic_medical()))
      or (request_domain_value = 'nursing_skills' and not (select private.can_manage_equipment_schedule(coalesce(new.class_schedule_id, old.class_schedule_id)))) then
      raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.registrant_id = actor_id and new.created_by = actor_id then return new; end if;
  if tg_op = 'UPDATE' and ((old.registrant_id = actor_id and new.registrant_id = actor_id) or (old.responsible_lecturer_id = actor_id and new.responsible_lecturer_id = actor_id)) then return new; end if;
  raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
end;
$$;

-- Preserve the original TB-06 Skills hard-delete sequence. Basic Medical history
-- is deliberately a tombstone-only lifecycle and is never physically deleted.
create or replace function public.hard_delete_equipment_request(target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  req_row public.equipment_requests;
  deleted_count integer := 0;
begin
  select * into req_row from public.equipment_requests where id = target_request_id for update;
  if req_row.id is null then return false; end if;
  if req_row.request_domain = 'basic_medical' then return false; end if;
  if not (select private.can_hard_delete()) then raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501'; end if;
  perform private.enqueue_equipment_request_outbox_event(target_request_id, 'deleted', actor_id);
  delete from public.equipment_request_items where request_id = target_request_id;
  delete from public.equipment_requests where id = target_request_id;
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor_id, 'equipment_request.hard_deleted', 'equipment_request', target_request_id);
  end if;
  return deleted_count > 0;
end;
$$;

-- The Wave 1 RPC used a double-escaped phone expression. Re-declare it here so
-- the shared domain triggers are reachable by valid Basic Medical callers.
create or replace function public.create_equipment_request_with_items(
  target_class_schedule_id uuid, target_semester text, target_responsible_lecturer_id uuid,
  target_receive_at timestamptz, target_return_at timestamptz, target_note text,
  target_late_registration_reason text, target_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); actor_profile public.profiles; source_row record;
  request_id uuid; responsible_id uuid; req_late_status text;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  select schedules.id as schedule_id, schedules.semester as schedule_semester, sessions.id as session_id,
         sessions.lesson_title, sessions.teaching_lecturer_id, registrations.semester as registration_semester,
         registrations.created_by, registrations.registrant_id
  into source_row from public.class_schedules schedules
  left join public.basic_medical_registration_sessions sessions on sessions.class_schedule_id = schedules.id
  left join public.basic_medical_registrations registrations on registrations.id = sessions.registration_id
  where schedules.id = target_class_schedule_id and schedules.schedule_status <> 'cancelled' for update of schedules;
  if source_row.schedule_id is null then raise exception 'EQUIPMENT_REQUEST_SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if source_row.session_id is null then
    if not (select private.can_manage_equipment_schedule(target_class_schedule_id)) and not (select private.has_role('lecturer')) and not (select private.has_role('teaching_assistant')) then raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501'; end if;
    responsible_id := target_responsible_lecturer_id;
    if source_row.schedule_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text) left join public.equipment_catalog c on c.id=i.catalog_item_id where nullif(btrim(i.skill_name),'') is null or i.quantity is null or i.quantity < 1 or c.id is null or not c.is_active) then raise exception 'EQUIPMENT_REQUEST_SKILLS_CATALOG_REQUIRED' using errcode = '22023'; end if;
  else
    if not ((select private.can_manage_basic_medical()) or actor_id in (source_row.created_by,source_row.registrant_id,source_row.teaching_lecturer_id)) then raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_SCOPE_REQUIRED' using errcode = '42501'; end if;
    responsible_id := coalesce(target_responsible_lecturer_id,source_row.teaching_lecturer_id);
    if responsible_id <> source_row.teaching_lecturer_id and not ((select private.is_admin()) or (select private.can_manage_basic_medical())) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode = '42501'; end if;
    if source_row.registration_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text) left join public.basic_medical_equipment_catalog c on c.id=i.catalog_item_id where nullif(btrim(i.skill_name),'') is null or i.quantity is null or i.quantity < 1 or c.id is null or not c.is_active) then raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode = '22023'; end if;
  end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 500 then raise exception 'EQUIPMENT_REQUEST_ITEMS_REQUIRED' using errcode = '22023'; end if;
  select * into actor_profile from public.profiles where id=actor_id;
  if actor_profile.id is null or coalesce(actor_profile.phone,'') !~ '^\d{10}$' then raise exception 'EQUIPMENT_REQUEST_PHONE_REQUIRED' using errcode = '22023'; end if;
  insert into public.equipment_requests(class_schedule_id,semester,registrant_id,responsible_lecturer_id,phone_snapshot,email_snapshot,receive_at,return_at,late_registration_reason,note,created_by)
  values(target_class_schedule_id,coalesce(source_row.registration_semester,source_row.schedule_semester),actor_id,responsible_id,actor_profile.phone,actor_profile.email,target_receive_at,target_return_at,nullif(btrim(target_late_registration_reason),''),nullif(btrim(target_note),''),actor_id)
  returning id,status into request_id,req_late_status;
  insert into public.equipment_request_items(request_id,skill_name,catalog_item_id,basic_medical_catalog_item_id,quantity,note)
  select request_id,coalesce(nullif(btrim(i.skill_name),''),source_row.lesson_title),case when source_row.session_id is null then i.catalog_item_id else null end,case when source_row.session_id is not null then i.catalog_item_id else null end,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text);
  return request_id;
end;
$$;

create or replace function public.save_basic_medical_registration(
  target_registration_id uuid default null, target_academic_year text default null, target_semester text default null,
  target_start_date date default null, target_end_date date default null, target_course_id uuid default null, target_room_id uuid default null,
  target_student_count integer default null, target_responsible_lecturer_id uuid default null, target_note text default null, target_sessions jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  registration_id_value uuid;
  registration_owner_id uuid;
  course_row record;
  session_row record;
  existing_session record;
  schedule_id_value uuid;
  session_number_value integer := 0;
  event_type_val text;
  mutation_id_val uuid;
  responsible_id uuid;
  is_manager boolean := (select private.can_manage_basic_medical());
  is_eligible_creator boolean;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501'; end if;
  is_eligible_creator := exists (
    select 1 from public.profiles profiles
    where profiles.id = actor_id and profiles.is_active and profiles.allow_basic_medical_access
  ) and ((select private.has_role('lecturer')) or (select private.has_role('teaching_assistant')))
    and (select private.has_room_type(basic_medical_room_type_id));
  if not is_manager and not is_eligible_creator then raise exception 'BASIC_MEDICAL_SAVE_FORBIDDEN' using errcode = '42501'; end if;

  if target_academic_year !~ '^\d{4}-\d{4}$'
    or substring(target_academic_year from 6 for 4)::integer <> substring(target_academic_year from 1 for 4)::integer + 1 then
    raise exception 'BASIC_MEDICAL_ACADEMIC_YEAR_INVALID' using errcode = '22023';
  end if;
  if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then raise exception 'BASIC_MEDICAL_SEMESTER_INVALID' using errcode = '22023'; end if;
  if target_start_date is null or target_end_date is null or target_end_date < target_start_date then raise exception 'BASIC_MEDICAL_DATE_RANGE_INVALID' using errcode = '22023'; end if;
  if target_student_count is null or target_student_count < 1 then raise exception 'BASIC_MEDICAL_STUDENT_COUNT_INVALID' using errcode = '22023'; end if;
  if target_sessions is null or jsonb_typeof(target_sessions) <> 'array' or jsonb_array_length(target_sessions) not between 1 and 500 then raise exception 'BASIC_MEDICAL_SESSIONS_REQUIRED' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id is not null group by s.session_id having count(*) > 1) then raise exception 'BASIC_MEDICAL_SESSION_ID_DUPLICATE' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid,schedule_date date,start_time time,end_time time,lesson_title text,teaching_lecturer_id uuid)
    left join public.profiles p on p.id=s.teaching_lecturer_id
    where s.schedule_date is null or s.schedule_date not between target_start_date and target_end_date or s.start_time is null or s.start_time < time '07:00' or s.end_time is null or s.end_time > time '21:00' or s.end_time <= s.start_time or nullif(btrim(s.lesson_title),'') is null
      or p.id is null or not p.is_active or not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='lecturer')
      or not exists(select 1 from public.profile_room_types a where a.profile_id=p.id and a.room_type_id=basic_medical_room_type_id)) then raise exception 'BASIC_MEDICAL_SESSION_INVALID' using errcode='22023'; end if;
  select course_code, course_name into course_row from public.courses where id=target_course_id and is_active and room_type_id=basic_medical_room_type_id;
  if course_row.course_code is null or not exists(select 1 from public.rooms where id=target_room_id and is_active and room_type_id=basic_medical_room_type_id) then raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode='22023'; end if;

  perform set_config('app.basic_medical_registration_mutation','true',true);
  if target_registration_id is null then
    event_type_val := 'created'; mutation_id_val := null;
    insert into public.basic_medical_registrations(academic_year,semester,start_date,end_date,course_id,room_id,student_count,registrant_id,responsible_lecturer_id,note,created_by)
    values(target_academic_year,target_semester,target_start_date,target_end_date,target_course_id,target_room_id,target_student_count,actor_id,coalesce(target_responsible_lecturer_id,(target_sessions->0->>'teaching_lecturer_id')::uuid),nullif(btrim(target_note),''),actor_id)
    returning id,created_by into registration_id_value,registration_owner_id;
  else
    event_type_val := 'updated'; mutation_id_val := gen_random_uuid();
    select id,created_by into registration_id_value,registration_owner_id from public.basic_medical_registrations where id=target_registration_id for update;
    if registration_id_value is null then raise exception 'BASIC_MEDICAL_REGISTRATION_NOT_FOUND' using errcode='P0002'; end if;
    if exists(select 1 from public.basic_medical_registrations where id=registration_id_value and cancelled_at is not null) then raise exception 'REGISTRATION_CANCELLED' using errcode='55000'; end if;
    if not is_manager and registration_owner_id <> actor_id then raise exception 'BASIC_MEDICAL_SAVE_FORBIDDEN' using errcode='42501'; end if;
    if exists(select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id is not null and not exists(select 1 from public.basic_medical_registration_sessions x where x.id=s.session_id and x.registration_id=registration_id_value)) then raise exception 'BASIC_MEDICAL_SESSION_ID_FOREIGN' using errcode='22023'; end if;
    delete from public.class_schedules schedules using public.basic_medical_registration_sessions sessions
    where sessions.registration_id=registration_id_value and schedules.id=sessions.class_schedule_id
      and not exists(select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id=sessions.id);
    -- Shift retained identities out of the 1..500 user range before assigning
    -- final positions, so swaps and longer permutations never violate the key.
    update public.basic_medical_registration_sessions
    set session_number = session_number + 1000000
    where registration_id = registration_id_value
      and id in (select s.session_id from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id is not null);
    update public.basic_medical_registrations set academic_year=target_academic_year,semester=target_semester,start_date=target_start_date,end_date=target_end_date,course_id=target_course_id,room_id=target_room_id,student_count=target_student_count,note=nullif(btrim(target_note),'') where id=registration_id_value;
  end if;

  for session_row in select * from jsonb_to_recordset(target_sessions) s(session_id uuid,schedule_date date,start_time time,end_time time,lesson_title text,teaching_lecturer_id uuid) loop
    session_number_value := session_number_value + 1;
    if session_row.session_id is not null then
      select * into existing_session from public.basic_medical_registration_sessions where id=session_row.session_id and registration_id=registration_id_value for update;
      if existing_session.cancelled_at is not null or exists(select 1 from public.class_schedules where id=existing_session.class_schedule_id and schedule_status='cancelled') then raise exception 'BASIC_MEDICAL_SESSION_CANCELLED' using errcode='22023'; end if;
      update public.class_schedules set course_id=target_course_id,course_code_snapshot=course_row.course_code,course_name_snapshot=course_row.course_name,room_id=target_room_id,lecturer_id=session_row.teaching_lecturer_id,schedule_date=session_row.schedule_date,start_time=session_row.start_time,end_time=session_row.end_time,note=nullif(btrim(target_note),''),student_count=target_student_count where id=existing_session.class_schedule_id;
      update public.basic_medical_registration_sessions set session_number=session_number_value,lesson_title=btrim(session_row.lesson_title),teaching_lecturer_id=session_row.teaching_lecturer_id where id=existing_session.id;
    else
      insert into public.class_schedules(course_id,course_code_snapshot,course_name_snapshot,room_id,lecturer_id,lecturer_2_id,schedule_date,start_time,end_time,source,schedule_status,note,student_count,created_by,published_by,published_at,basic_medical_registration_id)
      values(target_course_id,course_row.course_code,course_row.course_name,target_room_id,session_row.teaching_lecturer_id,null,session_row.schedule_date,session_row.start_time,session_row.end_time,'manual','published',nullif(btrim(target_note),''),target_student_count,registration_owner_id,actor_id,now(),registration_id_value)
      returning id into schedule_id_value;
      insert into public.basic_medical_registration_sessions(registration_id,class_schedule_id,lesson_title,teaching_lecturer_id,session_number) values(registration_id_value,schedule_id_value,btrim(session_row.lesson_title),session_row.teaching_lecturer_id,session_number_value);
    end if;
  end loop;
  responsible_id := coalesce(target_responsible_lecturer_id,(target_sessions->0->>'teaching_lecturer_id')::uuid);
  if responsible_id <> (target_sessions->0->>'teaching_lecturer_id')::uuid and not ((select private.is_admin()) or is_manager) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=responsible_id and p.is_active and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='lecturer') and exists(select 1 from public.profile_room_types a where a.profile_id=p.id and a.room_type_id=basic_medical_room_type_id)) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_INVALID' using errcode='22023'; end if;
  update public.basic_medical_registrations set responsible_lecturer_id=responsible_id where id=registration_id_value;
  perform private.enqueue_basic_medical_registration_outbox_event(registration_id_value,event_type_val,actor_id,mutation_id_val);
  return registration_id_value;
end;
$$;

revoke all on function private.enforce_equipment_request_semester_authority() from public, anon, authenticated;
revoke all on function private.validate_equipment_request_content() from public, anon, authenticated;
revoke all on function private.enforce_equipment_request_room_scope() from public, anon, authenticated;
revoke all on function public.hard_delete_equipment_request(uuid) from public, anon;
grant execute on function public.hard_delete_equipment_request(uuid) to authenticated;
revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
revoke all on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) from public, anon;
grant execute on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) to authenticated;
