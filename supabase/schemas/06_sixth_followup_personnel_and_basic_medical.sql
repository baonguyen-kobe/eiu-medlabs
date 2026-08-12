set check_function_bodies = false;

-- Personnel email changes use a short-lived reservation so a stale writer
-- never reaches the external Auth provider.
create table public.personnel_update_operations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  expected_version integer not null check (expected_version > 0),
  requested_email text not null,
  payload jsonb not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '10 minutes'),
  created_at timestamptz not null default clock_timestamp()
);
create unique index personnel_update_operations_profile_idx
  on public.personnel_update_operations(profile_id);
alter table public.personnel_update_operations enable row level security;
revoke all on public.personnel_update_operations from public, anon, authenticated;
grant select, insert, update, delete on public.personnel_update_operations to service_role;

create or replace function public.begin_personnel_update(
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
  current_profile public.profiles%rowtype;
  operation_id uuid;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
begin
  if not (select private.can_manage_personnel()) then
    raise exception 'PERSONNEL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if target_expected_version is null or target_expected_version < 1 then
    raise exception 'INVALID_PERSONNEL_VERSION' using errcode = '22023';
  end if;
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_PERSONNEL_EMAIL' using errcode = '22023';
  end if;

  select * into current_profile from public.profiles
  where id = target_profile_id for update;
  if current_profile.id is null then
    raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_profile.access_version <> target_expected_version then
    raise exception 'PERSONNEL_CHANGED_RELOAD_REQUIRED' using errcode = 'P0001';
  end if;
  if target_profile_id = actor_id then
    raise exception 'CANNOT_MANAGE_OWN_SECURITY' using errcode = '42501';
  end if;
  if (select private.is_protected_security_principal(target_profile_id)) then
    raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE' using errcode = '42501';
  end if;
  if (select private.is_current_admin(target_profile_id))
    and not (select private.is_root_administrator()) then
    raise exception 'ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT' using errcode = '42501';
  end if;

  delete from public.personnel_update_operations
  where profile_id = target_profile_id and expires_at <= clock_timestamp();
  if exists (select 1 from public.personnel_update_operations where profile_id = target_profile_id) then
    raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
  end if;

  insert into public.personnel_update_operations (
    profile_id, actor_id, expected_version, requested_email, payload
  ) values (
    target_profile_id, actor_id, target_expected_version, normalized_email,
    jsonb_build_object(
      'full_name', target_full_name, 'phone', target_phone, 'title', target_title,
      'roles', to_jsonb(target_roles),
      'can_import_schedules', target_can_import_schedules,
      'room_type_ids', to_jsonb(target_room_type_ids),
      'email_room_type_ids', to_jsonb(target_email_room_type_ids),
      'allow_basic_medical_access', target_allow_basic_medical_access,
      'is_active', target_is_active
    )
  ) returning id into operation_id;

  return jsonb_build_object(
    'operation_id', operation_id,
    'profile_id', target_profile_id,
    'previous_email', current_profile.email,
    'requested_email', normalized_email,
    'expected_version', target_expected_version
  );
exception when unique_violation then
  raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
end;
$$;

revoke all on function public.begin_personnel_update(
  uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer
) from public, anon;
grant execute on function public.begin_personnel_update(
  uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer
) to authenticated;

create or replace function public.commit_personnel_update(target_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  operation_row public.personnel_update_operations%rowtype;
  result jsonb;
begin
  select * into operation_row from public.personnel_update_operations
  where id = target_operation_id for update;
  if operation_row.id is null or operation_row.actor_id <> actor_id then
    raise exception 'PERSONNEL_UPDATE_OPERATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if operation_row.expires_at <= clock_timestamp() then
    delete from public.personnel_update_operations where id = operation_row.id;
    raise exception 'PERSONNEL_UPDATE_OPERATION_EXPIRED' using errcode = '57014';
  end if;

  -- The uncommitted delete remains visible to competing transactions, while
  -- this transaction may call the guarded legacy RPC.
  delete from public.personnel_update_operations where id = operation_row.id;
  perform set_config('app.personnel_update_operation', operation_row.id::text, true);
  select public.admin_update_personnel(
    operation_row.profile_id,
    operation_row.requested_email,
    operation_row.payload->>'full_name',
    operation_row.payload->>'phone',
    operation_row.payload->>'title',
    array(select value::public.app_role from jsonb_array_elements_text(operation_row.payload->'roles')),
    (operation_row.payload->>'can_import_schedules')::boolean,
    array(select value::uuid from jsonb_array_elements_text(operation_row.payload->'room_type_ids')),
    array(select value::uuid from jsonb_array_elements_text(operation_row.payload->'email_room_type_ids')),
    (operation_row.payload->>'allow_basic_medical_access')::boolean,
    (operation_row.payload->>'is_active')::boolean,
    operation_row.expected_version
  ) into result;
  return result;
end;
$$;

revoke all on function public.commit_personnel_update(uuid) from public, anon;
grant execute on function public.commit_personnel_update(uuid) to authenticated;

create or replace function public.cancel_personnel_update(target_operation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from public.personnel_update_operations
  where id = target_operation_id and actor_id = (select auth.uid());
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;
revoke all on function public.cancel_personnel_update(uuid) from public, anon;
grant execute on function public.cancel_personnel_update(uuid) to authenticated;

-- Guard the existing atomic RPC against bypassing an active reservation and
-- against changing an Auth identity without the reservation flow.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.admin_update_personnel(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)'::regprocedure
  ) into definition;
  if position('PERSONNEL_EMAIL_CHANGE_REQUIRES_OPERATION' in definition) = 0 then
    definition := replace(definition,
      'if current_profile.access_version <> target_expected_version then',
      $guard$if exists (
        select 1 from public.personnel_update_operations operations
        where operations.profile_id = target_profile_id
          and operations.id::text is distinct from current_setting('app.personnel_update_operation', true)
      ) then
        raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
      end if;
      if lower(current_profile.email) is distinct from normalized_email
        and current_setting('app.personnel_update_operation', true) is null then
        raise exception 'PERSONNEL_EMAIL_CHANGE_REQUIRES_OPERATION' using errcode = '42501';
      end if;
      if current_profile.access_version <> target_expected_version then$guard$);
    execute definition;
  end if;
end;
$$;

-- Bulk import must not race a reserved single-person update. The import RPC
-- locks each target profile, then rejects that row before applying any change.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.admin_apply_personnel_import(text,jsonb,text)'::regprocedure
  ) into definition;
  if position('PERSONNEL_UPDATE_IN_PROGRESS' in definition) = 0 then
    definition := replace(definition,
      'select * into current_profile from public.profiles where id = import_profile_id for update;',
      $guard$select * into current_profile from public.profiles where id = import_profile_id for update;
    if exists (
      select 1 from public.personnel_update_operations operations
      where operations.profile_id = import_profile_id
        and operations.expires_at > clock_timestamp()
    ) then
      raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
    end if;$guard$);
    execute definition;
  end if;
end;
$$;

-- Basic Medical authority is centralized and scope-aware.
create or replace function private.can_manage_basic_medical()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user()) and (
    (select private.has_role('admin'))
    or (
      (select private.has_role('staff'))
      and (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
    )
  );
$$;
revoke all on function private.can_manage_basic_medical() from public, anon;
grant execute on function private.can_manage_basic_medical() to authenticated;

create or replace function public.get_basic_medical_authority_context()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('can_manage_basic_medical', (select private.can_manage_basic_medical()));
$$;
revoke all on function public.get_basic_medical_authority_context() from public, anon;
grant execute on function public.get_basic_medical_authority_context() to authenticated;

-- Runtime history drift: replace deprecated Importer, title-based lecturer
-- authorization, unscoped Staff checks, and cancelled-session reuse.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into definition;
  definition := replace(definition,
    E'(select private.has_role(''admin''))\n      or (select private.has_role(''staff''))',
    '(select private.can_manage_basic_medical())');
  definition := replace(definition,
    E'and not (select private.has_role(''admin''))\n      and not (select private.has_role(''staff''))',
    'and not (select private.can_manage_basic_medical())');
  definition := replace(definition,
    'or (select private.has_role(''importer''))',
    'or (select private.has_role(''teaching_assistant''))');
  definition := replace(definition,
    'and lower(btrim(coalesce(profiles.title, ''''))) = ''giảng viên''',
    'and exists (select 1 from public.user_roles lecturer_roles where lecturer_roles.user_id = profiles.id and lecturer_roles.role = ''lecturer'')');
  definition := replace(definition,
    'or lower(btrim(coalesce(profiles.title, ''''))) <> ''giảng viên''',
    'or not exists (select 1 from public.user_roles lecturer_roles where lecturer_roles.user_id = profiles.id and lecturer_roles.role = ''lecturer'')');
  definition := replace(definition,
    'and schedules.lecturer_id = (target_item.value->>''teaching_lecturer_id'')::uuid',
    E'and schedules.lecturer_id = (target_item.value->>''teaching_lecturer_id'')::uuid\n          and schedules.schedule_status = ''published''');
  execute definition;
end;
$$;

create or replace function public.list_basic_medical_instructors()
returns table (id uuid, full_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
    and not (select private.has_role('admin')) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles profiles
  where profiles.is_active
    and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
    and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = '40000000-0000-0000-0000-000000000002'::uuid)
  order by profiles.full_name;
end;
$$;

-- Stable, unique human-facing registration code.
create sequence if not exists public.basic_medical_registration_code_seq;
create or replace function private.next_basic_medical_registration_code()
returns text language sql volatile security definer set search_path = '' as $$
  select 'YC-' || to_char(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD')
    || '-' || lpad(nextval('public.basic_medical_registration_code_seq')::text, 6, '0');
$$;
revoke all on function private.next_basic_medical_registration_code() from public, anon;
grant execute on function private.next_basic_medical_registration_code() to authenticated, service_role;
alter table public.basic_medical_registrations add column if not exists registration_code text;
alter table public.basic_medical_registrations alter column registration_code
  set default private.next_basic_medical_registration_code();
update public.basic_medical_registrations
set registration_code = private.next_basic_medical_registration_code()
where registration_code is null;
alter table public.basic_medical_registrations alter column registration_code set not null;
create unique index if not exists basic_medical_registrations_code_key
  on public.basic_medical_registrations(registration_code);

create or replace view public.basic_medical_registration_list
with (security_invoker = true)
as
select registrations.id,
       registrations.created_at,
       registrations.start_date,
       registrations.end_date,
       registrations.academic_year,
       registrations.semester,
       registrations.student_count,
       courses.course_code,
       courses.course_name,
       rooms.room_code,
       rooms.building_code,
       rooms.room_name,
       registrants.full_name as registrant_name,
       responsible.full_name as responsible_name,
       completion.session_count,
       completion.confirmed_session_count,
       completion.is_completed,
       concat_ws(
         ' ', registrations.registration_code,
         courses.course_code, courses.course_name,
         rooms.room_code, rooms.building_code, rooms.room_name,
         registrants.full_name, responsible.full_name
       ) as search_text,
       registrations.registration_code
from public.basic_medical_registrations as registrations
join public.courses on courses.id = registrations.course_id
join public.rooms on rooms.id = registrations.room_id
join public.profiles as registrants on registrants.id = registrations.registrant_id
join public.profiles as responsible on responsible.id = registrations.responsible_lecturer_id
join public.basic_medical_registration_completion as completion
  on completion.registration_id = registrations.id;
grant select on public.basic_medical_registration_list to authenticated, service_role;

-- Scope-aware policies and no direct inventory/confirmation writes.
drop policy if exists basic_medical_equipment_catalog_select on public.basic_medical_equipment_catalog;
create policy basic_medical_equipment_catalog_select on public.basic_medical_equipment_catalog
for select to authenticated using (
  (select private.is_active_user()) and (
    (select private.can_manage_basic_medical())
    or (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
  )
);
drop policy if exists basic_medical_room_inventory_select on public.basic_medical_room_inventory;
create policy basic_medical_room_inventory_select on public.basic_medical_room_inventory
for select to authenticated using (
  (select private.is_active_user()) and (
    (select private.can_manage_basic_medical())
    or (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
  )
);
drop policy if exists basic_medical_registrations_select on public.basic_medical_registrations;
create policy basic_medical_registrations_select on public.basic_medical_registrations
for select to authenticated using (
  (select private.is_active_user()) and (
    (select private.can_manage_basic_medical())
    or ((select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
      and (created_by = (select auth.uid()) or registrant_id = (select auth.uid()) or responsible_lecturer_id = (select auth.uid())))
  )
);
drop policy if exists basic_medical_registrations_manage on public.basic_medical_registrations;
create policy basic_medical_registrations_manage on public.basic_medical_registrations
for all to authenticated
using ((select private.can_manage_basic_medical()) or created_by = (select auth.uid()))
with check (created_by = (select auth.uid()) and (
  (select private.can_manage_basic_medical())
  or (((select private.has_role('lecturer')) or (select private.has_role('teaching_assistant')))
    and (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.allow_basic_medical_access))
));
drop policy if exists basic_medical_sessions_manage on public.basic_medical_registration_sessions;
create policy basic_medical_sessions_manage on public.basic_medical_registration_sessions
for all to authenticated
using (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.can_manage_basic_medical()))))
with check (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.can_manage_basic_medical()))));

