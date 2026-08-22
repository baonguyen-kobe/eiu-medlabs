-- Basic Medical Equipment Request Wave 1: shared immutable lifecycle foundation.
-- The source identity is intentionally an unfettered UUID snapshot so a cancelled
-- Basic Medical source may be removed without erasing request history.

do $$ begin
  create type public.equipment_request_domain as enum ('nursing_skills', 'basic_medical');
exception when duplicate_object then null;
end $$;

alter table public.equipment_requests
  add column if not exists request_domain public.equipment_request_domain,
  add column if not exists source_identity_id uuid;

update public.equipment_requests
set request_domain = 'nursing_skills'::public.equipment_request_domain,
    source_identity_id = class_schedule_id
where request_domain is null or source_identity_id is null;

alter table public.equipment_requests
  alter column request_domain set not null,
  alter column source_identity_id set not null,
  alter column class_schedule_id drop not null,
  drop constraint if exists equipment_requests_class_schedule_id_key,
  drop constraint if exists equipment_requests_class_schedule_id_fkey;

alter table public.equipment_requests
  add constraint equipment_requests_class_schedule_id_fkey
    foreign key (class_schedule_id) references public.class_schedules(id)
    on delete restrict deferrable initially deferred,
  add constraint equipment_requests_live_link_domain_check check (
    class_schedule_id is not null or request_domain = 'basic_medical'
  );

create unique index if not exists equipment_requests_domain_source_identity_key
  on public.equipment_requests (request_domain, source_identity_id);

alter table public.equipment_request_items
  alter column catalog_item_id drop not null,
  add column if not exists basic_medical_catalog_item_id uuid
    references public.basic_medical_equipment_catalog(id) on delete restrict,
  add constraint equipment_request_items_one_domain_catalog check (
    num_nonnulls(catalog_item_id, basic_medical_catalog_item_id) = 1
  );

create or replace function private.derive_equipment_request_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  basic_session_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.request_domain <> old.request_domain
      or new.source_identity_id <> old.source_identity_id then
      raise exception 'EQUIPMENT_REQUEST_DOMAIN_OR_SOURCE_IMMUTABLE' using errcode = '22023';
    end if;
    if new.class_schedule_id is distinct from old.class_schedule_id then
      if not (
        old.request_domain = 'basic_medical'
        and old.status = 'cancelled'
        and new.class_schedule_id is null
        and current_setting('app.basic_medical_equipment_tombstone', true) = 'true'
      ) then
        raise exception 'EQUIPMENT_REQUEST_LIVE_SOURCE_IMMUTABLE' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  select sessions.id into basic_session_id
  from public.basic_medical_registration_sessions as sessions
  where sessions.class_schedule_id = new.class_schedule_id;

  if basic_session_id is null then
    new.request_domain := 'nursing_skills';
    new.source_identity_id := new.class_schedule_id;
  else
    new.request_domain := 'basic_medical';
    new.source_identity_id := basic_session_id;
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_requests_derive_source on public.equipment_requests;
create trigger equipment_requests_derive_source
before insert or update on public.equipment_requests
for each row execute function private.derive_equipment_request_source();

create or replace function private.enforce_equipment_request_item_domain_catalog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_domain_value public.equipment_request_domain;
begin
  select request_domain into request_domain_value
  from public.equipment_requests where id = new.request_id;
  if request_domain_value is null then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request_domain_value = 'nursing_skills' then
    if new.catalog_item_id is null or new.basic_medical_catalog_item_id is not null
      or not exists (select 1 from public.equipment_catalog where id = new.catalog_item_id and is_active) then
      raise exception 'EQUIPMENT_REQUEST_SKILLS_CATALOG_REQUIRED' using errcode = '22023';
    end if;
  elsif new.basic_medical_catalog_item_id is null or new.catalog_item_id is not null
    or not exists (select 1 from public.basic_medical_equipment_catalog where id = new.basic_medical_catalog_item_id and is_active) then
    raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_request_items_domain_catalog on public.equipment_request_items;
create trigger equipment_request_items_domain_catalog
before insert or update on public.equipment_request_items
for each row execute function private.enforce_equipment_request_item_domain_catalog();

