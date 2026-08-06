create table if not exists public.system_security_principals (
  singleton boolean primary key default true check (singleton),
  root_admin_id uuid not null unique references public.profiles(id) on delete restrict,
  personnel_manager_id uuid not null unique references public.profiles(id) on delete restrict,
  configured_at timestamptz not null default now(),
  configured_by uuid references public.profiles(id) on delete set null,
  constraint security_principals_distinct_accounts check (root_admin_id <> personnel_manager_id)
);

alter table public.system_security_principals enable row level security;
revoke all on public.system_security_principals from public, anon, authenticated;
grant select, insert, update on public.system_security_principals to service_role;

create or replace function private.validate_security_principals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'admin'
    where p.id = new.root_admin_id and p.is_active
  ) then
    raise exception 'ROOT_ADMIN_MUST_BE_ACTIVE_ADMIN' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id and r.role = 'admin'
    where p.id = new.personnel_manager_id and p.is_active
  ) then
    raise exception 'PERSONNEL_MANAGER_MUST_BE_ACTIVE_ADMIN' using errcode = '23514';
  end if;
  new.configured_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists system_security_principals_validate on public.system_security_principals;
create trigger system_security_principals_validate
before insert or update on public.system_security_principals
for each row execute function private.validate_security_principals();

create or replace function private.is_root_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.system_security_principals principals
    join public.profiles profiles on profiles.id = principals.root_admin_id
    join public.user_roles roles on roles.user_id = profiles.id and roles.role = 'admin'
    where principals.singleton and profiles.is_active
      and profiles.id = (select auth.uid())
  );
$$;

create or replace function private.is_secondary_personnel_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.system_security_principals principals
    join public.profiles profiles on profiles.id = principals.personnel_manager_id
    join public.user_roles roles on roles.user_id = profiles.id and roles.role = 'admin'
    where principals.singleton and profiles.is_active
      and profiles.id = (select auth.uid())
  );
$$;

create or replace function private.can_manage_personnel()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_root_administrator())
    or (select private.is_secondary_personnel_manager());
$$;

create or replace function private.is_protected_security_principal(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.system_security_principals principals
    where principals.singleton
      and target_profile_id in (principals.root_admin_id, principals.personnel_manager_id)
  );
$$;

create or replace function private.is_current_admin(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles roles
    where roles.user_id = target_profile_id and roles.role = 'admin'
  );
$$;

revoke execute on function private.validate_security_principals() from public, anon, authenticated;
revoke execute on function private.is_root_administrator() from public, anon, authenticated;
revoke execute on function private.is_secondary_personnel_manager() from public, anon, authenticated;
revoke execute on function private.can_manage_personnel() from public, anon, authenticated;
revoke execute on function private.is_protected_security_principal(uuid) from public, anon, authenticated;
revoke execute on function private.is_current_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_root_administrator() to authenticated;
grant execute on function private.can_manage_personnel() to authenticated;

create or replace function private.protect_root_administrator_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.system_security_principals principals
    where principals.singleton and principals.root_admin_id = old.id
  ) and (tg_op = 'DELETE' or not new.is_active) then
    raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists profiles_protect_root_administrator on public.profiles;
create trigger profiles_protect_root_administrator
before update of is_active or delete on public.profiles
for each row execute function private.protect_root_administrator_profile();

create or replace function private.protect_root_administrator_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and exists (
    select 1 from public.system_security_principals principals
    where principals.singleton and principals.root_admin_id = old.user_id
  ) and (tg_op = 'DELETE' or new.role <> 'admin' or new.user_id <> old.user_id) then
    raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists user_roles_protect_root_administrator on public.user_roles;
create trigger user_roles_protect_root_administrator
before update or delete on public.user_roles
for each row execute function private.protect_root_administrator_role();

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_personnel_manager_select on public.profiles
for select to authenticated
using ((select private.can_manage_personnel()));

drop policy if exists user_roles_admin_all on public.user_roles;
create policy user_roles_personnel_manager_select on public.user_roles
for select to authenticated
using ((select private.can_manage_personnel()));

