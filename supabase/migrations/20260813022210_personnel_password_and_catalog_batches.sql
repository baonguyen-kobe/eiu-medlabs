-- Forward-only personnel password controls and atomic room/course batch writes.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;
alter table public.profiles
  add column if not exists must_change_password_hash text;

create or replace function private.assert_personnel_password_target(target_user_id uuid, require_root boolean default false)
returns table(actor_id uuid, actor_is_root boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  root_allowed boolean := false;
begin
  if caller_id is null or not (select private.can_manage_personnel()) then
    raise exception 'PERSONNEL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  root_allowed := (select private.is_root_administrator());
  if require_root and not root_allowed then
    raise exception 'ROOT_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = target_user_id for update;
  if not found then raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002'; end if;
  if not root_allowed and (target_user_id = caller_id
    or (select private.is_current_admin(target_user_id))
    or (select private.is_protected_security_principal(target_user_id))) then
    raise exception 'ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT' using errcode = '42501';
  end if;
  return query select caller_id, root_allowed;
end;
$$;

create or replace function public.begin_personnel_password_reset(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor record;
begin
  select * into actor from private.assert_personnel_password_target(target_user_id, false);
  if not exists (
    select 1 from auth.users
    where id = target_user_id
      and (raw_app_meta_data ->> 'provider' = 'email' or raw_app_meta_data -> 'providers' ? 'email')
      and encrypted_password is not null
  ) then raise exception 'PASSWORD_RESET_NOT_AVAILABLE' using errcode = '22023'; end if;
  update public.profiles set must_change_password = true,
    must_change_password_hash = (select md5(encrypted_password) from auth.users where id = target_user_id)
  where id = target_user_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (actor.actor_id, 'password_reset', 'profile', target_user_id,
    jsonb_build_object('result', 'pending_auth_update', 'actor_authority', case when actor.actor_is_root then 'root_administrator' else 'personnel_manager' end));
end; $$;

create or replace function public.record_personnel_password_operation(target_user_id uuid, target_action text, target_result text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor record;
begin
  if target_action not in ('password_reset', 'password_changed_by_root')
    or target_result not in ('auth_update_succeeded', 'auth_update_failed', 'root_password_changed') then
    raise exception 'INVALID_PASSWORD_AUDIT_OPERATION' using errcode = '22023';
  end if;
  select * into actor from private.assert_personnel_password_target(target_user_id, target_action = 'password_changed_by_root');
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (actor.actor_id, target_action, 'profile', target_user_id,
    jsonb_build_object('result', target_result, 'actor_authority', case when actor.actor_is_root then 'root_administrator' else 'personnel_manager' end));
end; $$;

create or replace function public.clear_own_must_change_password(target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); profile_row public.profiles%rowtype;
begin
  if caller_id is null or target_reason not in ('password_changed', 'password_recovered') then
    raise exception 'INVALID_PASSWORD_CHANGE_COMPLETION' using errcode = '22023';
  end if;
  select * into profile_row from public.profiles where id = caller_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002'; end if;
  if not profile_row.must_change_password then return; end if;
  if profile_row.must_change_password_hash is null
    or profile_row.must_change_password_hash is not distinct from (select md5(encrypted_password) from auth.users where id = caller_id) then
    raise exception 'PASSWORD_CHANGE_NOT_COMPLETED' using errcode = '22023';
  end if;
  update public.profiles set must_change_password = false, must_change_password_hash = null
  where id = caller_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (caller_id, 'password_change_completed', 'profile', caller_id, jsonb_build_object('reason', target_reason));
end; $$;

create or replace function public.reserve_personnel_password_change(target_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor record;
begin
  select * into actor from private.assert_personnel_password_target(target_user_id, true);
  if not exists (
    select 1 from auth.users
    where id = target_user_id
      and (raw_app_meta_data ->> 'provider' = 'email' or raw_app_meta_data -> 'providers' ? 'email')
      and encrypted_password is not null
  ) then raise exception 'PASSWORD_CHANGE_NOT_AVAILABLE' using errcode = '22023'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (actor.actor_id, 'password_changed_by_root', 'profile', target_user_id,
    jsonb_build_object('result', 'pending_auth_update', 'actor_authority', 'root_administrator'));
end; $$;

create or replace function private.protect_catalog_type_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'rooms' and new.room_type_id is distinct from old.room_type_id and (
    exists (select 1 from public.class_schedules where room_id = old.id)
    or exists (select 1 from public.basic_medical_registrations where room_id = old.id)
    or exists (select 1 from public.basic_medical_room_inventory where room_id = old.id)
  ) then raise exception 'ROOM_TYPE_CHANGE_HAS_HISTORY' using errcode = '23503'; end if;
  if tg_table_name = 'courses' and new.room_type_id is distinct from old.room_type_id and (
    exists (select 1 from public.class_schedules where course_id = old.id)
    or exists (select 1 from public.basic_medical_registrations where course_id = old.id)
  ) then raise exception 'COURSE_TYPE_CHANGE_HAS_HISTORY' using errcode = '23503'; end if;
  return new;
end; $$;

drop trigger if exists rooms_protect_type_history on public.rooms;
create trigger rooms_protect_type_history before update of room_type_id on public.rooms for each row execute function private.protect_catalog_type_history();
drop trigger if exists courses_protect_type_history on public.courses;
create trigger courses_protect_type_history before update of room_type_id on public.courses for each row execute function private.protect_catalog_type_history();

create or replace function private.assert_catalog_batch_ids(target_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_admin()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if target_ids is null or cardinality(target_ids) < 1 or cardinality(target_ids) > 200
    or cardinality(target_ids) <> (select count(distinct value) from unnest(target_ids) value) then
    raise exception 'INVALID_CATALOG_BATCH_IDS' using errcode = '22023';
  end if;
end; $$;

create or replace function public.set_catalog_rooms_active(target_ids uuid[], target_is_active boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer;
begin
  perform private.assert_catalog_batch_ids(target_ids);
  perform 1 from public.rooms where id = any(target_ids) for update;
  if (select count(*) from public.rooms where id = any(target_ids)) <> cardinality(target_ids) then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.rooms set is_active = target_is_active where id = any(target_ids) and is_active is distinct from target_is_active;
  get diagnostics changed_count = row_count; return changed_count;
end; $$;

create or replace function public.set_catalog_courses_active(target_ids uuid[], target_is_active boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare changed_count integer;
begin
  perform private.assert_catalog_batch_ids(target_ids);
  perform 1 from public.courses where id = any(target_ids) for update;
  if (select count(*) from public.courses where id = any(target_ids)) <> cardinality(target_ids) then raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.courses set is_active = target_is_active where id = any(target_ids) and is_active is distinct from target_is_active;
  get diagnostics changed_count = row_count; return changed_count;
end; $$;

create or replace function public.update_catalog_room(target_id uuid, target_room_code text, target_building_code text, target_room_name text, target_capacity integer, target_room_type_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_room public.rooms%rowtype;
begin
  perform private.assert_catalog_batch_ids(array[target_id]);
  select * into current_room from public.rooms where id = target_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if nullif(btrim(target_room_code), '') is null or nullif(btrim(target_building_code), '') is null or target_capacity is not null and target_capacity < 0 then raise exception 'INVALID_ROOM_VALUES' using errcode = '22023'; end if;
  if not exists (select 1 from public.room_types where id = target_room_type_id and is_active) then raise exception 'INVALID_ROOM_TYPE' using errcode = '22023'; end if;
  if current_room.room_type_id is distinct from target_room_type_id and (
    exists (select 1 from public.class_schedules where room_id = target_id)
    or exists (select 1 from public.basic_medical_registrations where room_id = target_id)
    or exists (select 1 from public.basic_medical_room_inventory where room_id = target_id)
  ) then raise exception 'ROOM_TYPE_CHANGE_HAS_HISTORY' using errcode = '23503'; end if;
  update public.rooms set room_code = btrim(target_room_code), building_code = btrim(target_building_code), room_name = nullif(btrim(target_room_name), ''), capacity = target_capacity, room_type_id = target_room_type_id where id = target_id;
end; $$;

create or replace function public.update_catalog_course(target_id uuid, target_course_code text, target_course_name text, target_room_type_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_course public.courses%rowtype;
begin
  perform private.assert_catalog_batch_ids(array[target_id]);
  select * into current_course from public.courses where id = target_id for update;
  if not found then raise exception 'COURSE_NOT_FOUND' using errcode = 'P0002'; end if;
  if nullif(btrim(target_course_code), '') is null or nullif(btrim(target_course_name), '') is null then raise exception 'INVALID_COURSE_VALUES' using errcode = '22023'; end if;
  if not exists (select 1 from public.room_types where id = target_room_type_id and is_active) then raise exception 'INVALID_ROOM_TYPE' using errcode = '22023'; end if;
  if current_course.room_type_id is distinct from target_room_type_id and (
    exists (select 1 from public.class_schedules where course_id = target_id)
    or exists (select 1 from public.basic_medical_registrations where course_id = target_id)
  ) then raise exception 'COURSE_TYPE_CHANGE_HAS_HISTORY' using errcode = '23503'; end if;
  update public.courses set course_code = btrim(target_course_code), course_name = btrim(target_course_name), room_type_id = target_room_type_id where id = target_id;
end; $$;

create or replace function public.apply_catalog_course_import(target_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; changed_count integer := 0; target_id uuid;
begin
  if not (select private.is_admin()) or jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) < 1 or jsonb_array_length(target_rows) > 5000 then raise exception 'INVALID_CATALOG_IMPORT' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(target_rows) as rows(row_json)
    left join public.room_types types on types.id = (rows.row_json->>'room_type_id')::uuid
    where nullif(btrim(rows.row_json->>'course_code'), '') is null
      or nullif(btrim(rows.row_json->>'course_name'), '') is null
      or types.id is null or not types.is_active
  ) or (select count(*) from (select lower(btrim(rows.row_json->>'course_code')) from jsonb_array_elements(target_rows) rows(row_json) group by 1 having count(*) > 1) duplicates) > 0 then
    raise exception 'INVALID_CATALOG_IMPORT' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(target_rows) loop
    target_id := nullif(item->>'id', '')::uuid;
    if target_id is null then
      insert into public.courses(course_code, course_name, room_type_id) values (btrim(item->>'course_code'), btrim(item->>'course_name'), (item->>'room_type_id')::uuid);
    else
      perform public.update_catalog_course(target_id, item->>'course_code', item->>'course_name', (item->>'room_type_id')::uuid);
    end if;
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end; $$;

create or replace function public.apply_catalog_room_import(target_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; changed_count integer := 0; target_id uuid;
begin
  if not (select private.is_admin()) or jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) < 1 or jsonb_array_length(target_rows) > 5000 then raise exception 'INVALID_CATALOG_IMPORT' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(target_rows) as rows(row_json)
    left join public.room_types types on types.id = (rows.row_json->>'room_type_id')::uuid
    where nullif(btrim(rows.row_json->>'room_code'), '') is null
      or nullif(btrim(rows.row_json->>'building_code'), '') is null
      or types.id is null or not types.is_active
  ) or (select count(*) from (select lower(btrim(rows.row_json->>'room_code')), lower(btrim(rows.row_json->>'building_code')) from jsonb_array_elements(target_rows) rows(row_json) group by 1, 2 having count(*) > 1) duplicates) > 0 then
    raise exception 'INVALID_CATALOG_IMPORT' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(target_rows) loop
    target_id := nullif(item->>'id', '')::uuid;
    if target_id is null then
      insert into public.rooms(room_code, building_code, room_name, room_type_id, capacity) values (btrim(item->>'room_code'), btrim(item->>'building_code'), nullif(btrim(item->>'room_name'), ''), (item->>'room_type_id')::uuid, nullif(item->>'capacity', '')::integer);
    else
      perform public.update_catalog_room(target_id, item->>'room_code', item->>'building_code', coalesce(item->>'room_name',''), nullif(item->>'capacity','')::integer, (item->>'room_type_id')::uuid);
    end if;
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end; $$;

create or replace function public.update_catalog_rooms_batch(target_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; changed_count integer := 0; begin
  if jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) < 1 or jsonb_array_length(target_rows) > 200 then raise exception 'INVALID_CATALOG_BATCH' using errcode = '22023'; end if;
  if not (select private.is_admin())
    or (select count(*) from (select rows.row_json->>'id' from jsonb_array_elements(target_rows) rows(row_json) group by 1 having count(*) > 1) duplicates) > 0
    or exists (select 1 from jsonb_array_elements(target_rows) rows(row_json) left join public.rooms rooms on rooms.id = (rows.row_json->>'id')::uuid left join public.room_types types on types.id = (rows.row_json->>'room_type_id')::uuid where rooms.id is null or types.id is null or not types.is_active or nullif(btrim(rows.row_json->>'room_code'), '') is null or nullif(btrim(rows.row_json->>'building_code'), '') is null)
  then raise exception 'INVALID_CATALOG_BATCH' using errcode = '22023'; end if;
  perform 1 from public.rooms where id in (select (rows.row_json->>'id')::uuid from jsonb_array_elements(target_rows) rows(row_json)) order by id for update;
  for item in select value from jsonb_array_elements(target_rows) loop
    perform public.update_catalog_room((item->>'id')::uuid, item->>'room_code', item->>'building_code', coalesce(item->>'room_name',''), nullif(item->>'capacity','')::integer, (item->>'room_type_id')::uuid);
    changed_count := changed_count + 1;
  end loop; return changed_count;
end; $$;

create or replace function public.update_catalog_courses_batch(target_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; changed_count integer := 0; begin
  if jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) < 1 or jsonb_array_length(target_rows) > 200 then raise exception 'INVALID_CATALOG_BATCH' using errcode = '22023'; end if;
  if not (select private.is_admin())
    or (select count(*) from (select rows.row_json->>'id' from jsonb_array_elements(target_rows) rows(row_json) group by 1 having count(*) > 1) duplicates) > 0
    or exists (select 1 from jsonb_array_elements(target_rows) rows(row_json) left join public.courses courses on courses.id = (rows.row_json->>'id')::uuid left join public.room_types types on types.id = (rows.row_json->>'room_type_id')::uuid where courses.id is null or types.id is null or not types.is_active or nullif(btrim(rows.row_json->>'course_code'), '') is null or nullif(btrim(rows.row_json->>'course_name'), '') is null)
  then raise exception 'INVALID_CATALOG_BATCH' using errcode = '22023'; end if;
  perform 1 from public.courses where id in (select (rows.row_json->>'id')::uuid from jsonb_array_elements(target_rows) rows(row_json)) order by id for update;
  for item in select value from jsonb_array_elements(target_rows) loop
    perform public.update_catalog_course((item->>'id')::uuid, item->>'course_code', item->>'course_name', (item->>'room_type_id')::uuid);
    changed_count := changed_count + 1;
  end loop; return changed_count;
end; $$;

revoke all on function private.assert_personnel_password_target(uuid, boolean) from public, anon, authenticated;
revoke all on function private.assert_catalog_batch_ids(uuid[]) from public, anon, authenticated;
revoke all on function private.protect_catalog_type_history() from public, anon, authenticated;
revoke all on function public.begin_personnel_password_reset(uuid) from public, anon;
revoke all on function public.record_personnel_password_operation(uuid, text, text) from public, anon;
revoke all on function public.clear_own_must_change_password(text) from public, anon;
revoke all on function public.reserve_personnel_password_change(uuid) from public, anon;
revoke all on function public.set_catalog_rooms_active(uuid[], boolean) from public, anon;
revoke all on function public.set_catalog_courses_active(uuid[], boolean) from public, anon;
revoke all on function public.update_catalog_room(uuid, text, text, text, integer, uuid) from public, anon;
revoke all on function public.update_catalog_course(uuid, text, text, uuid) from public, anon;
revoke all on function public.apply_catalog_course_import(jsonb), public.apply_catalog_room_import(jsonb) from public, anon;
revoke all on function public.update_catalog_rooms_batch(jsonb), public.update_catalog_courses_batch(jsonb) from public, anon;
grant execute on function public.begin_personnel_password_reset(uuid), public.record_personnel_password_operation(uuid, text, text), public.reserve_personnel_password_change(uuid), public.clear_own_must_change_password(text), public.set_catalog_rooms_active(uuid[], boolean), public.set_catalog_courses_active(uuid[], boolean), public.update_catalog_room(uuid, text, text, text, integer, uuid), public.update_catalog_course(uuid, text, text, uuid), public.apply_catalog_course_import(jsonb), public.apply_catalog_room_import(jsonb), public.update_catalog_rooms_batch(jsonb), public.update_catalog_courses_batch(jsonb) to authenticated;
