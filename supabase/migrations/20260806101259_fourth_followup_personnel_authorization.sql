-- Convert legacy Importer rows into a supplemental permission. Importer-only
-- accounts receive Teaching Assistant to preserve the old "Trợ giảng" intent.
update public.profiles profiles
set can_import_schedules = true
where exists (
  select 1 from public.user_roles roles
  where roles.user_id = profiles.id and roles.role = 'importer'
);

insert into public.user_roles (user_id, role, created_by)
select legacy.user_id, 'teaching_assistant'::public.app_role, legacy.created_by
from public.user_roles legacy
where legacy.role = 'importer'
  and not exists (
    select 1 from public.user_roles operational
    where operational.user_id = legacy.user_id
      and operational.role in ('admin','staff','lecturer','teaching_assistant')
  )
on conflict do nothing;

delete from public.user_roles where role = 'importer';

create or replace function private.prevent_deprecated_importer_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'importer'::public.app_role then
    raise exception 'DEPRECATED_IMPORTER_ROLE' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists user_roles_reject_deprecated_importer on public.user_roles;
create trigger user_roles_reject_deprecated_importer
before insert or update of role on public.user_roles
for each row execute function private.prevent_deprecated_importer_role();
revoke all on function private.prevent_deprecated_importer_role() from public, anon, authenticated;

create or replace function private.can_create_schedule_entries()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_active_user()) and exists (
    select 1 from public.user_roles roles
    where roles.user_id = (select auth.uid())
      and roles.role in ('admin','staff','lecturer','teaching_assistant')
  );
$$;

create or replace function private.can_manage_class_room(target_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.can_access_room(target_room_id)) and exists (
    select 1 from public.user_roles roles
    where roles.user_id = (select auth.uid()) and roles.role in ('admin','staff')
  );
$$;

create or replace function private.can_import_schedules(target_room_type_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_active_user()) and (
    (select private.has_role('admin'))
    or (
      exists (select 1 from public.profiles profiles where profiles.id = (select auth.uid()) and profiles.can_import_schedules)
      and exists (
        select 1 from public.user_roles roles where roles.user_id = (select auth.uid())
          and roles.role in ('staff','lecturer','teaching_assistant')
      )
      and exists (
        select 1 from public.profile_room_types scopes where scopes.profile_id = (select auth.uid())
          and scopes.room_type_id = target_room_type_id
      )
    )
  );
$$;

create or replace function private.can_create_manual_schedule_for(
  target_room_id uuid, target_lecturer_ids uuid[]
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  target_room_type_id uuid;
  lecturer_ids uuid[] := array_remove(coalesce(target_lecturer_ids, '{}'::uuid[]), null);
begin
  if actor_id is null or not (select private.is_active_user()) then return false; end if;
  select rooms.room_type_id into target_room_type_id from public.rooms rooms
  where rooms.id = target_room_id and rooms.is_active;
  if target_room_type_id is null or not (select private.has_room_type(target_room_type_id))
    or cardinality(lecturer_ids) > 2
    or cardinality(lecturer_ids) <> cardinality(array(select distinct unnest(lecturer_ids))) then
    return false;
  end if;
  if exists (
    select 1 from unnest(lecturer_ids) requested(id)
    where not exists (
      select 1 from public.profiles profiles where profiles.id = requested.id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = target_room_type_id)
    )
  ) then return false; end if;
  if (select private.has_role('admin')) or (select private.has_role('staff')) then return true; end if;
  if (select private.has_role('teaching_assistant')) then return cardinality(lecturer_ids) > 0; end if;
  if (select private.has_role('lecturer')) then return cardinality(lecturer_ids) > 0 and actor_id = any(lecturer_ids); end if;
  return false;
end;
$$;