drop policy if exists basic_medical_equipment_catalog_manage on public.basic_medical_equipment_catalog;
create policy basic_medical_equipment_catalog_manage on public.basic_medical_equipment_catalog
for all to authenticated using ((select private.can_manage_basic_medical()))
with check ((select private.can_manage_basic_medical()));
drop policy if exists basic_medical_room_inventory_manage on public.basic_medical_room_inventory;
drop policy if exists basic_medical_condition_logs_manager_select on public.basic_medical_equipment_condition_logs;
create policy basic_medical_condition_logs_manager_select on public.basic_medical_equipment_condition_logs
for select to authenticated using ((select private.can_manage_basic_medical()));

revoke insert, update, delete on public.basic_medical_room_inventory from authenticated;
revoke insert, update, delete on public.basic_medical_session_confirmations from authenticated;
revoke insert, update, delete on public.basic_medical_session_equipment_checks from authenticated;
revoke insert, update, delete on public.basic_medical_equipment_condition_logs from authenticated;

drop policy if exists basic_medical_session_confirmations_select on public.basic_medical_session_confirmations;
create policy basic_medical_session_confirmations_select on public.basic_medical_session_confirmations
for select to authenticated using (
  signer_id = (select auth.uid())
  or (select private.can_manage_basic_medical())
  or exists (
    select 1 from public.basic_medical_registrations registrations
    where registrations.id = registration_id_snapshot
      and (registrations.registrant_id = (select auth.uid())
        or registrations.responsible_lecturer_id = (select auth.uid()))
  )
);
revoke select on public.basic_medical_session_confirmations from authenticated;
grant select (
  id, session_id, registration_id_snapshot, class_schedule_id_snapshot,
  signer_id, schedule_date_snapshot, start_time_snapshot, end_time_snapshot,
  room_id_snapshot, teaching_lecturer_id_snapshot, signed_at,
  invalidated_at, invalidated_reason, created_at
) on public.basic_medical_session_confirmations to authenticated;

-- Patch inventory RPCs to require the centralized manager scope.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.set_basic_medical_room_inventory(uuid,uuid,uuid,integer,integer,boolean,text)'::regprocedure) into definition;
  definition := replace(definition,
    'or not ((select private.has_role(''admin'')) or (select private.has_role(''staff'')))',
    'or not (select private.can_manage_basic_medical())');
  definition := replace(definition,
    'where id = target_room_id and room_type_id = basic_medical_room_type_id',
    E'where id = target_room_id and room_type_id = basic_medical_room_type_id\n      and is_active');
  definition := replace(definition,
    'where id = target_catalog_item_id',
    E'where id = target_catalog_item_id\n      and is_active');
  execute definition;

  select pg_get_functiondef('public.adjust_basic_medical_inventory_condition(uuid,integer,integer,text)'::regprocedure) into definition;
  definition := replace(definition,
    'or not ((select private.has_role(''admin'')) or (select private.has_role(''staff'')))',
    'or not (select private.can_manage_basic_medical())');
  execute definition;
end;
$$;
