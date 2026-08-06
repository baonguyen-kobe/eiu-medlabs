-- Fourth safe-review follow-up: personnel roles, import capability and atomic admin editing.

create or replace function private.prevent_deprecated_importer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

create or replace function public.admin_update_personnel(
  target_profile_id uuid,
  target_email text,
  target_full_name text,
  target_phone text,
  target_title text,
  target_roles public.app_role[],
  target_can_import_schedules boolean,
  target_room_type_ids uuid[],
  target_email_room_type_ids uuid[],
  target_allow_basic_medical_access boolean,
  target_is_active boolean,
  target_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_profile public.profiles;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_name text := btrim(coalesce(target_full_name, ''));
  normalized_phone text := nullif(btrim(coalesce(target_phone, '')), '');
  normalized_title text := nullif(btrim(coalesce(target_title, '')), '');
  normalized_roles public.app_role[];
  normalized_scopes uuid[];
  normalized_email_scopes uuid[];
  active_admin_count integer;
begin
  if actor_id is null or not (select private.has_role('admin')) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select profiles.* into current_profile
  from public.profiles profiles
  where profiles.id = target_profile_id
  for update;
  if current_profile.id is null then
    raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_profile.access_version <> target_expected_version then
    raise exception 'PERSONNEL_CHANGED_RELOAD_REQUIRED' using errcode = 'P0001';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_PERSONNEL_EMAIL' using errcode = '22023';
  end if;
  if normalized_name = '' then
    raise exception 'INVALID_PERSONNEL_NAME' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct role_value order by role_value), '{}'::public.app_role[])
  into normalized_roles
  from unnest(coalesce(target_roles, '{}'::public.app_role[])) role_values(role_value);
  if cardinality(normalized_roles) = 0 then
    raise exception 'MAIN_ROLE_REQUIRED' using errcode = '22023';
  end if;
  if 'importer'::public.app_role = any(normalized_roles) then
    raise exception 'DEPRECATED_IMPORTER_ROLE' using errcode = '22023';
  end if;
  if 'viewer'::public.app_role = any(normalized_roles) and cardinality(normalized_roles) <> 1 then
    raise exception 'VIEWER_ROLE_MUST_BE_EXCLUSIVE' using errcode = '22023';
  end if;
  if target_can_import_schedules and not (
    'staff'::public.app_role = any(normalized_roles)
    or 'lecturer'::public.app_role = any(normalized_roles)
    or 'teaching_assistant'::public.app_role = any(normalized_roles)
  ) then
    raise exception 'IMPORT_PERMISSION_ROLE_REQUIRED' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct scope_id order by scope_id), '{}'::uuid[])
  into normalized_scopes
  from unnest(coalesce(target_room_type_ids, '{}'::uuid[])) scope_values(scope_id);
  select coalesce(array_agg(distinct scope_id order by scope_id), '{}'::uuid[])
  into normalized_email_scopes
  from unnest(coalesce(target_email_room_type_ids, '{}'::uuid[])) scope_values(scope_id);
  if cardinality(normalized_scopes) = 0 then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_scopes) requested(id)
    where not exists (select 1 from public.room_types room_types where room_types.id = requested.id and room_types.is_active)
  ) then
    raise exception 'INVALID_ROOM_TYPE_SCOPE' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_email_scopes) requested(id)
    where requested.id <> all(normalized_scopes)
  ) then
    raise exception 'EMAIL_SCOPE_MUST_BE_ASSIGNED' using errcode = '22023';
  end if;
  if cardinality(normalized_email_scopes) > 0 and not ('viewer'::public.app_role = any(normalized_roles)) then
    raise exception 'EMAIL_SCOPE_VIEWER_ONLY' using errcode = '22023';
  end if;
  if target_allow_basic_medical_access and not (
    ('lecturer'::public.app_role = any(normalized_roles) or 'teaching_assistant'::public.app_role = any(normalized_roles))
    and '40000000-0000-0000-0000-000000000002'::uuid = any(normalized_scopes)
  ) then
    raise exception 'BASIC_MEDICAL_PERMISSION_INVALID' using errcode = '22023';
  end if;

  if target_profile_id = actor_id and not target_is_active then
    raise exception 'CANNOT_LOCK_CURRENT_ADMIN' using errcode = '42501';
  end if;
  if target_profile_id = actor_id and not ('admin'::public.app_role = any(normalized_roles)) then
    raise exception 'CANNOT_REMOVE_CURRENT_ADMIN' using errcode = '42501';
  end if;
  if (not target_is_active or not ('admin'::public.app_role = any(normalized_roles)))
    and exists (select 1 from public.user_roles roles where roles.user_id = target_profile_id and roles.role = 'admin') then
    select count(*) into active_admin_count
    from public.profiles profiles
    where profiles.is_active and profiles.id <> target_profile_id
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'admin');
    if active_admin_count = 0 then
      raise exception 'LAST_ACTIVE_ADMIN_REQUIRED' using errcode = '42501';
    end if;
  end if;
  if exists (
    select 1 from public.profiles profiles
    where profiles.id <> target_profile_id and lower(profiles.email) = normalized_email
  ) then
    raise exception 'PERSONNEL_EMAIL_EXISTS' using errcode = '23505';
  end if;
  if normalized_phone is not null and exists (
    select 1 from public.profiles profiles
    where profiles.id <> target_profile_id
      and regexp_replace(coalesce(profiles.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(normalized_phone, '[^0-9]+', '', 'g')
      and regexp_replace(normalized_phone, '[^0-9]+', '', 'g') <> ''
  ) then
    raise exception 'PERSONNEL_PHONE_EXISTS' using errcode = '23505';
  end if;

  update public.profiles
  set email = normalized_email,
      full_name = normalized_name,
      phone = normalized_phone,
      title = normalized_title,
      can_import_schedules = coalesce(target_can_import_schedules, false),
      allow_basic_medical_access = coalesce(target_allow_basic_medical_access, false),
      is_active = coalesce(target_is_active, false),
      access_version = access_version + 1
  where id = target_profile_id;

  delete from public.user_roles where user_id = target_profile_id;
  insert into public.user_roles (user_id, role, created_by)
  select target_profile_id, role_value, actor_id from unnest(normalized_roles) role_values(role_value);

  delete from public.profile_room_types where profile_id = target_profile_id;
  insert into public.profile_room_types (
    profile_id, room_type_id, receive_schedule_emails, created_by
  )
  select target_profile_id, scope_id, scope_id = any(normalized_email_scopes), actor_id
  from unnest(normalized_scopes) scopes(scope_id);

  return jsonb_build_object(
    'id', target_profile_id,
    'email', normalized_email,
    'full_name', normalized_name,
    'phone', normalized_phone,
    'title', normalized_title,
    'roles', to_jsonb(normalized_roles),
    'can_import_schedules', coalesce(target_can_import_schedules, false),
    'room_type_ids', to_jsonb(normalized_scopes),
    'email_room_type_ids', to_jsonb(normalized_email_scopes),
    'allow_basic_medical_access', coalesce(target_allow_basic_medical_access, false),
    'is_active', coalesce(target_is_active, false),
    'access_version', current_profile.access_version + 1
  );
end;
$$;

revoke all on function public.admin_update_personnel(
  uuid, text, text, text, text, public.app_role[], boolean, uuid[], uuid[], boolean, boolean, integer
) from public, anon;
grant execute on function public.admin_update_personnel(
  uuid, text, text, text, text, public.app_role[], boolean, uuid[], uuid[], boolean, boolean, integer
) to authenticated;

create or replace function public.admin_list_personnel(
  target_query text default null,
  target_role text default null,
  target_import_permission text default 'all',
  target_status text default 'all',
  target_page integer default 1,
  target_page_size integer default 50
)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  title text,
  is_active boolean,
  can_import_schedules boolean,
  allow_basic_medical_access boolean,
  access_version integer,
  roles public.app_role[],
  room_type_ids uuid[],
  email_room_type_ids uuid[],
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  normalized_query text := lower(btrim(coalesce(target_query, '')));
  normalized_role text := nullif(lower(btrim(coalesce(target_role, ''))), '');
  normalized_import text := lower(btrim(coalesce(target_import_permission, 'all')));
  normalized_status text := lower(btrim(coalesce(target_status, 'all')));
  safe_page integer := greatest(coalesce(target_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(target_page_size, 50), 1), 50);
begin
  if not (select private.has_role('admin')) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if normalized_role = 'all' then normalized_role := null; end if;
  if normalized_role is not null and normalized_role not in ('admin','staff','lecturer','teaching_assistant','viewer') then
    raise exception 'INVALID_ROLE_FILTER' using errcode = '22023';
  end if;
  if normalized_import not in ('all','enabled','disabled') or normalized_status not in ('all','active','inactive') then
    raise exception 'INVALID_PERSONNEL_FILTER' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select profiles.*
    from public.profiles profiles
    where exists (
      select 1 from public.user_roles any_role
      where any_role.user_id = profiles.id and any_role.role <> 'importer'
    )
      and (
        normalized_query = ''
        or lower(extensions.unaccent(profiles.full_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(profiles.email) like '%' || normalized_query || '%'
        or lower(coalesce(profiles.phone, '')) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(coalesce(profiles.title, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
      )
      and (normalized_role is null or exists (
        select 1 from public.user_roles role_filter
        where role_filter.user_id = profiles.id and role_filter.role::text = normalized_role
      ))
      and (normalized_import = 'all'
        or (normalized_import = 'enabled' and profiles.can_import_schedules)
        or (normalized_import = 'disabled' and not profiles.can_import_schedules))
      and (normalized_status = 'all'
        or (normalized_status = 'active' and profiles.is_active)
        or (normalized_status = 'inactive' and not profiles.is_active))
  ), paged as (
    select filtered.*, count(*) over() as filtered_count
    from filtered
    order by filtered.full_name, filtered.id
    limit safe_page_size offset (safe_page - 1) * safe_page_size
  )
  select paged.id, paged.email, paged.full_name, paged.phone, paged.title,
    paged.is_active, paged.can_import_schedules,
    paged.allow_basic_medical_access, paged.access_version,
    coalesce((select array_agg(user_roles.role order by user_roles.role) from public.user_roles where user_roles.user_id = paged.id and user_roles.role <> 'importer'), '{}'::public.app_role[]),
    coalesce((select array_agg(scopes.room_type_id order by scopes.room_type_id) from public.profile_room_types scopes where scopes.profile_id = paged.id), '{}'::uuid[]),
    coalesce((select array_agg(scopes.room_type_id order by scopes.room_type_id) from public.profile_room_types scopes where scopes.profile_id = paged.id and scopes.receive_schedule_emails), '{}'::uuid[]),
    paged.filtered_count
  from paged;

  raise log 'personnel.list.total_ms=%', extract(milliseconds from clock_timestamp() - started_at)::integer;
end;
$$;

revoke all on function public.admin_list_personnel(text,text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_personnel(text,text,text,text,integer,integer) to authenticated;