create or replace function private.can_modify_class_schedule(target_schedule_id uuid, target_action text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  schedule_row public.class_schedules;
  room_type_value uuid;
  in_scope boolean := false;
  import_batch_owns boolean := false;
  lecturer_is_related boolean := false;
  can_admin boolean := false;
  can_staff boolean := false;
  can_import_owner boolean := false;
  can_teaching_assistant boolean := false;
  can_lecturer boolean := false;
begin
  if actor_id is null or not (select private.is_active_user())
    or target_action not in ('assign_lecturers','reschedule','details','delete') then return false; end if;
  select schedules.* into schedule_row from public.class_schedules schedules
  where schedules.id = target_schedule_id and schedules.schedule_status <> 'cancelled';
  if schedule_row.id is null then return false; end if;
  select rooms.room_type_id into room_type_value from public.rooms rooms where rooms.id = schedule_row.room_id;
  in_scope := room_type_value is not null and (select private.has_room_type(room_type_value));
  import_batch_owns := schedule_row.source = 'import' and exists (
    select 1 from public.import_batches batches where batches.id = schedule_row.import_batch_id and batches.created_by = actor_id
  );
  lecturer_is_related := schedule_row.created_by = actor_id
    or coalesce(actor_id in (schedule_row.lecturer_id, schedule_row.lecturer_2_id), false);
  can_admin := (select private.has_role('admin'));
  can_staff := (select private.has_role('staff')) and in_scope;
  can_import_owner := in_scope and import_batch_owns
    and exists (select 1 from public.profiles profiles where profiles.id=actor_id and profiles.is_active and profiles.can_import_schedules)
    and exists (select 1 from public.user_roles roles where roles.user_id=actor_id and roles.role in ('staff','lecturer','teaching_assistant'));
  can_teaching_assistant := (select private.has_role('teaching_assistant')) and in_scope and schedule_row.created_by = actor_id;
  if (select private.has_role('lecturer')) and target_action in ('reschedule','details') then
    can_lecturer := in_scope and lecturer_is_related;
  elsif (select private.has_role('lecturer')) and target_action = 'delete' then
    can_lecturer := in_scope and schedule_row.created_by = actor_id
      and room_type_value = '40000000-0000-0000-0000-000000000001'::uuid;
  elsif (select private.has_role('lecturer')) and target_action = 'assign_lecturers' then
    can_lecturer := in_scope and schedule_row.created_by = actor_id;
  end if;
  return coalesce(can_admin,false) or coalesce(can_staff,false)
    or coalesce(can_import_owner,false) or coalesce(can_teaching_assistant,false)
    or coalesce(can_lecturer,false);
end;
$$;

revoke all on function private.can_import_schedules(uuid) from public, anon;
revoke all on function private.can_create_manual_schedule_for(uuid,uuid[]) from public, anon;
revoke all on function private.can_modify_class_schedule(uuid,text) from public, anon;
grant execute on function private.can_import_schedules(uuid) to authenticated;
grant execute on function private.can_create_manual_schedule_for(uuid,uuid[]) to authenticated;
grant execute on function private.can_modify_class_schedule(uuid,text) to authenticated;

drop policy if exists class_schedules_scoped_insert on public.class_schedules;
create policy class_schedules_scoped_insert on public.class_schedules
for insert to authenticated with check (
  (select private.can_create_manual_schedule_for(room_id, array_remove(array[lecturer_id,lecturer_2_id]::uuid[],null)))
  and created_by = (select auth.uid()) and source = 'manual'
  and schedule_status = 'published' and published_by = (select auth.uid()) and published_at is not null
  and cancelled_at is null and cancelled_by is null and student_count >= 1
  and (basic_medical_registration_id is null or exists (
    select 1 from public.basic_medical_registrations registration
    where registration.id = basic_medical_registration_id and registration.created_by = (select auth.uid())
  ))
);

drop policy if exists import_batches_scoped_insert on public.import_batches;
drop policy if exists import_batches_scoped_select on public.import_batches;
create policy import_batches_scoped_select on public.import_batches
for select to authenticated using (
  (select private.has_room_type(room_type_id)) and (
    (select private.has_role('admin')) or (select private.has_role('staff'))
    or (created_by = (select auth.uid()) and (select private.can_import_schedules(room_type_id)))
  )
);
create policy import_batches_scoped_insert on public.import_batches
for insert to authenticated with check (
  (select private.can_import_schedules(room_type_id)) and created_by = (select auth.uid())
);
drop policy if exists import_batches_scoped_update on public.import_batches;
create policy import_batches_scoped_update on public.import_batches
for update to authenticated using (
  (select private.has_room_type(room_type_id)) and (
    (select private.has_role('admin'))
    or ((select private.can_import_schedules(room_type_id)) and created_by = (select auth.uid()) and status not in ('completed','failed'))
  )
) with check (
  (select private.has_room_type(room_type_id)) and (
    (select private.has_role('admin'))
    or ((select private.can_import_schedules(room_type_id)) and created_by = (select auth.uid()))
  )
);

create or replace function public.admin_update_personnel(
  target_profile_id uuid, target_email text, target_full_name text, target_phone text,
  target_title text, target_roles public.app_role[], target_can_import_schedules boolean,
  target_room_type_ids uuid[], target_email_room_type_ids uuid[],
  target_allow_basic_medical_access boolean, target_is_active boolean,
  target_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  current_profile public.profiles;
  normalized_email text := lower(btrim(coalesce(target_email,'')));
  normalized_name text := btrim(coalesce(target_full_name,''));
  normalized_phone text := nullif(btrim(coalesce(target_phone,'')),'');
  normalized_title text := nullif(btrim(coalesce(target_title,'')),'');
  normalized_roles public.app_role[];
  normalized_scopes uuid[];
  normalized_email_scopes uuid[];
  active_admin_count integer;
begin
  if actor_id is null or not (select private.has_role('admin')) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  select profiles.* into current_profile from public.profiles profiles
  where profiles.id = target_profile_id for update;
  if current_profile.id is null then raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002'; end if;
  if current_profile.access_version <> target_expected_version then
    raise exception 'PERSONNEL_CHANGED_RELOAD_REQUIRED' using errcode = 'P0001';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_PERSONNEL_EMAIL' using errcode = '22023';
  end if;
  if normalized_name = '' then raise exception 'INVALID_PERSONNEL_NAME' using errcode = '22023'; end if;

  select coalesce(array_agg(distinct role_value order by role_value),'{}'::public.app_role[])
  into normalized_roles from unnest(coalesce(target_roles,'{}'::public.app_role[])) values_list(role_value);
  if cardinality(normalized_roles) = 0 then raise exception 'MAIN_ROLE_REQUIRED' using errcode = '22023'; end if;
  if 'importer'::public.app_role = any(normalized_roles) then raise exception 'DEPRECATED_IMPORTER_ROLE' using errcode = '22023'; end if;
  if 'viewer'::public.app_role = any(normalized_roles) and cardinality(normalized_roles) <> 1 then
    raise exception 'VIEWER_ROLE_MUST_BE_EXCLUSIVE' using errcode = '22023';
  end if;
  if target_can_import_schedules and not (
    'staff'::public.app_role = any(normalized_roles)
    or 'lecturer'::public.app_role = any(normalized_roles)
    or 'teaching_assistant'::public.app_role = any(normalized_roles)
  ) then raise exception 'IMPORT_PERMISSION_ROLE_REQUIRED' using errcode = '22023'; end if;

  select coalesce(array_agg(distinct scope_id order by scope_id),'{}'::uuid[])
  into normalized_scopes from unnest(coalesce(target_room_type_ids,'{}'::uuid[])) values_list(scope_id);
  select coalesce(array_agg(distinct scope_id order by scope_id),'{}'::uuid[])
  into normalized_email_scopes from unnest(coalesce(target_email_room_type_ids,'{}'::uuid[])) values_list(scope_id);
  if cardinality(normalized_scopes) = 0 then raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '22023'; end if;
  if exists (
    select 1 from unnest(normalized_scopes) requested(id)
    where not exists (select 1 from public.room_types rt where rt.id = requested.id and rt.is_active)
  ) then raise exception 'INVALID_ROOM_TYPE_SCOPE' using errcode = '22023'; end if;
  if exists (select 1 from unnest(normalized_email_scopes) requested(id) where requested.id <> all(normalized_scopes)) then
    raise exception 'EMAIL_SCOPE_MUST_BE_ASSIGNED' using errcode = '22023';
  end if;
  if cardinality(normalized_email_scopes) > 0 and not ('viewer'::public.app_role = any(normalized_roles)) then
    raise exception 'EMAIL_SCOPE_VIEWER_ONLY' using errcode = '22023';
  end if;
  if target_allow_basic_medical_access and not (
    ('lecturer'::public.app_role = any(normalized_roles) or 'teaching_assistant'::public.app_role = any(normalized_roles))
    and '40000000-0000-0000-0000-000000000002'::uuid = any(normalized_scopes)
  ) then raise exception 'BASIC_MEDICAL_PERMISSION_INVALID' using errcode = '22023'; end if;

  if target_profile_id = actor_id and not target_is_active then raise exception 'CANNOT_LOCK_CURRENT_ADMIN' using errcode = '42501'; end if;
  if target_profile_id = actor_id and not ('admin'::public.app_role = any(normalized_roles)) then
    raise exception 'CANNOT_REMOVE_CURRENT_ADMIN' using errcode = '42501';
  end if;
  if (not target_is_active or not ('admin'::public.app_role = any(normalized_roles)))
    and exists (select 1 from public.user_roles roles where roles.user_id = target_profile_id and roles.role = 'admin') then
    select count(*) into active_admin_count from public.profiles profiles
    where profiles.is_active and profiles.id <> target_profile_id
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'admin');
    if active_admin_count = 0 then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED' using errcode = '42501'; end if;
  end if;
  if exists (select 1 from public.profiles profiles where profiles.id <> target_profile_id and lower(profiles.email) = normalized_email) then
    raise exception 'PERSONNEL_EMAIL_EXISTS' using errcode = '23505';
  end if;
  if normalized_phone is not null and exists (
    select 1 from public.profiles profiles where profiles.id <> target_profile_id
      and regexp_replace(coalesce(profiles.phone,''),'[^0-9]+','','g') = regexp_replace(normalized_phone,'[^0-9]+','','g')
      and regexp_replace(normalized_phone,'[^0-9]+','','g') <> ''
  ) then raise exception 'PERSONNEL_PHONE_EXISTS' using errcode = '23505'; end if;

  update public.profiles set email = normalized_email, full_name = normalized_name,
    phone = normalized_phone, title = normalized_title,
    can_import_schedules = coalesce(target_can_import_schedules,false),
    allow_basic_medical_access = coalesce(target_allow_basic_medical_access,false),
    is_active = coalesce(target_is_active,false), access_version = access_version + 1
  where id = target_profile_id;
  delete from public.user_roles where user_id = target_profile_id;
  insert into public.user_roles(user_id,role,created_by)
  select target_profile_id, role_value, actor_id from unnest(normalized_roles) roles(role_value);
  delete from public.profile_room_types where profile_id = target_profile_id;
  insert into public.profile_room_types(profile_id,room_type_id,receive_schedule_emails,created_by)
  select target_profile_id, scope_id, scope_id = any(normalized_email_scopes), actor_id
  from unnest(normalized_scopes) scopes(scope_id);
  return jsonb_build_object(
    'id',target_profile_id,'email',normalized_email,'full_name',normalized_name,
    'phone',normalized_phone,'title',normalized_title,'roles',to_jsonb(normalized_roles),
    'can_import_schedules',coalesce(target_can_import_schedules,false),
    'room_type_ids',to_jsonb(normalized_scopes),'email_room_type_ids',to_jsonb(normalized_email_scopes),
    'allow_basic_medical_access',coalesce(target_allow_basic_medical_access,false),
    'is_active',coalesce(target_is_active,false),'access_version',current_profile.access_version + 1
  );
end;
$$;
revoke all on function public.admin_update_personnel(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer) from public,anon;
grant execute on function public.admin_update_personnel(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer) to authenticated;

create or replace function public.admin_list_personnel(
  target_query text default null, target_role text default null,
  target_import_permission text default 'all', target_status text default 'all',
  target_page integer default 1, target_page_size integer default 50
)
returns table (
  id uuid,email text,full_name text,phone text,title text,is_active boolean,
  can_import_schedules boolean,allow_basic_medical_access boolean,access_version integer,
  roles public.app_role[],room_type_ids uuid[],email_room_type_ids uuid[],total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  started_at timestamptz := clock_timestamp();
  normalized_query text := lower(btrim(coalesce(target_query,'')));
  normalized_role text := nullif(lower(btrim(coalesce(target_role,''))),'');
  normalized_import text := lower(btrim(coalesce(target_import_permission,'all')));
  normalized_status text := lower(btrim(coalesce(target_status,'all')));
  safe_page integer := greatest(coalesce(target_page,1),1);
  safe_page_size integer := least(greatest(coalesce(target_page_size,50),1),50);
begin
  if not (select private.has_role('admin')) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if normalized_role = 'all' then normalized_role := null; end if;
  if normalized_role is not null and normalized_role not in ('admin','staff','lecturer','teaching_assistant','viewer') then
    raise exception 'INVALID_ROLE_FILTER' using errcode = '22023';
  end if;
  if normalized_import not in ('all','enabled','disabled') or normalized_status not in ('all','active','inactive') then
    raise exception 'INVALID_PERSONNEL_FILTER' using errcode = '22023';
  end if;
  return query
  with filtered as (
    select profiles.* from public.profiles profiles
    where exists (select 1 from public.user_roles r where r.user_id = profiles.id and r.role <> 'importer')
      and (normalized_query = ''
        or lower(extensions.unaccent(profiles.full_name)) like '%'||lower(extensions.unaccent(normalized_query))||'%'
        or lower(profiles.email) like '%'||normalized_query||'%'
        or lower(coalesce(profiles.phone,'')) like '%'||normalized_query||'%'
        or lower(extensions.unaccent(coalesce(profiles.title,''))) like '%'||lower(extensions.unaccent(normalized_query))||'%')
      and (normalized_role is null or exists (select 1 from public.user_roles r where r.user_id = profiles.id and r.role::text = normalized_role))
      and (normalized_import = 'all' or (normalized_import='enabled' and profiles.can_import_schedules) or (normalized_import='disabled' and not profiles.can_import_schedules))
      and (normalized_status = 'all' or (normalized_status='active' and profiles.is_active) or (normalized_status='inactive' and not profiles.is_active))
  ), paged as (
    select filtered.*,count(*) over() filtered_count from filtered
    order by filtered.full_name,filtered.id limit safe_page_size offset (safe_page-1)*safe_page_size
  )
  select paged.id,paged.email,paged.full_name,paged.phone,paged.title,paged.is_active,
    paged.can_import_schedules,paged.allow_basic_medical_access,paged.access_version,
    coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id=paged.id and r.role<>'importer'),'{}'::public.app_role[]),
    coalesce((select array_agg(s.room_type_id order by s.room_type_id) from public.profile_room_types s where s.profile_id=paged.id),'{}'::uuid[]),
    coalesce((select array_agg(s.room_type_id order by s.room_type_id) from public.profile_room_types s where s.profile_id=paged.id and s.receive_schedule_emails),'{}'::uuid[]),
    paged.filtered_count from paged;
  raise log 'personnel.list.total_ms=%',extract(milliseconds from clock_timestamp()-started_at)::integer;
