set check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Personnel: durable Auth/Profile update saga and principal authority
-- ---------------------------------------------------------------------------

alter table public.personnel_update_operations
  add column if not exists previous_email text,
  add column if not exists status text not null default 'reserved',
  add column if not exists auth_updated_at timestamptz,
  add column if not exists committed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists last_error text;

update public.personnel_update_operations operations
set previous_email = profiles.email
from public.profiles profiles
where profiles.id = operations.profile_id
  and operations.previous_email is null;

alter table public.personnel_update_operations
  alter column previous_email set not null;

alter table public.personnel_update_operations
  drop constraint if exists personnel_update_operations_status_check;
alter table public.personnel_update_operations
  add constraint personnel_update_operations_status_check check (
    status in (
      'reserved', 'auth_updated', 'committed', 'rollback_required',
      'rolled_back', 'reconciliation_required', 'expired'
    )
  );

drop index if exists public.personnel_update_operations_profile_idx;
create unique index personnel_update_operations_active_profile_idx
  on public.personnel_update_operations(profile_id)
  where status in ('reserved', 'auth_updated', 'rollback_required', 'reconciliation_required');
create index personnel_update_operations_reconcile_idx
  on public.personnel_update_operations(status, expires_at)
  where status in ('auth_updated', 'rollback_required', 'reconciliation_required');

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
  actor_is_root boolean := (select private.is_root_administrator());
  current_profile public.profiles%rowtype;
  operation_id uuid;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
  normalized_name text := btrim(coalesce(target_full_name, ''));
  normalized_roles public.app_role[];
  normalized_scopes uuid[];
  normalized_email_scopes uuid[];
begin
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
  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_PERSONNEL_EMAIL' using errcode = '22023';
  end if;
  if normalized_name = '' then
    raise exception 'INVALID_PERSONNEL_NAME' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::public.app_role[])
  into normalized_roles from unnest(coalesce(target_roles, '{}'::public.app_role[])) values_(value);
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
  into normalized_scopes from unnest(coalesce(target_room_type_ids, '{}'::uuid[])) values_(value);
  select coalesce(array_agg(distinct value order by value), '{}'::uuid[])
  into normalized_email_scopes from unnest(coalesce(target_email_room_type_ids, '{}'::uuid[])) values_(value);
  if cardinality(normalized_roles) = 0 or cardinality(normalized_scopes) = 0 then
    raise exception 'PERSONNEL_ROLE_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if 'importer'::public.app_role = any(normalized_roles)
    or ('viewer'::public.app_role = any(normalized_roles) and cardinality(normalized_roles) <> 1) then
    raise exception 'INVALID_PERSONNEL_ROLE' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(normalized_email_scopes) value where value <> all(normalized_scopes)) then
    raise exception 'EMAIL_SCOPE_MUST_BE_ASSIGNED' using errcode = '22023';
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
  if exists (
    select 1 from public.system_security_principals principals
    where principals.singleton and principals.root_admin_id = target_profile_id
  ) then
    raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.system_security_principals principals
    where principals.singleton and principals.personnel_manager_id = target_profile_id
  ) and not actor_is_root then
    raise exception 'ROOT_ADMIN_REQUIRED_FOR_PERSONNEL_MANAGER' using errcode = '42501';
  end if;
  if (select private.is_current_admin(target_profile_id)) and not actor_is_root then
    raise exception 'ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT' using errcode = '42501';
  end if;

  update public.personnel_update_operations
  set status = case when status = 'reserved' then 'expired' else 'reconciliation_required' end,
      resolved_at = case when status = 'reserved' then clock_timestamp() else resolved_at end,
      last_error = coalesce(last_error, 'Operation expired before a new reservation was requested')
  where profile_id = target_profile_id
    and status in ('reserved', 'auth_updated')
    and expires_at <= clock_timestamp();

  if exists (
    select 1 from public.personnel_update_operations
    where profile_id = target_profile_id
      and status in ('auth_updated', 'rollback_required', 'reconciliation_required')
  ) then
    raise exception 'PERSONNEL_RECONCILIATION_REQUIRED' using errcode = '55P03';
  end if;
  if exists (
    select 1 from public.personnel_update_operations
    where profile_id = target_profile_id and status = 'reserved'
  ) then
    raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
  end if;

  insert into public.personnel_update_operations (
    profile_id, actor_id, expected_version, previous_email,
    requested_email, payload, status
  ) values (
    target_profile_id, actor_id, target_expected_version, lower(current_profile.email),
    normalized_email,
    jsonb_build_object(
      'full_name', normalized_name, 'phone', target_phone, 'title', target_title,
      'roles', to_jsonb(normalized_roles),
      'can_import_schedules', target_can_import_schedules,
      'room_type_ids', to_jsonb(normalized_scopes),
      'email_room_type_ids', to_jsonb(normalized_email_scopes),
      'allow_basic_medical_access', target_allow_basic_medical_access,
      'is_active', target_is_active
    ),
    'reserved'
  ) returning id into operation_id;

  return jsonb_build_object(
    'operation_id', operation_id,
    'profile_id', target_profile_id,
    'previous_email', lower(current_profile.email),
    'requested_email', normalized_email,
    'expected_version', target_expected_version,
    'status', 'reserved'
  );