drop policy if exists profile_room_types_admin_all on public.profile_room_types;
create policy profile_room_types_personnel_manager_select on public.profile_room_types
for select to authenticated
using ((select private.can_manage_personnel()));

drop policy if exists personnel_auth_reconciliation_admin_select on public.personnel_auth_reconciliation_logs;
create policy personnel_auth_reconciliation_root_select
on public.personnel_auth_reconciliation_logs
for select to authenticated
using ((select private.is_root_administrator()));

create or replace function public.get_personnel_authority_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'configured', exists (select 1 from public.system_security_principals where singleton),
    'can_manage_personnel', (select private.can_manage_personnel()),
    'is_root_administrator', (select private.is_root_administrator()),
    'is_secondary_personnel_manager', (select private.is_secondary_personnel_manager())
  );
$$;

revoke all on function public.get_personnel_authority_context() from public, anon;
grant execute on function public.get_personnel_authority_context() to authenticated;

drop function if exists public.admin_update_personnel(
  uuid, text, text, text, text, public.app_role[], boolean, uuid[], uuid[], boolean, boolean, integer
);

create function public.admin_update_personnel(
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
  actor_is_root boolean;
  current_profile public.profiles%rowtype;
  target_was_admin boolean;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_name text := btrim(coalesce(target_full_name, ''));
  normalized_phone text := nullif(btrim(coalesce(target_phone, '')), '');
  normalized_title text := nullif(btrim(coalesce(target_title, '')), '');
  normalized_roles public.app_role[];
  normalized_scopes uuid[];
  normalized_email_scopes uuid[];
  old_roles public.app_role[];
begin
  if not exists (select 1 from public.system_security_principals where singleton for share) then
    raise exception 'PERSONNEL_SECURITY_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if not (select private.can_manage_personnel()) then
    raise exception 'PERSONNEL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if target_expected_version is null or target_expected_version < 1 then
    raise exception 'INVALID_PERSONNEL_VERSION' using errcode = '22023';
  end if;
  if target_is_active is null or target_can_import_schedules is null
    or target_allow_basic_medical_access is null then
    raise exception 'PERSONNEL_BOOLEAN_REQUIRED' using errcode = '22023';
  end if;

  select * into current_profile from public.profiles
  where id = target_profile_id for update;
  if current_profile.id is null then
    raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_profile.access_version <> target_expected_version then
    raise exception 'PERSONNEL_CHANGED_RELOAD_REQUIRED' using errcode = 'P0001';
  end if;

  actor_is_root := (select private.is_root_administrator());
  target_was_admin := (select private.is_current_admin(target_profile_id));
  if target_profile_id = actor_id then
    raise exception 'CANNOT_MANAGE_OWN_SECURITY' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.system_security_principals principals
    where principals.singleton and principals.root_admin_id = target_profile_id
  ) then
    raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE' using errcode = '42501';
  end if;
  if target_was_admin and not actor_is_root then
    raise exception 'ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT' using errcode = '42501';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_PERSONNEL_EMAIL' using errcode = '22023';
  end if;
  if normalized_name = '' then
    raise exception 'INVALID_PERSONNEL_NAME' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct role_value order by role_value), '{}'::public.app_role[])
  into normalized_roles from unnest(coalesce(target_roles, '{}'::public.app_role[])) values_(role_value);
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
  into normalized_scopes from unnest(coalesce(target_room_type_ids, '{}'::uuid[])) values_(scope_id);
  select coalesce(array_agg(distinct scope_id order by scope_id), '{}'::uuid[])
  into normalized_email_scopes from unnest(coalesce(target_email_room_type_ids, '{}'::uuid[])) values_(scope_id);
  if cardinality(normalized_scopes) = 0 then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(normalized_scopes) requested(id)
    where not exists (select 1 from public.room_types room_types where room_types.id = requested.id and room_types.is_active)
  ) then
    raise exception 'INVALID_ROOM_TYPE_SCOPE' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(normalized_email_scopes) requested(id) where requested.id <> all(normalized_scopes)) then
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
  if exists (select 1 from public.profiles p where p.id <> target_profile_id and lower(p.email) = normalized_email) then
    raise exception 'PERSONNEL_EMAIL_EXISTS' using errcode = '23505';
  end if;
  if normalized_phone is not null and exists (
    select 1 from public.profiles p where p.id <> target_profile_id
      and regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(normalized_phone, '[^0-9]+', '', 'g')
      and regexp_replace(normalized_phone, '[^0-9]+', '', 'g') <> ''
  ) then
    raise exception 'PERSONNEL_PHONE_EXISTS' using errcode = '23505';
  end if;

  select coalesce(array_agg(role order by role), '{}'::public.app_role[])
  into old_roles from public.user_roles where user_id = target_profile_id;

  update public.profiles set
    email = normalized_email, full_name = normalized_name, phone = normalized_phone,
    title = normalized_title, can_import_schedules = target_can_import_schedules,
    allow_basic_medical_access = target_allow_basic_medical_access,
    is_active = target_is_active, access_version = access_version + 1
  where id = target_profile_id;

  delete from public.user_roles where user_id = target_profile_id;
  insert into public.user_roles (user_id, role, created_by)
  select target_profile_id, role_value, actor_id from unnest(normalized_roles) values_(role_value);
  delete from public.profile_room_types where profile_id = target_profile_id;
  insert into public.profile_room_types (profile_id, room_type_id, receive_schedule_emails, created_by)
  select target_profile_id, scope_id, scope_id = any(normalized_email_scopes), actor_id
  from unnest(normalized_scopes) values_(scope_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    actor_id,
    case
      when cardinality(old_roles) = 0 then 'personnel.created'
      when not target_was_admin and 'admin'::public.app_role = any(normalized_roles) then 'personnel.promoted_to_admin'
      when target_was_admin and not ('admin'::public.app_role = any(normalized_roles)) then 'personnel.admin_role_removed'
      when current_profile.is_active and not target_is_active then 'personnel.locked'
      when not current_profile.is_active and target_is_active then 'personnel.unlocked'
      else 'personnel.updated'
    end,
    'profile', target_profile_id,
    jsonb_build_object('roles', old_roles, 'is_active', current_profile.is_active, 'version', current_profile.access_version),
    jsonb_build_object('roles', normalized_roles, 'is_active', target_is_active, 'version', current_profile.access_version + 1),
    jsonb_build_object('actor_authority', case when actor_is_root then 'root_administrator' else 'personnel_manager' end)
  );

  return jsonb_build_object(
    'id', target_profile_id, 'email', normalized_email, 'full_name', normalized_name,
    'phone', normalized_phone, 'title', normalized_title, 'roles', to_jsonb(normalized_roles),
    'can_import_schedules', target_can_import_schedules, 'room_type_ids', to_jsonb(normalized_scopes),
    'email_room_type_ids', to_jsonb(normalized_email_scopes),
    'allow_basic_medical_access', target_allow_basic_medical_access,
    'is_active', target_is_active, 'access_version', current_profile.access_version + 1,
    'is_root_administrator', false,
    'is_security_principal', exists (
      select 1 from public.system_security_principals p where p.singleton and p.personnel_manager_id = target_profile_id
    ),
    'is_current_admin', 'admin'::public.app_role = any(normalized_roles),
    'can_edit_security', actor_is_root or not ('admin'::public.app_role = any(normalized_roles))
  );