end;
$$;
revoke all on function public.admin_list_personnel(text,text,text,text,integer,integer) from public,anon;
grant execute on function public.admin_list_personnel(text,text,text,text,integer,integer) to authenticated;

create or replace function public.list_scoped_import_lecturers(target_room_type_id uuid)
returns table(id uuid,full_name text,email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.can_import_schedules(target_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  return query select profiles.id,profiles.full_name,profiles.email
  from public.profiles profiles where profiles.is_active
    and exists (select 1 from public.user_roles roles where roles.user_id=profiles.id and roles.role='lecturer')
    and exists (select 1 from public.profile_room_types scopes where scopes.profile_id=profiles.id and scopes.room_type_id=target_room_type_id)
  order by profiles.full_name;
end;
$$;

create or replace function public.assign_class_lecturers(target_schedule_id uuid,target_lecturer_ids uuid[])
returns public.class_schedules language plpgsql security definer set search_path = '' as $$
declare
  target_row public.class_schedules;
  room_type_value uuid;
  normalized_ids uuid[];
begin
  select schedules.* into target_row from public.class_schedules schedules
  where schedules.id=target_schedule_id for update;
  if target_row.id is null then raise exception 'CLASS_NOT_AVAILABLE' using errcode='P0001'; end if;
  select rooms.room_type_id into room_type_value from public.rooms rooms where rooms.id=target_row.room_id;
  if not (select private.can_modify_class_schedule(target_schedule_id,'assign_lecturers')) then
    raise exception 'CLASS_MANAGEMENT_SCOPE_REQUIRED' using errcode='42501';
  end if;
  select coalesce(array_agg(distinct id_value order by id_value),'{}'::uuid[])
  into normalized_ids from unnest(coalesce(target_lecturer_ids,'{}'::uuid[])) values_list(id_value)
  where id_value is not null;
  if cardinality(normalized_ids)>2 then raise exception 'TOO_MANY_CLASS_LECTURERS' using errcode='22023'; end if;
  if cardinality(normalized_ids)<>cardinality(array_remove(coalesce(target_lecturer_ids,'{}'::uuid[]),null)) then
    raise exception 'DUPLICATE_CLASS_LECTURER' using errcode='22023';
  end if;
  if exists (
    select 1 from unnest(normalized_ids) requested(id) where not exists (
      select 1 from public.profiles profiles where profiles.id=requested.id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id=profiles.id and roles.role='lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id=profiles.id and scopes.room_type_id=room_type_value)
    )
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode='42501'; end if;
  if (select private.has_role('lecturer'))
    and not ((select private.has_role('admin')) or (select private.has_role('staff')) or (select private.has_role('teaching_assistant')))
    and (select auth.uid()) <> all(normalized_ids) then
    raise exception 'LECTURER_MUST_REMAIN_ASSIGNED' using errcode='42501';
  end if;
  update public.class_schedules set lecturer_id=normalized_ids[1],lecturer_2_id=normalized_ids[2],updated_at=now()
  where id=target_schedule_id returning * into target_row;
  return target_row;
exception when exclusion_violation then raise exception 'LECTURER_SCHEDULE_CONFLICT' using errcode='23P01';
end;
$$;

create or replace function public.create_import_schedule_row(
  target_batch_id uuid,target_row_number integer,target_hash text,target_raw jsonb,
  target_normalized jsonb,target_status public.import_row_status,target_errors jsonb,
  target_warnings jsonb,target_course_id uuid,target_course_code text,target_course_name text,
  target_room_id uuid,target_lecturer_id uuid,target_date date,target_start time,target_end time,
  target_note text,target_student_count integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  batch_room_type_id uuid;
  selected_room_type_id uuid;
  canonical_hash text;
begin
  if target_status not in ('imported','warning') then raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode='22023'; end if;
  if target_student_count is null or target_student_count<1 then raise exception 'INVALID_STUDENT_COUNT' using errcode='22023'; end if;
  if target_date is null or target_start is null or target_end is null or target_end<=target_start then
    raise exception 'INVALID_IMPORT_SCHEDULE' using errcode='22023';
  end if;
  select batches.room_type_id into batch_room_type_id from public.import_batches batches
  where batches.id=target_batch_id and batches.created_by=caller_id and batches.status='importing';
  if batch_room_type_id is null then raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode='42501'; end if;
  if not (select private.can_import_schedules(batch_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode='42501';
  end if;
  select rooms.room_type_id into selected_room_type_id from public.rooms rooms where rooms.id=target_room_id;
  if selected_room_type_id is null or selected_room_type_id<>batch_room_type_id
    or not (select private.has_room_type(selected_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode='42501';
  end if;
  if target_lecturer_id is not null and not (
    (select private.profile_has_room_type(target_lecturer_id,selected_room_type_id))
    and exists (select 1 from public.user_roles roles where roles.user_id=target_lecturer_id and roles.role='lecturer')
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode='42501'; end if;
  canonical_hash:=private.import_schedule_hash(target_course_code,target_room_id,target_date,target_start,target_end);
  if target_hash is distinct from canonical_hash then raise exception 'INVALID_IMPORT_HASH' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(canonical_hash,0));
  if exists (
    select 1 from public.class_schedules schedules where schedules.schedule_status<>'cancelled'
      and schedules.room_id=target_room_id and schedules.schedule_date=target_date
      and schedules.start_time=target_start and schedules.end_time=target_end
      and upper(btrim(schedules.course_code_snapshot))=upper(btrim(target_course_code))
  ) then raise exception 'IMPORT_ROW_DUPLICATE' using errcode='23505'; end if;
  insert into public.class_schedules(
    course_id,course_code_snapshot,course_name_snapshot,room_id,lecturer_id,class_code,
    schedule_date,start_time,end_time,source,source_row_id,import_batch_id,schedule_status,note,
    student_count,created_by,published_by,published_at
  ) values (
    target_course_id,target_course_code,target_course_name,target_room_id,target_lecturer_id,null,
    target_date,target_start,target_end,'import',null,target_batch_id,'published',target_note,
    target_student_count,caller_id,caller_id,now()
  ) returning id into schedule_id;
  insert into public.import_rows(
    import_batch_id,row_number,source_row_id,normalized_row_hash,raw_data,normalized_data,
    validation_status,errors,warnings,class_schedule_id
  ) values (
    target_batch_id,target_row_number,null,canonical_hash,coalesce(target_raw,'{}'::jsonb),
    coalesce(target_normalized,'{}'::jsonb),target_status,coalesce(target_errors,'[]'::jsonb),
    coalesce(target_warnings,'[]'::jsonb),schedule_id
  );
  return schedule_id;
exception when exclusion_violation then raise exception 'SCHEDULE_CONFLICT' using errcode='23P01';
end;
$$;

revoke all on function public.list_scoped_import_lecturers(uuid) from public,anon;
grant execute on function public.list_scoped_import_lecturers(uuid) to authenticated;
revoke all on function public.assign_class_lecturers(uuid,uuid[]) from public,anon;
grant execute on function public.assign_class_lecturers(uuid,uuid[]) to authenticated;
revoke all on function public.create_import_schedule_row(uuid,integer,text,jsonb,jsonb,public.import_row_status,jsonb,jsonb,uuid,text,text,uuid,uuid,date,time,time,text,integer) from public,anon;
grant execute on function public.create_import_schedule_row(uuid,integer,text,jsonb,jsonb,public.import_row_status,jsonb,jsonb,uuid,text,text,uuid,uuid,date,time,time,text,integer) to authenticated;

create or replace function public.update_class_schedule_details(
  target_schedule_id uuid,target_schedule_date date,target_start_time time,
  target_end_time time,target_room_id uuid,target_student_count integer,
  target_lecturer_ids uuid[] default '{}'::uuid[]
)
returns public.class_schedules language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  changed_row public.class_schedules;
  source_room_type uuid;
  target_room_type uuid;
  normalized_ids uuid[] := coalesce(target_lecturer_ids,'{}'::uuid[]);
  is_admin boolean := (select private.has_role('admin'));
  is_staff boolean := (select private.has_role('staff'));
  is_teaching_assistant boolean := (select private.has_role('teaching_assistant'));
  can_import_owner boolean := false;
  can_manage_details boolean := false;
begin
  if not (select private.can_modify_class_schedule(target_schedule_id,'details')) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode='42501';
  end if;
  select * into before_row from public.class_schedules schedules
  where schedules.id=target_schedule_id and schedules.schedule_status<>'cancelled' for update;
  if before_row.id is null then raise exception 'CLASS_NOT_AVAILABLE' using errcode='P0001'; end if;
  select rooms.room_type_id into source_room_type from public.rooms rooms where rooms.id=before_row.room_id;
  can_import_owner:=before_row.source='import' and (select private.can_import_schedules(source_room_type))
    and exists (select 1 from public.import_batches batches where batches.id=before_row.import_batch_id and batches.created_by=actor_id);
  select rooms.room_type_id into target_room_type from public.rooms rooms where rooms.id=target_room_id and rooms.is_active;
  if target_room_type is null then raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode='42501'; end if;
  if is_admin then can_manage_details:=true;
  elsif is_staff then can_manage_details:=(select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
  elsif is_teaching_assistant then can_manage_details:=(select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type)) and before_row.created_by=actor_id;
  elsif can_import_owner then can_manage_details:=(select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
  end if;
  if not can_manage_details then
    if not coalesce(actor_id in (before_row.lecturer_id,before_row.lecturer_2_id),false) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode='42501';
    end if;
    if target_start_time is distinct from before_row.start_time
      or target_end_time is distinct from before_row.end_time
      or target_room_id is distinct from before_row.room_id
      or target_student_count is distinct from before_row.student_count
      or normalized_ids is distinct from array_remove(array[before_row.lecturer_id,before_row.lecturer_2_id],null) then
      raise exception 'CLASS_DETAILS_UPDATE_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  if target_schedule_date is null or target_start_time is null or target_end_time<=target_start_time
    or target_student_count is null or target_student_count<1 or target_room_id is null
    or cardinality(normalized_ids)>2
    or cardinality(normalized_ids)<>cardinality(array(select distinct unnest(normalized_ids))) then
    raise exception 'INVALID_CLASS_DETAILS' using errcode='22023';
  end if;
  if not is_admin and (not (select private.has_room_type(source_room_type)) or not (select private.has_room_type(target_room_type))) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode='42501';
  end if;
  if exists (
    select 1 from unnest(normalized_ids) lecturer_id where not exists (
      select 1 from public.profiles profiles where profiles.id=lecturer_id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id=lecturer_id and roles.role='lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id=lecturer_id and scopes.room_type_id=target_room_type)
    )
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode='42501'; end if;
  if (select private.has_role('lecturer')) and not (is_admin or is_staff or is_teaching_assistant or can_import_owner)
    and actor_id<>all(normalized_ids) then raise exception 'LECTURER_MUST_REMAIN_ASSIGNED' using errcode='42501'; end if;
  update public.class_schedules set schedule_date=target_schedule_date,start_time=target_start_time,
    end_time=target_end_time,room_id=target_room_id,student_count=target_student_count,
    lecturer_id=normalized_ids[1],lecturer_2_id=normalized_ids[2],updated_at=now()
  where id=target_schedule_id returning * into changed_row;
  return changed_row;
exception when exclusion_violation then raise exception 'SCHEDULE_CONFLICT' using errcode='23P01';
end;
$$;
revoke all on function public.update_class_schedule_details(uuid,date,time,time,uuid,integer,uuid[]) from public,anon;
grant execute on function public.update_class_schedule_details(uuid,date,time,time,uuid,integer,uuid[]) to authenticated;

-- Replace the two role checks that previously treated Importer as Trợ giảng.
drop policy if exists basic_medical_registrations_manage on public.basic_medical_registrations;
create policy basic_medical_registrations_manage on public.basic_medical_registrations
for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')) or created_by=(select auth.uid()))
with check (
  created_by=(select auth.uid()) and (
    (select private.has_role('admin')) or (select private.has_role('staff'))
    or (
      ((select private.has_role('lecturer')) or (select private.has_role('teaching_assistant')))
      and (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
      and exists (select 1 from public.profiles profiles where profiles.id=(select auth.uid()) and profiles.allow_basic_medical_access)
    )
  )
);