create or replace function private.can_manage_equipment_request(target_request_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.equipment_requests as requests
    where requests.id = target_request_id
      and (
        (select private.has_role('admin'))
        or (
          requests.request_domain = 'nursing_skills'
          and (select private.can_manage_equipment_schedule(requests.class_schedule_id))
        )
        or (
          requests.request_domain = 'basic_medical'
          and (select private.can_manage_basic_medical())
        )
      )
  );
$$;

create or replace function private.guard_equipment_request_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.request_domain = 'basic_medical' then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_REQUEST_HISTORY_IMMUTABLE' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists equipment_requests_preserve_basic_medical_history on public.equipment_requests;
create trigger equipment_requests_preserve_basic_medical_history
before delete on public.equipment_requests
for each row execute function private.guard_equipment_request_delete();

create or replace function private.detach_cancelled_basic_medical_equipment_tombstones()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.equipment_requests
    where class_schedule_id = old.id and request_domain = 'nursing_skills'
  ) then
    raise exception 'CLASS_EQUIPMENT_REQUEST_EXISTS' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.equipment_requests
    where class_schedule_id = old.id and request_domain = 'basic_medical'
      and status <> 'cancelled'
  ) then
    raise exception 'BASIC_MEDICAL_SESSION_REMOVAL_BLOCKED_BY_ACTIVE_EQUIPMENT_REQUEST' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.equipment_requests
    where class_schedule_id = old.id and request_domain = 'basic_medical'
  ) then
    perform set_config('app.basic_medical_equipment_tombstone', 'true', true);
    update public.equipment_requests
    set class_schedule_id = null
    where class_schedule_id = old.id and request_domain = 'basic_medical'
      and status = 'cancelled';
  end if;
  return old;
end;
$$;

drop trigger if exists equipment_requests_detach_basic_medical_tombstones on public.class_schedules;
create trigger equipment_requests_detach_basic_medical_tombstones
before delete on public.class_schedules
for each row execute function private.detach_cancelled_basic_medical_equipment_tombstones();

create or replace function public.create_equipment_request_with_items(
  target_class_schedule_id uuid, target_semester text,
  target_responsible_lecturer_id uuid, target_receive_at timestamptz,
  target_return_at timestamptz, target_note text,
  target_late_registration_reason text, target_items jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.profiles;
  source_row record;
  request_id uuid;
  responsible_id uuid;
  req_late_status text;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  select schedules.id as schedule_id, schedules.semester as schedule_semester,
         sessions.id as session_id, sessions.lesson_title, sessions.teaching_lecturer_id,
         registrations.semester as registration_semester, registrations.created_by,
         registrations.registrant_id
  into source_row
  from public.class_schedules schedules
  left join public.basic_medical_registration_sessions sessions on sessions.class_schedule_id = schedules.id
  left join public.basic_medical_registrations registrations on registrations.id = sessions.registration_id
  where schedules.id = target_class_schedule_id and schedules.schedule_status <> 'cancelled'
  for update of schedules;
  if source_row.schedule_id is null then raise exception 'EQUIPMENT_REQUEST_SOURCE_NOT_AVAILABLE' using errcode = 'P0002'; end if;
  if source_row.session_id is null then
    if not (select private.can_manage_equipment_schedule(target_class_schedule_id))
      and not (select private.has_role('lecturer')) and not (select private.has_role('teaching_assistant')) then
      raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    responsible_id := target_responsible_lecturer_id;
    if source_row.schedule_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text)
      left join public.equipment_catalog c on c.id = i.catalog_item_id
      where nullif(btrim(i.skill_name),'') is null or i.quantity is null or i.quantity < 1 or c.id is null or not c.is_active) then
      raise exception 'EQUIPMENT_REQUEST_SKILLS_CATALOG_REQUIRED' using errcode = '22023';
    end if;
  else
    if not ((select private.can_manage_basic_medical()) or actor_id in (source_row.created_by, source_row.registrant_id, source_row.teaching_lecturer_id)) then
      raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    responsible_id := coalesce(target_responsible_lecturer_id, source_row.teaching_lecturer_id);
    if responsible_id <> source_row.teaching_lecturer_id and not ((select private.is_admin()) or (select private.can_manage_basic_medical())) then
      raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode = '42501';
    end if;
    if source_row.registration_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text)
      left join public.basic_medical_equipment_catalog c on c.id = i.catalog_item_id
      where i.quantity is null or i.quantity < 1 or c.id is null or not c.is_active) then
      raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode = '22023';
    end if;
  end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) not between 1 and 500 then
    raise exception 'EQUIPMENT_REQUEST_ITEMS_REQUIRED' using errcode = '22023'; end if;
  select * into actor_profile from public.profiles where id = actor_id;
  if actor_profile.id is null or coalesce(actor_profile.phone,'') !~ '^\\d{10}$' then raise exception 'EQUIPMENT_REQUEST_PHONE_REQUIRED' using errcode = '22023'; end if;
  insert into public.equipment_requests(class_schedule_id,semester,registrant_id,responsible_lecturer_id,phone_snapshot,email_snapshot,receive_at,return_at,late_registration_reason,note,created_by)
  values(target_class_schedule_id, coalesce(source_row.registration_semester,source_row.schedule_semester), actor_id,responsible_id,actor_profile.phone,actor_profile.email,target_receive_at,target_return_at,nullif(btrim(target_late_registration_reason),''),nullif(btrim(target_note),''),actor_id)
  returning id into request_id;
  if source_row.session_id is null then
    insert into public.equipment_request_items(request_id,skill_name,catalog_item_id,quantity,note)
    select request_id,btrim(i.skill_name),i.catalog_item_id,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text);
  else
    insert into public.equipment_request_items(request_id,skill_name,basic_medical_catalog_item_id,quantity,note)
    select request_id,source_row.lesson_title,i.catalog_item_id,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text);
  end if;
  select late_approval_status into req_late_status from public.equipment_requests where id=request_id;
  perform private.enqueue_equipment_request_outbox_event(request_id,case when req_late_status='pending' then 'late_approval_requested' else 'created' end,null,actor_id);
  return request_id;