end;
$$;

revoke all on function public.admin_update_personnel(
  uuid, text, text, text, text, public.app_role[], boolean, uuid[], uuid[], boolean, boolean, integer
) from public, anon;
grant execute on function public.admin_update_personnel(
  uuid, text, text, text, text, public.app_role[], boolean, uuid[], uuid[], boolean, boolean, integer
) to authenticated;

drop function if exists public.admin_list_personnel(text,text,text,text,integer,integer);

create function public.admin_list_personnel(
  target_query text default null,
  target_role text default null,
  target_import_permission text default 'all',
  target_status text default 'all',
  target_page integer default 1,
  target_page_size integer default 50
)
returns table (
  id uuid, email text, full_name text, phone text, title text, is_active boolean,
  can_import_schedules boolean, allow_basic_medical_access boolean, access_version integer,
  roles public.app_role[], room_type_ids uuid[], email_room_type_ids uuid[],
  is_root_administrator boolean, is_security_principal boolean,
  is_current_admin boolean, can_edit_security boolean, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_is_root boolean;
  normalized_query text := lower(btrim(coalesce(target_query, '')));
  normalized_role text := nullif(lower(btrim(coalesce(target_role, ''))), '');
  normalized_import text := lower(btrim(coalesce(target_import_permission, 'all')));
  normalized_status text := lower(btrim(coalesce(target_status, 'all')));
  safe_page integer := greatest(coalesce(target_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(target_page_size, 50), 1), 50);
begin
  if not exists (select 1 from public.system_security_principals where singleton) then
    raise exception 'PERSONNEL_SECURITY_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if not (select private.can_manage_personnel()) then
    raise exception 'PERSONNEL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  actor_is_root := (select private.is_root_administrator());
  if normalized_role = 'all' then normalized_role := null; end if;
  if normalized_role is not null and normalized_role not in ('admin','staff','lecturer','teaching_assistant','viewer') then
    raise exception 'INVALID_ROLE_FILTER' using errcode = '22023';
  end if;
  if normalized_import not in ('all','enabled','disabled') or normalized_status not in ('all','active','inactive') then
    raise exception 'INVALID_PERSONNEL_FILTER' using errcode = '22023';
  end if;

  return query
  with principals as (
    select root_admin_id, personnel_manager_id from public.system_security_principals where singleton
  ), filtered as (
    select profiles.* from public.profiles profiles
    where exists (select 1 from public.user_roles r where r.user_id = profiles.id and r.role <> 'importer')
      and (normalized_query = ''
        or lower(extensions.unaccent(profiles.full_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(profiles.email) like '%' || normalized_query || '%'
        or lower(coalesce(profiles.phone, '')) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(coalesce(profiles.title, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%')
      and (normalized_role is null or exists (
        select 1 from public.user_roles rf where rf.user_id = profiles.id and rf.role::text = normalized_role))
      and (normalized_import = 'all' or (normalized_import = 'enabled' and profiles.can_import_schedules)
        or (normalized_import = 'disabled' and not profiles.can_import_schedules))
      and (normalized_status = 'all' or (normalized_status = 'active' and profiles.is_active)
        or (normalized_status = 'inactive' and not profiles.is_active))
  ), paged as (
    select filtered.*, count(*) over() as filtered_count from filtered
    order by filtered.full_name, filtered.id
    limit safe_page_size offset (safe_page - 1) * safe_page_size
  )
  select paged.id, paged.email, paged.full_name, paged.phone, paged.title,
    paged.is_active, paged.can_import_schedules, paged.allow_basic_medical_access,
    paged.access_version,
    coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = paged.id and r.role <> 'importer'), '{}'::public.app_role[]),
    coalesce((select array_agg(s.room_type_id order by s.room_type_id) from public.profile_room_types s where s.profile_id = paged.id), '{}'::uuid[]),
    coalesce((select array_agg(s.room_type_id order by s.room_type_id) from public.profile_room_types s where s.profile_id = paged.id and s.receive_schedule_emails), '{}'::uuid[]),
    paged.id = principals.root_admin_id,
    paged.id in (principals.root_admin_id, principals.personnel_manager_id),
    exists (select 1 from public.user_roles ar where ar.user_id = paged.id and ar.role = 'admin'),
    paged.id <> (select auth.uid())
      and paged.id <> principals.root_admin_id
      and (actor_is_root or not exists (select 1 from public.user_roles ar where ar.user_id = paged.id and ar.role = 'admin')),
    paged.filtered_count
  from paged cross join principals;
end;
$$;

revoke all on function public.admin_list_personnel(text,text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_personnel(text,text,text,text,integer,integer) to authenticated;

create or replace function public.admin_apply_personnel_import(
  target_mode text,
  target_rows jsonb,
  target_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_root boolean;
  item jsonb;
  import_profile_id uuid;
  current_profile public.profiles%rowtype;
  normalized_roles public.app_role[];
  normalized_scopes uuid[];
  normalized_email_scopes uuid[];
  normalized_email text;
  normalized_name text;
  normalized_phone text;
  normalized_title text;
  requested_import boolean;
  requested_basic boolean;
  requested_active boolean;
  expected_version integer;
  applied_ids uuid[] := '{}'::uuid[];
  created_count integer := 0;
  updated_count integer := 0;
  locked_count integer := 0;
  skipped_count integer := 0;
begin
  if not exists (select 1 from public.system_security_principals where singleton for share) then
    raise exception 'PERSONNEL_SECURITY_NOT_CONFIGURED' using errcode = '42501';
  end if;
  if not (select private.can_manage_personnel()) then
    raise exception 'PERSONNEL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if target_mode not in ('new', 'all') then
    raise exception 'INVALID_PERSONNEL_IMPORT_MODE' using errcode = '22023';
  end if;
  if target_rows is null or jsonb_typeof(target_rows) <> 'array' or jsonb_array_length(target_rows) > 500 then
    raise exception 'INVALID_PERSONNEL_IMPORT_ROWS' using errcode = '22023';
  end if;
  if exists (
    select 1 from (
      select value->>'id' id_value, count(*) count_value from jsonb_array_elements(target_rows)
      group by value->>'id' having count(*) > 1
    ) duplicates
  ) then
    raise exception 'DUPLICATE_PERSONNEL_IMPORT_ID' using errcode = '22023';
  end if;
  actor_is_root := (select private.is_root_administrator());

  for item in select value from jsonb_array_elements(target_rows)
  loop
    begin
      import_profile_id := (item->>'id')::uuid;
      expected_version := (item->>'access_version')::integer;
    exception when others then
      raise exception 'INVALID_PERSONNEL_IMPORT_ID_OR_VERSION' using errcode = '22023';
    end;
    select * into current_profile from public.profiles where id = import_profile_id for update;
    if current_profile.id is null then
      raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002';
    end if;
    if (select private.is_protected_security_principal(import_profile_id))
      or (select private.is_current_admin(import_profile_id)) then
      skipped_count := skipped_count + 1;
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
      values (actor_id, 'personnel.import_skipped_protected_account', 'profile', import_profile_id,
        jsonb_build_object('actor_authority', case when actor_is_root then 'root_administrator' else 'personnel_manager' end,
          'file_name', target_file_name));
      continue;
    end if;
    if expected_version is null or expected_version < 1 then
      raise exception 'INVALID_PERSONNEL_VERSION' using errcode = '22023';
    end if;
    if current_profile.access_version <> expected_version then
      raise exception 'PERSONNEL_CHANGED_RELOAD_REQUIRED' using errcode = 'P0001';
    end if;
    if not (item ? 'is_active') or jsonb_typeof(item->'is_active') <> 'boolean'
      or not (item ? 'can_import_schedules') or jsonb_typeof(item->'can_import_schedules') <> 'boolean'
      or not (item ? 'allow_basic_medical_access') or jsonb_typeof(item->'allow_basic_medical_access') <> 'boolean' then
      raise exception 'PERSONNEL_BOOLEAN_REQUIRED' using errcode = '22023';
    end if;
    normalized_email := lower(btrim(coalesce(item->>'email', '')));
    normalized_name := btrim(coalesce(item->>'full_name', ''));
    normalized_phone := nullif(btrim(coalesce(item->>'phone', '')), '');
    normalized_title := nullif(btrim(coalesce(item->>'title', '')), '');
    requested_import := (item->>'can_import_schedules')::boolean;
    requested_basic := (item->>'allow_basic_medical_access')::boolean;
    requested_active := (item->>'is_active')::boolean;
    if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or normalized_name = '' then
      raise exception 'INVALID_PERSONNEL_IMPORT_IDENTITY' using errcode = '22023';
    end if;
    begin
      select coalesce(array_agg(distinct value::public.app_role order by value::public.app_role), '{}'::public.app_role[])
      into normalized_roles from jsonb_array_elements_text(coalesce(item->'roles', '[]'::jsonb));
      select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}'::uuid[])
      into normalized_scopes from jsonb_array_elements_text(coalesce(item->'room_type_ids', '[]'::jsonb));
      select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}'::uuid[])
      into normalized_email_scopes from jsonb_array_elements_text(coalesce(item->'email_room_type_ids', '[]'::jsonb));
    exception when others then
      raise exception 'INVALID_PERSONNEL_IMPORT_ROLE_OR_SCOPE' using errcode = '22023';
    end;
    if cardinality(normalized_roles) = 0 or cardinality(normalized_scopes) = 0 then
      raise exception 'PERSONNEL_IMPORT_ROLE_SCOPE_REQUIRED' using errcode = '22023';
    end if;
    if 'importer'::public.app_role = any(normalized_roles)
      or ('viewer'::public.app_role = any(normalized_roles) and cardinality(normalized_roles) <> 1) then
      raise exception 'INVALID_PERSONNEL_IMPORT_ROLE' using errcode = '22023';
    end if;
    if requested_import and not (
      'staff'::public.app_role = any(normalized_roles) or 'lecturer'::public.app_role = any(normalized_roles)
      or 'teaching_assistant'::public.app_role = any(normalized_roles)
    ) then
      raise exception 'IMPORT_PERMISSION_ROLE_REQUIRED' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(normalized_scopes) requested(id)
      where not exists (select 1 from public.room_types rt where rt.id = requested.id and rt.is_active)
    ) then
      raise exception 'INVALID_ROOM_TYPE_SCOPE' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(normalized_email_scopes) requested(id) where requested.id <> all(normalized_scopes))
      or (cardinality(normalized_email_scopes) > 0 and not ('viewer'::public.app_role = any(normalized_roles))) then
      raise exception 'INVALID_PERSONNEL_EMAIL_SCOPE' using errcode = '22023';
    end if;
    if requested_basic and not (
      ('lecturer'::public.app_role = any(normalized_roles) or 'teaching_assistant'::public.app_role = any(normalized_roles))
      and '40000000-0000-0000-0000-000000000002'::uuid = any(normalized_scopes)
    ) then
      raise exception 'BASIC_MEDICAL_PERMISSION_INVALID' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles p where p.id <> import_profile_id and lower(p.email) = normalized_email) then
      raise exception 'PERSONNEL_EMAIL_EXISTS' using errcode = '23505';
    end if;
    if normalized_phone is not null and exists (
      select 1 from public.profiles p where p.id <> import_profile_id
      and regexp_replace(coalesce(p.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(normalized_phone, '[^0-9]+', '', 'g')
      and regexp_replace(normalized_phone, '[^0-9]+', '', 'g') <> ''
    ) then
      raise exception 'PERSONNEL_PHONE_EXISTS' using errcode = '23505';
    end if;

    update public.profiles set email = normalized_email, full_name = normalized_name,
      phone = normalized_phone, title = normalized_title, is_active = requested_active,
      can_import_schedules = requested_import, allow_basic_medical_access = requested_basic,
      access_version = access_version + 1 where id = import_profile_id;
    delete from public.user_roles where user_id = import_profile_id;
    insert into public.user_roles (user_id, role, created_by)
    select import_profile_id, value, actor_id from unnest(normalized_roles) roles(value);
    delete from public.profile_room_types scopes_existing where scopes_existing.profile_id = import_profile_id;
    insert into public.profile_room_types (profile_id, room_type_id, receive_schedule_emails, created_by)
    select import_profile_id, value, value = any(normalized_email_scopes), actor_id from unnest(normalized_scopes) scopes(value);
    applied_ids := array_append(applied_ids, import_profile_id);
    if coalesce((item->>'is_new')::boolean, false) then created_count := created_count + 1;
    else updated_count := updated_count + 1; end if;
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (actor_id, 'personnel.import_applied', 'profile', import_profile_id,
      jsonb_build_object('actor_authority', case when actor_is_root then 'root_administrator' else 'personnel_manager' end,
        'old_version', current_profile.access_version, 'new_version', current_profile.access_version + 1,
        'file_name', target_file_name));
  end loop;

  if target_mode = 'all' then
    for current_profile in
      select p.* from public.profiles p
      where not (p.id = any(applied_ids))
        and not (select private.is_protected_security_principal(p.id))
        and not (select private.is_current_admin(p.id))
      for update
    loop
      if current_profile.is_active or current_profile.can_import_schedules or current_profile.allow_basic_medical_access then
        update public.profiles set is_active = false, can_import_schedules = false,
          allow_basic_medical_access = false, access_version = access_version + 1
        where id = current_profile.id;
        locked_count := locked_count + 1;
        insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
        values (actor_id, 'personnel.locked', 'profile', current_profile.id,
          jsonb_build_object('actor_authority', case when actor_is_root then 'root_administrator' else 'personnel_manager' end,
            'source', 'personnel_import', 'file_name', target_file_name,
            'old_version', current_profile.access_version, 'new_version', current_profile.access_version + 1));
      end if;
    end loop;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, metadata)
  values (actor_id, 'personnel.import_applied', 'personnel_import',
    jsonb_build_object('actor_authority', case when actor_is_root then 'root_administrator' else 'personnel_manager' end,
      'mode', target_mode, 'file_name', target_file_name, 'created', created_count,
      'updated', updated_count, 'locked', locked_count, 'skipped_protected', skipped_count));
  return jsonb_build_object('created', created_count, 'updated', updated_count,
    'locked', locked_count, 'skipped_protected', skipped_count);
end;
$$;

revoke all on function public.admin_apply_personnel_import(text,jsonb,text) from public, anon;
grant execute on function public.admin_apply_personnel_import(text,jsonb,text) to authenticated;

create or replace function public.find_existing_import_hashes(target_hashes text[], target_room_type_id uuid)
returns table(normalized_row_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_hashes is null or cardinality(target_hashes) > 500 then
    raise exception 'INVALID_IMPORT_HASH_COUNT' using errcode = '22023';
  end if;
  if not (select private.can_import_schedules(target_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  return query
  select distinct rows.normalized_row_hash
  from public.import_rows rows
  join public.class_schedules schedules on schedules.id = rows.class_schedule_id
  join public.rooms rooms on rooms.id = schedules.room_id
  where rows.normalized_row_hash = any(target_hashes)
    and rows.validation_status in ('imported', 'warning')
    and schedules.schedule_status <> 'cancelled'
    and rooms.room_type_id = target_room_type_id;
end;
$$;

revoke all on function public.find_existing_import_hashes(text[], uuid) from public, anon;
grant execute on function public.find_existing_import_hashes(text[], uuid) to authenticated;

create or replace function public.record_import_validation_row(
  target_batch_id uuid, target_row_number integer, target_hash text,
  target_raw jsonb, target_normalized jsonb, target_status public.import_row_status,
  target_errors jsonb, target_warnings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  row_id uuid;
  batch_room_type_id uuid;
begin
  if target_status not in ('error', 'duplicate', 'conflict', 'system_error') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;
  select batches.room_type_id into batch_room_type_id
  from public.import_batches batches
  where batches.id = target_batch_id and batches.created_by = caller_id and batches.status = 'importing';
  if batch_room_type_id is null then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;
  if not (select private.can_import_schedules(batch_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings
  ) values (
    target_batch_id, target_row_number, null, target_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb), coalesce(target_warnings, '[]'::jsonb)
  ) returning id into row_id;
  return row_id;
end;
$$;

revoke all on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) from public, anon;
grant execute on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) to authenticated;