exception when unique_violation then
  raise exception 'PERSONNEL_UPDATE_IN_PROGRESS' using errcode = '55P03';
end;
$$;

create or replace function public.mark_personnel_auth_updated(target_operation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  update public.personnel_update_operations
  set status = 'auth_updated', auth_updated_at = clock_timestamp(), last_error = null
  where id = target_operation_id
    and actor_id = (select auth.uid())
    and status = 'reserved'
    and expires_at > clock_timestamp();
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'PERSONNEL_UPDATE_OPERATION_NOT_RESERVED' using errcode = 'P0002';
  end if;
  return true;
end;
$$;
revoke all on function public.mark_personnel_auth_updated(uuid) from public, anon;
grant execute on function public.mark_personnel_auth_updated(uuid) to authenticated;

create or replace function public.commit_personnel_update(target_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if operation_row.status <> 'auth_updated' then
    raise exception 'PERSONNEL_AUTH_UPDATE_NOT_CONFIRMED' using errcode = '55000';
  end if;
  if operation_row.expires_at <= clock_timestamp() then
    update public.personnel_update_operations
    set status = 'reconciliation_required', last_error = 'Commit attempted after expiry'
    where id = operation_row.id;
    raise exception 'PERSONNEL_UPDATE_OPERATION_EXPIRED' using errcode = '57014';
  end if;

  perform set_config('app.personnel_update_operation', operation_row.id::text, true);
  select public.admin_update_personnel(
    operation_row.profile_id, operation_row.requested_email,
    operation_row.payload->>'full_name', operation_row.payload->>'phone',
    operation_row.payload->>'title',
    array(select value::public.app_role from jsonb_array_elements_text(operation_row.payload->'roles')),
    (operation_row.payload->>'can_import_schedules')::boolean,
    array(select value::uuid from jsonb_array_elements_text(operation_row.payload->'room_type_ids')),
    array(select value::uuid from jsonb_array_elements_text(operation_row.payload->'email_room_type_ids')),
    (operation_row.payload->>'allow_basic_medical_access')::boolean,
    (operation_row.payload->>'is_active')::boolean,
    operation_row.expected_version
  ) into result;

  update public.personnel_update_operations
  set status = 'committed', committed_at = clock_timestamp(),
      resolved_at = clock_timestamp(), last_error = null
  where id = operation_row.id;
  return result;
exception when others then
  if operation_row.id is not null then
    update public.personnel_update_operations
    set status = case when requested_email = previous_email then 'expired' else 'rollback_required' end,
        last_error = sqlerrm,
        resolved_at = case when requested_email = previous_email then clock_timestamp() else null end
    where id = operation_row.id and status = 'auth_updated';
  end if;
  raise;
end;
$$;

create or replace function public.cancel_personnel_update(target_operation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  update public.personnel_update_operations
  set status = 'rolled_back', resolved_at = clock_timestamp(),
      last_error = coalesce(last_error, 'Cancelled before Auth update')
  where id = target_operation_id
    and actor_id = (select auth.uid())
    and status = 'reserved';
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create or replace function public.resolve_personnel_update_operation(
  target_operation_id uuid,
  target_status text,
  target_error text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('committed','rolled_back','reconciliation_required','expired') then
    raise exception 'INVALID_PERSONNEL_OPERATION_STATUS' using errcode = '22023';
  end if;
  update public.personnel_update_operations
  set status = target_status,
      committed_at = case when target_status = 'committed' then coalesce(committed_at, clock_timestamp()) else committed_at end,
      resolved_at = case when target_status in ('committed','rolled_back','expired') then clock_timestamp() else null end,
      last_error = target_error
  where id = target_operation_id
    and status in ('auth_updated','rollback_required','reconciliation_required');
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;
revoke all on function public.resolve_personnel_update_operation(uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_personnel_update_operation(uuid,text,text) to service_role;

-- The legacy atomic RPC may only run inside the matching active operation when
-- it changes an Auth identity. Resolved operations never block later writers.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.admin_update_personnel(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)'::regprocedure
  ) into definition;
  definition := replace(definition,
    E'where operations.profile_id = target_profile_id\n          and operations.id::text is distinct from current_setting(''app.personnel_update_operation'', true)',
    E'where operations.profile_id = target_profile_id\n          and operations.status in (''reserved'',''auth_updated'',''rollback_required'',''reconciliation_required'')\n          and operations.id::text is distinct from current_setting(''app.personnel_update_operation'', true)');
  execute definition;
end;
$$;

-- Root may manage the designated Personnel Manager; everyone else keeps the
-- protection. Root itself always remains immutable.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.admin_apply_personnel_import(text,jsonb,text)'::regprocedure)
  into definition;
  definition := replace(definition,
    'if (select private.is_protected_security_principal(import_profile_id))\n      or (select private.is_current_admin(import_profile_id)) then',
    $replacement$if exists (
      select 1 from public.system_security_principals principals
      where principals.singleton and principals.root_admin_id = import_profile_id
    ) or (
      exists (
        select 1 from public.system_security_principals principals
        where principals.singleton and principals.personnel_manager_id = import_profile_id
      ) and not actor_is_root
    ) or ((select private.is_current_admin(import_profile_id)) and not actor_is_root) then$replacement$);
  definition := replace(definition,
    E'if target_mode = ''all'' then\n    for current_profile in',
    E'if target_mode = ''all'' and exists (\n    select 1 from public.personnel_update_operations operations\n    where operations.status in (''reserved'',''auth_updated'',''rollback_required'',''reconciliation_required'')\n      and not (operations.profile_id = any(applied_ids))\n  ) then\n    raise exception ''PERSONNEL_UPDATE_IN_PROGRESS'' using errcode = ''55P03'';\n  end if;\n\n  if target_mode = ''all'' then\n    for current_profile in');
  execute definition;
end;
$$;

-- ---------------------------------------------------------------------------
-- Basic Medical: centralized visibility, RPC-only writes and soft cancellation
-- ---------------------------------------------------------------------------

alter table public.basic_medical_registrations
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancel_reason text;
create index if not exists basic_medical_registrations_active_idx
  on public.basic_medical_registrations(created_at desc)
  where cancelled_at is null;

create or replace function private.can_view_basic_medical_registration(target_registration_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_active_user()) and (
    (select private.can_manage_basic_medical())
    or (
      (select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid))
      and exists (
        select 1 from public.basic_medical_registrations registrations
        where registrations.id = target_registration_id
          and (
            (select private.has_role('viewer'))
            or registrations.created_by = (select auth.uid())
            or registrations.registrant_id = (select auth.uid())
            or registrations.responsible_lecturer_id = (select auth.uid())
            or exists (
              select 1 from public.basic_medical_registration_sessions sessions
              where sessions.registration_id = registrations.id
                and sessions.teaching_lecturer_id = (select auth.uid())
            )
          )
      )
    )
  );
$$;
revoke all on function private.can_view_basic_medical_registration(uuid) from public, anon;
grant execute on function private.can_view_basic_medical_registration(uuid) to authenticated;

drop policy if exists basic_medical_registrations_select on public.basic_medical_registrations;
create policy basic_medical_registrations_select on public.basic_medical_registrations
for select to authenticated using ((select private.can_view_basic_medical_registration(id)));

drop policy if exists basic_medical_sessions_select on public.basic_medical_registration_sessions;
create policy basic_medical_sessions_select on public.basic_medical_registration_sessions
for select to authenticated using ((select private.can_view_basic_medical_registration(registration_id)));

drop policy if exists basic_medical_session_confirmations_select on public.basic_medical_session_confirmations;
create policy basic_medical_session_confirmations_select on public.basic_medical_session_confirmations
for select to authenticated using (
  (select private.can_view_basic_medical_registration(registration_id_snapshot))
);

drop policy if exists basic_medical_session_equipment_checks_select on public.basic_medical_session_equipment_checks;
create policy basic_medical_session_equipment_checks_select on public.basic_medical_session_equipment_checks
for select to authenticated using (exists (
  select 1 from public.basic_medical_session_confirmations confirmations
  where confirmations.id = confirmation_id
    and (select private.can_view_basic_medical_registration(confirmations.registration_id_snapshot))
));

drop policy if exists basic_medical_registrations_manage on public.basic_medical_registrations;
drop policy if exists basic_medical_sessions_manage on public.basic_medical_registration_sessions;
revoke insert, update, delete on public.basic_medical_registrations from authenticated;
revoke insert, update, delete on public.basic_medical_registration_sessions from authenticated;

create or replace function public.cancel_basic_medical_registration(
  target_registration_id uuid,
  target_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  target_row public.basic_medical_registrations%rowtype;
  cancelled_schedule_count integer := 0;
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  select * into target_row from public.basic_medical_registrations
  where id = target_registration_id for update;
  if target_row.id is null then
    raise exception 'BASIC_MEDICAL_REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_row.cancelled_at is not null then
    return jsonb_build_object('id', target_row.id, 'already_cancelled', true, 'cancelled_schedules', 0);
  end if;

  update public.class_schedules schedules
  set schedule_status = 'cancelled', cancelled_by = actor_id,
      cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where schedules.basic_medical_registration_id = target_registration_id
    and schedules.schedule_status not in ('cancelled', 'completed')
    and schedules.schedule_date >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics cancelled_schedule_count = row_count;

  update public.basic_medical_session_confirmations confirmations
  set invalidated_at = coalesce(confirmations.invalidated_at, clock_timestamp()),
      invalidated_reason = coalesce(confirmations.invalidated_reason, 'Phiếu Y cơ sở đã được hủy.')
  where confirmations.registration_id_snapshot = target_registration_id
    and confirmations.invalidated_at is null;

  update public.basic_medical_registrations
  set cancelled_at = clock_timestamp(), cancelled_by = actor_id,
      cancel_reason = nullif(btrim(target_reason), ''), updated_at = clock_timestamp()
  where id = target_registration_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    actor_id, 'basic_medical.registration_cancelled', 'basic_medical_registration',
    target_registration_id,
    jsonb_build_object('cancelled_at', null),
    jsonb_build_object('cancelled_at', clock_timestamp(), 'reason', nullif(btrim(target_reason), '')),
    jsonb_build_object('cancelled_schedules', cancelled_schedule_count)
  );
  return jsonb_build_object('id', target_registration_id, 'already_cancelled', false,
    'cancelled_schedules', cancelled_schedule_count);
end;
$$;
revoke all on function public.cancel_basic_medical_registration(uuid,text) from public, anon;
grant execute on function public.cancel_basic_medical_registration(uuid,text) to authenticated;

-- Reject attempts to edit a cancelled registration through the save RPC.
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into definition;
  definition := replace(definition,
    E'if registration_owner_id is null then\n      raise exception ''Không tìm thấy phiếu Y cơ sở.'' using errcode = ''P0002'';\n    end if;',
    E'if registration_owner_id is null then\n      raise exception ''Không tìm thấy phiếu Y cơ sở.'' using errcode = ''P0002'';\n    end if;\n    if exists (select 1 from public.basic_medical_registrations cancelled where cancelled.id = target_registration_id and cancelled.cancelled_at is not null) then\n      raise exception ''Phiếu Y cơ sở đã hủy không thể điều chỉnh.'' using errcode = ''55000'';\n    end if;');
  execute definition;
end;
$$;

create or replace view public.basic_medical_registration_completion
with (security_invoker = true)
as
select registrations.id as registration_id,
       count(sessions.id)::integer as session_count,
       count(confirmations.id)::integer as confirmed_session_count,
       (count(sessions.id) > 0 and count(sessions.id) = count(confirmations.id)) as is_completed
from public.basic_medical_registrations registrations
left join public.basic_medical_registration_sessions sessions
  on sessions.registration_id = registrations.id
left join public.basic_medical_session_confirmations confirmations
  on confirmations.session_id = sessions.id and confirmations.invalidated_at is null
where registrations.cancelled_at is null
group by registrations.id;

create or replace view public.basic_medical_registration_list
with (security_invoker = true)
as
select registrations.id, registrations.created_at, registrations.start_date,
       registrations.end_date, registrations.academic_year, registrations.semester,
       registrations.student_count, courses.course_code, courses.course_name,
       rooms.room_code, rooms.building_code, rooms.room_name,
       registrants.full_name as registrant_name,
       responsible.full_name as responsible_name,
       completion.session_count, completion.confirmed_session_count,
       completion.is_completed,
       concat_ws(' ', registrations.registration_code, courses.course_code,
         courses.course_name, rooms.room_code, rooms.building_code, rooms.room_name,
         registrants.full_name, responsible.full_name) as search_text,
       registrations.registration_code
from public.basic_medical_registrations registrations
join public.courses on courses.id = registrations.course_id
join public.rooms on rooms.id = registrations.room_id
join public.profiles registrants on registrants.id = registrations.registrant_id
join public.profiles responsible on responsible.id = registrations.responsible_lecturer_id
join public.basic_medical_registration_completion completion
  on completion.registration_id = registrations.id
where registrations.cancelled_at is null;
grant select on public.basic_medical_registration_completion,
  public.basic_medical_registration_list to authenticated, service_role;

-- Correct historical human codes by the registration creation date in the
-- application timezone while preserving the unique sequence suffix.
update public.basic_medical_registrations registrations
set registration_code = 'YC-'
  || to_char(registrations.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD')
  || '-' || split_part(registrations.registration_code, '-', 3)
where registrations.registration_code ~ '^YC-[0-9]{6}-[0-9]{6,}$'
  and split_part(registrations.registration_code, '-', 2)
    <> to_char(registrations.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD');

-- ---------------------------------------------------------------------------
-- Basic Medical equipment: scoped read/search/export and atomic catalog import
-- ---------------------------------------------------------------------------

create or replace function public.search_basic_medical_catalog_candidates(
  target_query text default null,
  target_limit integer default 30
)
returns table (
  id uuid, item_name text, commercial_name text, item_type text,
  country_of_origin text, manufacturer text, model text, unit text, is_active boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare safe_limit integer := least(greatest(coalesce(target_limit, 30), 1), 50);
declare normalized_query text := lower(btrim(coalesce(target_query, '')));
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  return query
  select catalog.id, catalog.item_name, catalog.commercial_name, catalog.item_type,
    catalog.country_of_origin, catalog.manufacturer, catalog.model, catalog.unit,
    catalog.is_active
  from public.basic_medical_equipment_catalog catalog
  where catalog.is_active and (
    normalized_query = ''
    or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
    or lower(extensions.unaccent(coalesce(catalog.commercial_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
    or lower(coalesce(catalog.model, '')) like '%' || normalized_query || '%'
  )
  order by catalog.item_name, catalog.commercial_name nulls last
  limit safe_limit;
end;
$$;
revoke all on function public.search_basic_medical_catalog_candidates(text,integer) from public, anon;
grant execute on function public.search_basic_medical_catalog_candidates(text,integer) to authenticated;

create or replace function public.search_basic_medical_equipment(
  target_tab text,
  target_query text default null,
  target_room_id uuid default null,
  target_catalog_item_id uuid default null,
  target_event_type text default null,
  target_actor_id uuid default null,
  target_from_date date default null,
  target_to_date date default null,
  target_status text default null,
  target_page integer default 1,
  target_page_size integer default 50
)
returns table(row_data jsonb, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  normalized_query text := lower(btrim(coalesce(target_query, '')));
  safe_page integer := greatest(coalesce(target_page, 1), 1);
  safe_size integer := least(greatest(coalesce(target_page_size, 50), 1), 50);
  can_manage boolean := (select private.can_manage_basic_medical());
begin
  if not (select private.is_active_user())
    or not ((select private.has_room_type('40000000-0000-0000-0000-000000000002'::uuid)) or can_manage) then
    raise exception 'BASIC_MEDICAL_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if target_tab not in ('inventory','rooms','damaged','logs') then
    raise exception 'INVALID_BASIC_MEDICAL_EQUIPMENT_TAB' using errcode = '22023';
  end if;
  if target_tab in ('inventory','damaged','logs') and not can_manage then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  if target_tab = 'inventory' then
    return query
    select to_jsonb(catalog), count(*) over()
    from public.basic_medical_equipment_catalog catalog
    where (target_status is null or target_status = ''
      or (target_status = 'active' and catalog.is_active)
      or (target_status = 'inactive' and not catalog.is_active))
      and (normalized_query = ''
        or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.commercial_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.item_type, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(coalesce(catalog.manufacturer, '')) like '%' || normalized_query || '%'
        or lower(coalesce(catalog.model, '')) like '%' || normalized_query || '%')
    order by catalog.item_name, catalog.id
    limit safe_size offset (safe_page - 1) * safe_size;
  elsif target_tab in ('rooms','damaged') then
    return query
    select jsonb_build_object(
      'id', inventory.id, 'room_id', inventory.room_id,
      'catalog_item_id', inventory.catalog_item_id,
      'total_quantity', inventory.total_quantity, 'good_quantity', inventory.good_quantity,
      'damaged_quantity', inventory.damaged_quantity, 'is_active', inventory.is_active,
      'last_damage_reported_at', inventory.last_damage_reported_at,
      'room', to_jsonb(rooms), 'catalog', to_jsonb(catalog),
      'last_damage_reporter', case when can_manage then to_jsonb(reporter) else null end
    ), count(*) over()
    from public.basic_medical_room_inventory inventory
    join public.rooms rooms on rooms.id = inventory.room_id
    join public.basic_medical_equipment_catalog catalog on catalog.id = inventory.catalog_item_id
    left join public.profiles reporter on reporter.id = inventory.last_damage_reporter_id
    where inventory.is_active
      and (target_tab <> 'damaged' or inventory.damaged_quantity > 0)
      and (target_room_id is null or inventory.room_id = target_room_id)
      and (target_catalog_item_id is null or inventory.catalog_item_id = target_catalog_item_id)
      and (normalized_query = ''
        or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(catalog.commercial_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(rooms.room_code) like '%' || normalized_query || '%'
        or lower(rooms.building_code) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(coalesce(rooms.room_name, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%')
    order by rooms.building_code, rooms.room_code, catalog.item_name
    limit safe_size offset (safe_page - 1) * safe_size;
  else
    return query
    select jsonb_build_object(
      'id', logs.id, 'event_type', logs.event_type,
      'total_before', logs.total_before, 'good_before', logs.good_before,
      'damaged_before', logs.damaged_before, 'total_after', logs.total_after,
      'good_after', logs.good_after, 'damaged_after', logs.damaged_after,
      'quantity_delta', logs.quantity_delta, 'note', logs.note,
      'created_at', logs.created_at,
      'inventory', jsonb_build_object('room', to_jsonb(rooms), 'catalog', to_jsonb(catalog)),
      'actor', to_jsonb(actor)
    ), count(*) over()
    from public.basic_medical_equipment_condition_logs logs
    join public.basic_medical_room_inventory inventory on inventory.id = logs.inventory_id
    join public.rooms rooms on rooms.id = inventory.room_id
    join public.basic_medical_equipment_catalog catalog on catalog.id = inventory.catalog_item_id
    join public.profiles actor on actor.id = logs.actor_id
    where (target_room_id is null or inventory.room_id = target_room_id)
      and (target_catalog_item_id is null or inventory.catalog_item_id = target_catalog_item_id)
      and (target_actor_id is null or logs.actor_id = target_actor_id)
      and (target_event_type is null or target_event_type = '' or logs.event_type = target_event_type)
      and (target_from_date is null or logs.created_at >= target_from_date::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (target_to_date is null or logs.created_at < (target_to_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (normalized_query = ''
        or lower(extensions.unaccent(catalog.item_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(rooms.room_code) like '%' || normalized_query || '%'
        or lower(extensions.unaccent(actor.full_name)) like '%' || lower(extensions.unaccent(normalized_query)) || '%'
        or lower(extensions.unaccent(coalesce(logs.note, ''))) like '%' || lower(extensions.unaccent(normalized_query)) || '%')
    order by logs.created_at desc, logs.id
    limit safe_size offset (safe_page - 1) * safe_size;
  end if;
end;
$$;
revoke all on function public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer) from public, anon;
grant execute on function public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer) to authenticated;

create or replace function public.apply_basic_medical_catalog_import(
  target_mode text,
  target_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  item jsonb;
  normalized_rows jsonb := '[]'::jsonb;
  item_name_value text;
  commercial_name_value text;
  model_value text;
  unit_value text;
  fingerprint_value text;
  fingerprints text[] := '{}';
  current_id uuid;
  inserted_count integer := 0;
  updated_count integer := 0;
  inactivated_count integer := 0;
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if target_mode not in ('new','all') or target_rows is null
    or jsonb_typeof(target_rows) <> 'array'
    or jsonb_array_length(target_rows) not between 1 and 5000 then
    raise exception 'INVALID_BASIC_MEDICAL_CATALOG_IMPORT' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_rows)
  loop
    item_name_value := btrim(coalesce(item->>'item_name', ''));
    commercial_name_value := nullif(btrim(coalesce(item->>'commercial_name', '')), '');
    model_value := nullif(btrim(coalesce(item->>'model', '')), '');
    unit_value := btrim(coalesce(item->>'unit', ''));
    if item_name_value = '' or unit_value = '' then
      raise exception 'CATALOG_ITEM_NAME_AND_UNIT_REQUIRED' using errcode = '22023';
    end if;
    fingerprint_value := lower(item_name_value) || '|' || lower(coalesce(commercial_name_value, '')) || '|' || lower(coalesce(model_value, ''));
    if fingerprint_value = any(fingerprints) then
      raise exception 'DUPLICATE_BASIC_MEDICAL_CATALOG_IMPORT_ROW' using errcode = '22023';
    end if;
    fingerprints := array_append(fingerprints, fingerprint_value);
    normalized_rows := normalized_rows || jsonb_build_array(jsonb_build_object(
      'item_name', item_name_value, 'commercial_name', commercial_name_value,
      'item_type', nullif(btrim(coalesce(item->>'item_type', '')), ''),
      'country_of_origin', nullif(btrim(coalesce(item->>'country_of_origin', '')), ''),
      'manufacturer', nullif(btrim(coalesce(item->>'manufacturer', '')), ''),
      'model', model_value, 'unit', unit_value, 'fingerprint', fingerprint_value
    ));
  end loop;

  for item in select value from jsonb_array_elements(normalized_rows)
  loop
    select catalog.id into current_id
    from public.basic_medical_equipment_catalog catalog
    where lower(catalog.item_name) = lower(item->>'item_name')
      and lower(coalesce(catalog.commercial_name, '')) = lower(coalesce(item->>'commercial_name', ''))
      and lower(coalesce(catalog.model, '')) = lower(coalesce(item->>'model', ''))
    for update;
    if current_id is null then
      insert into public.basic_medical_equipment_catalog(
        item_name, commercial_name, item_type, country_of_origin,
        manufacturer, model, unit, is_active
      ) values (
        item->>'item_name', nullif(item->>'commercial_name',''), nullif(item->>'item_type',''),
        nullif(item->>'country_of_origin',''), nullif(item->>'manufacturer',''),
        nullif(item->>'model',''), item->>'unit', true
      );
      inserted_count := inserted_count + 1;
    elsif target_mode = 'all' then
      update public.basic_medical_equipment_catalog
      set item_name = item->>'item_name', commercial_name = nullif(item->>'commercial_name',''),
          item_type = nullif(item->>'item_type',''), country_of_origin = nullif(item->>'country_of_origin',''),
          manufacturer = nullif(item->>'manufacturer',''), model = nullif(item->>'model',''),
          unit = item->>'unit', is_active = true
      where id = current_id;
      updated_count := updated_count + 1;
    end if;
    current_id := null;
  end loop;

  if target_mode = 'all' then
    update public.basic_medical_equipment_catalog catalog
    set is_active = false
    where catalog.is_active and not (
      lower(catalog.item_name) || '|' || lower(coalesce(catalog.commercial_name, '')) || '|' || lower(coalesce(catalog.model, ''))
      = any(fingerprints)
    );
    get diagnostics inactivated_count = row_count;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, metadata)
  values (actor_id, 'basic_medical.catalog_imported', 'basic_medical_equipment_catalog',
    jsonb_build_object('mode', target_mode, 'inserted', inserted_count,
      'updated', updated_count, 'inactivated', inactivated_count));
  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count,
    'inactivated', inactivated_count,
    'processed', inserted_count + updated_count);
end;
$$;
revoke all on function public.apply_basic_medical_catalog_import(text,jsonb) from public, anon;
grant execute on function public.apply_basic_medical_catalog_import(text,jsonb) to authenticated;

create or replace function public.audit_basic_medical_equipment_export(target_row_count integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, metadata)
  values ((select auth.uid()), 'basic_medical.equipment_exported', 'basic_medical_equipment',
    jsonb_build_object('row_count', greatest(coalesce(target_row_count, 0), 0)));
  return true;
end;
$$;
revoke all on function public.audit_basic_medical_equipment_export(integer) from public, anon;
grant execute on function public.audit_basic_medical_equipment_export(integer) to authenticated;