end; $$;

create or replace function public.hard_delete_equipment_request(target_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.equipment_requests where id=target_request_id and request_domain='basic_medical') then return false; end if;
  if not (select private.can_hard_delete()) then raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode='42501'; end if;
  delete from public.equipment_request_items where request_id=target_request_id;
  delete from public.equipment_requests where id=target_request_id;
  return found;
end; $$;

create or replace function public.save_basic_medical_registration(
  target_registration_id uuid default null, target_academic_year text default null, target_semester text default null,
  target_start_date date default null, target_end_date date default null, target_course_id uuid default null, target_room_id uuid default null,
  target_student_count integer default null, target_responsible_lecturer_id uuid default null, target_note text default null, target_sessions jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); registration_id_value uuid; registration_owner_id uuid;
  course_row record; session_row record; existing_session record; schedule_id_value uuid; session_number_value integer := 0; event_type_val text; mutation_id_val uuid;
  responsible_id uuid; basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if target_sessions is null or jsonb_typeof(target_sessions) <> 'array' or jsonb_array_length(target_sessions) not between 1 and 500 then raise exception 'BASIC_MEDICAL_SESSIONS_REQUIRED' using errcode='22023'; end if;
  if exists (select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid,schedule_date date,start_time time,end_time time,lesson_title text,teaching_lecturer_id uuid)
    left join public.profiles p on p.id=s.teaching_lecturer_id
    where s.schedule_date is null or s.schedule_date not between target_start_date and target_end_date or s.start_time < time '07:00' or s.end_time > time '21:00' or s.end_time <= s.start_time or nullif(btrim(s.lesson_title),'') is null
      or p.id is null or not p.is_active or not exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='lecturer')
      or not exists(select 1 from public.profile_room_types a where a.profile_id=p.id and a.room_type_id=basic_medical_room_type_id)) then raise exception 'BASIC_MEDICAL_SESSION_INVALID' using errcode='22023'; end if;
  if exists (select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id is not null group by s.session_id having count(*) > 1) then raise exception 'BASIC_MEDICAL_SESSION_ID_DUPLICATE' using errcode='22023'; end if;
  select course_code,course_name into course_row from public.courses where id=target_course_id and is_active and room_type_id=basic_medical_room_type_id;
  if course_row.course_code is null or not exists(select 1 from public.rooms where id=target_room_id and is_active and room_type_id=basic_medical_room_type_id) then raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode='22023'; end if;
  perform set_config('app.basic_medical_registration_mutation','true',true);
  if target_registration_id is null then
    event_type_val := 'created'; mutation_id_val := null;
    if not ((select private.can_manage_basic_medical()) or (select private.has_role('lecturer')) or (select private.has_role('teaching_assistant'))) then raise exception 'BASIC_MEDICAL_SAVE_FORBIDDEN' using errcode='42501'; end if;
    insert into public.basic_medical_registrations(academic_year,semester,start_date,end_date,course_id,room_id,student_count,registrant_id,responsible_lecturer_id,note,created_by)
    values(target_academic_year,target_semester,target_start_date,target_end_date,target_course_id,target_room_id,target_student_count,actor_id,coalesce(target_responsible_lecturer_id,(target_sessions->0->>'teaching_lecturer_id')::uuid),nullif(btrim(target_note),''),actor_id)
    returning id,created_by into registration_id_value,registration_owner_id;
  else
    event_type_val := 'updated'; mutation_id_val := gen_random_uuid();
    select id,created_by into registration_id_value,registration_owner_id from public.basic_medical_registrations where id=target_registration_id for update;
    if registration_id_value is null then raise exception 'BASIC_MEDICAL_REGISTRATION_NOT_FOUND' using errcode='P0002'; end if;
    if exists(select 1 from public.basic_medical_registrations where id=registration_id_value and cancelled_at is not null) then raise exception 'REGISTRATION_CANCELLED' using errcode='55000'; end if;
    if registration_owner_id<>actor_id and not (select private.can_manage_basic_medical()) then raise exception 'BASIC_MEDICAL_SAVE_FORBIDDEN' using errcode='42501'; end if;
    if exists(select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id is not null and not exists(select 1 from public.basic_medical_registration_sessions x where x.id=s.session_id and x.registration_id=registration_id_value)) then raise exception 'BASIC_MEDICAL_SESSION_ID_FOREIGN' using errcode='22023'; end if;
    delete from public.class_schedules schedules using public.basic_medical_registration_sessions sessions
    where sessions.registration_id=registration_id_value and schedules.id=sessions.class_schedule_id
      and not exists(select 1 from jsonb_to_recordset(target_sessions) s(session_id uuid) where s.session_id=sessions.id);
    update public.basic_medical_registrations set academic_year=target_academic_year,semester=target_semester,start_date=target_start_date,end_date=target_end_date,course_id=target_course_id,room_id=target_room_id,student_count=target_student_count,note=nullif(btrim(target_note),'') where id=registration_id_value;
  end if;
  for session_row in select * from jsonb_to_recordset(target_sessions) s(session_id uuid,schedule_date date,start_time time,end_time time,lesson_title text,teaching_lecturer_id uuid) loop
    session_number_value:=session_number_value+1;
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
  if responsible_id <> (target_sessions->0->>'teaching_lecturer_id')::uuid and not ((select private.is_admin()) or (select private.can_manage_basic_medical())) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=responsible_id and p.is_active and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='lecturer') and exists(select 1 from public.profile_room_types a where a.profile_id=p.id and a.room_type_id=basic_medical_room_type_id)) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_INVALID' using errcode='22023'; end if;
  update public.basic_medical_registrations set responsible_lecturer_id=responsible_id where id=registration_id_value;
  perform private.enqueue_basic_medical_registration_outbox_event(registration_id_value,event_type_val,actor_id,mutation_id_val);
  return registration_id_value;
end; $$;

revoke all on function private.derive_equipment_request_source() from public, anon, authenticated;
revoke all on function private.enforce_equipment_request_item_domain_catalog() from public, anon, authenticated;
revoke all on function private.guard_equipment_request_delete() from public, anon, authenticated;
revoke all on function private.detach_cancelled_basic_medical_equipment_tombstones() from public, anon, authenticated;
revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
revoke all on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) from public, anon;
grant execute on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) to authenticated;
