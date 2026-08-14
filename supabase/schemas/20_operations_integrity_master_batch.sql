-- Operations Integrity Master Batch.  This migration is intentionally forward
-- only; it hardens authority at the database boundary before UI changes use it.

alter table public.basic_medical_registration_sessions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text;

alter table public.basic_medical_session_confirmations
  add column if not exists invalidated_by uuid references public.profiles(id) on delete set null,
  add column if not exists invalidated_by_name_snapshot text;

grant select (invalidated_at, invalidated_by, invalidated_by_name_snapshot, invalidated_reason)
on public.basic_medical_session_confirmations to authenticated;

-- A root administrator is a security principal, never an operational assignee.
create or replace function private.is_operationally_assignable(target_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_profile_id and p.is_active
      and not exists (
        select 1 from public.system_security_principals principals
        where principals.singleton and principals.root_admin_id = p.id
      )
  );
$$;

create or replace function private.assert_operationally_assignable(target_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_operationally_assignable(target_profile_id)) then
    raise exception 'ROOT_ADMIN_OPERATIONAL_ASSIGNMENT_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_operational_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid;
begin
  target_id := nullif(to_jsonb(new)->>tg_argv[0], '')::uuid;
  -- Some assignment columns are intentionally nullable while a class is
  -- unassigned.  Only an actual future assignee is subject to the Root ban.
  if target_id is not null then
    perform private.assert_operationally_assignable(target_id);
  end if;
  return new;
end;
$$;

drop trigger if exists basic_medical_registration_operational_assignee on public.basic_medical_registrations;
create trigger basic_medical_registration_operational_assignee
before insert or update of responsible_lecturer_id on public.basic_medical_registrations
for each row execute function private.guard_operational_assignment('responsible_lecturer_id');
drop trigger if exists basic_medical_session_operational_assignee on public.basic_medical_registration_sessions;
create trigger basic_medical_session_operational_assignee
before insert or update of teaching_lecturer_id on public.basic_medical_registration_sessions
for each row execute function private.guard_operational_assignment('teaching_lecturer_id');
drop trigger if exists class_schedule_operational_lecturer on public.class_schedules;
create trigger class_schedule_operational_lecturer
before insert or update of lecturer_id on public.class_schedules
for each row execute function private.guard_operational_assignment('lecturer_id');
drop trigger if exists class_schedule_operational_second_lecturer on public.class_schedules;
create trigger class_schedule_operational_second_lecturer
before insert or update of lecturer_2_id on public.class_schedules
for each row execute function private.guard_operational_assignment('lecturer_2_id');
drop trigger if exists staff_shift_operational_assignee on public.staff_shifts;
create trigger staff_shift_operational_assignee
before insert or update of staff_id on public.staff_shifts
for each row execute function private.guard_operational_assignment('staff_id');
drop trigger if exists staff_shift_pattern_operational_assignee on public.staff_shift_patterns;
create trigger staff_shift_pattern_operational_assignee
before insert or update of staff_id on public.staff_shift_patterns
for each row execute function private.guard_operational_assignment('staff_id');
drop trigger if exists equipment_request_operational_responsible on public.equipment_requests;
create trigger equipment_request_operational_responsible
before insert or update of responsible_lecturer_id on public.equipment_requests
for each row execute function private.guard_operational_assignment('responsible_lecturer_id');

create or replace function public.list_operational_people()
returns table (id uuid, full_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles profiles
  where (select private.is_operationally_assignable(profiles.id))
    and ((select private.is_admin()) or exists (
      select 1 from public.profile_room_types viewer_scope
      join public.profile_room_types person_scope on person_scope.room_type_id = viewer_scope.room_type_id
      where viewer_scope.profile_id = (select auth.uid()) and person_scope.profile_id = profiles.id
    ))
  order by profiles.full_name;
end;
$$;

-- Shift assignment is a narrower directory than the generic active-person
-- lookup.  It shares the same Root-exclusion predicate used by the triggers,
-- so the UI can never offer an assignee that the database will reject.
create or replace function public.list_operational_shift_assignees()
returns table (id uuid, full_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (
      select 1 from public.user_roles roles
      where roles.user_id = profiles.id and roles.role in ('staff', 'admin')
    )
  order by profiles.full_name;
end;
$$;

-- Keep legacy role/scope directories aligned with the Root assignment guard.
-- These are used by schedule forms and spreadsheet import previews, so a Root
-- account must never be rendered as an operational choice only to fail later.
create or replace function public.list_scoped_lecturers(target_room_type_id uuid)
returns table (id uuid, full_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.has_room_type(target_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles as profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
    and exists (select 1 from public.profile_room_types assignments where assignments.profile_id = profiles.id and assignments.room_type_id = target_room_type_id)
  order by profiles.full_name;
end;
$$;

create or replace function public.list_scoped_import_lecturers(target_room_type_id uuid)
returns table (id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.can_import_schedules(target_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.email
  from public.profiles as profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
    and exists (select 1 from public.profile_room_types assignments where assignments.profile_id = profiles.id and assignments.room_type_id = target_room_type_id)
  order by profiles.full_name;
end;
$$;

create or replace function public.list_basic_medical_instructors()
returns table (id uuid, full_name text, title text)
language plpgsql stable security definer set search_path = '' as $$
declare basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if not (select private.has_room_type(basic_medical_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles as profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
    and exists (select 1 from public.profile_room_types assignments where assignments.profile_id = profiles.id and assignments.room_type_id = basic_medical_room_type_id)
  order by profiles.full_name;
end;
$$;

create or replace function public.list_import_lecturers()
returns table (id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.email
  from public.profiles profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
  order by profiles.full_name;
end;
$$;

-- Canonical one-session cancellation.  The registration-wide cancellation RPC
-- remains a separate explicit operation for historical compatibility.
create or replace function public.cancel_basic_medical_session(
  target_session_id uuid,
  target_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.basic_medical_registration_sessions%rowtype;
  schedule_id uuid;
  already_cancelled boolean;
  normalized_reason text;
begin
  if actor_id is null or not (select private.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  normalized_reason := nullif(btrim(coalesce(target_reason, '')), '');
  if normalized_reason is null then
    raise exception 'BASIC_MEDICAL_SESSION_CANCELLATION_REASON_REQUIRED' using errcode = '22023';
  end if;
  select sessions.* into session_row from public.basic_medical_registration_sessions sessions
  where sessions.id = target_session_id for update;
  if not found then raise exception 'BASIC_MEDICAL_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  select schedules.id, schedules.schedule_status = 'cancelled' into schedule_id, already_cancelled
  from public.class_schedules schedules where schedules.id = session_row.class_schedule_id for update;
  if not found then raise exception 'BASIC_MEDICAL_LINKED_SCHEDULE_INCONSISTENT' using errcode = 'P0001'; end if;
  if exists (select 1 from public.basic_medical_session_confirmations confirmations
    where confirmations.session_id = target_session_id and confirmations.invalidated_at is null) then
    raise exception 'BASIC_MEDICAL_SESSION_CONFIRMATION_INVALIDATION_REQUIRED' using errcode = '22023';
  end if;
  if already_cancelled then return jsonb_build_object('session_id', target_session_id, 'cancelled', true, 'idempotent', true); end if;
  -- The linked-schedule trigger rejects generic writes.  This transaction-local
  -- marker authorizes only this aggregate mutation and rolls back with it.
  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules set schedule_status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = actor_id
  where id = schedule_id;
  update public.basic_medical_registration_sessions set cancelled_at = clock_timestamp(), cancelled_by = actor_id,
    cancellation_reason = normalized_reason where id = target_session_id;
  perform private.enqueue_basic_medical_schedule_outbox_event(
    schedule_id, 'schedule_cancelled', actor_id, null
  );
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (actor_id, 'basic_medical.session_cancelled', 'basic_medical_registration_session', target_session_id,
    jsonb_build_object('registration_id', session_row.registration_id, 'schedule_id', schedule_id, 'reason', normalized_reason));
  return jsonb_build_object('session_id', target_session_id, 'cancelled', true, 'idempotent', false);
end;
$$;

-- Room-inventory writes are an auditable adjustment boundary.  Retain the
-- established function body (including the active target guard) and add the
-- reason guard without reintroducing an earlier implementation.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.set_basic_medical_room_inventory(uuid,uuid,uuid,integer,integer,boolean,text)'::regprocedure)
  into definition;
  if position('BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED' in definition) > 0 then return; end if;
  definition := replace(definition,
    E'begin\n  if actor_id is null',
    E'begin\n  if nullif(btrim(coalesce(target_note, '''')), '''') is null then\n    raise exception ''BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED'' using errcode = ''22023'';\n  end if;\n  if actor_id is null');
  if definition = pg_get_functiondef('public.set_basic_medical_room_inventory(uuid,uuid,uuid,integer,integer,boolean,text)'::regprocedure) then
    raise exception 'BASIC_MEDICAL_INVENTORY_REASON_GUARD_PATCH_FAILED';
  end if;
  execute definition;
end;
$$;

create or replace function public.invalidate_basic_medical_session_confirmation(
  target_confirmation_id uuid,
  target_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  confirmation_row public.basic_medical_session_confirmations%rowtype;
  actor_name text;
begin
  if actor_id is null or not (select private.is_admin()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(target_reason, '')), '') is null then raise exception 'BASIC_MEDICAL_CONFIRMATION_INVALIDATION_REASON_REQUIRED' using errcode = '22023'; end if;
  select * into confirmation_row from public.basic_medical_session_confirmations where id = target_confirmation_id for update;
  if not found then raise exception 'BASIC_MEDICAL_CONFIRMATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if confirmation_row.invalidated_at is not null then
    return jsonb_build_object('confirmation_id', target_confirmation_id, 'invalidated', true, 'idempotent', true);
  end if;
  select full_name into actor_name from public.profiles where id = actor_id;
  update public.basic_medical_session_confirmations set invalidated_at = clock_timestamp(), invalidated_by = actor_id,
    invalidated_by_name_snapshot = coalesce(nullif(btrim(actor_name), ''), 'Quản trị viên'),
    invalidated_reason = btrim(target_reason) where id = target_confirmation_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (actor_id, 'basic_medical.confirmation_invalidated', 'basic_medical_session_confirmation', target_confirmation_id,
    jsonb_build_object('session_id', confirmation_row.session_id, 'reason', btrim(target_reason)));
  return jsonb_build_object('confirmation_id', target_confirmation_id, 'invalidated', true, 'idempotent', false);
end;
$$;

create or replace function public.get_basic_medical_confirmation_evidence(target_confirmation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare evidence jsonb;
begin
  select jsonb_build_object(
    'confirmation_id', confirmations.id, 'registration_id_snapshot', confirmations.registration_id_snapshot,
    'class_schedule_id_snapshot', confirmations.class_schedule_id_snapshot, 'signer_id', confirmations.signer_id,
    'signature_data', confirmations.signature_data, 'schedule_date_snapshot', confirmations.schedule_date_snapshot,
    'start_time_snapshot', confirmations.start_time_snapshot, 'end_time_snapshot', confirmations.end_time_snapshot,
    'room_id_snapshot', confirmations.room_id_snapshot, 'teaching_lecturer_id_snapshot', confirmations.teaching_lecturer_id_snapshot,
    'course_code_snapshot', confirmations.course_code_snapshot, 'course_name_snapshot', confirmations.course_name_snapshot,
    'room_code_snapshot', confirmations.room_code_snapshot, 'building_code_snapshot', confirmations.building_code_snapshot,
    'room_name_snapshot', confirmations.room_name_snapshot, 'teaching_lecturer_name_snapshot', confirmations.teaching_lecturer_name_snapshot,
    'signer_name_snapshot', confirmations.signer_name_snapshot,
    'display_snapshots_available', confirmations.course_code_snapshot is not null and confirmations.course_name_snapshot is not null
      and confirmations.room_code_snapshot is not null and confirmations.building_code_snapshot is not null
      and confirmations.teaching_lecturer_name_snapshot is not null and confirmations.signer_name_snapshot is not null,
    'signed_at', confirmations.signed_at, 'invalidated_at', confirmations.invalidated_at,
    'invalidated_by', confirmations.invalidated_by, 'invalidated_by_name_snapshot', confirmations.invalidated_by_name_snapshot,
    'invalidated_reason', confirmations.invalidated_reason,
    'equipment_checks', coalesce((select jsonb_agg(jsonb_build_object(
      'inventory_id', checks.inventory_id, 'item_name_snapshot', checks.item_name_snapshot,
      'commercial_name_snapshot', checks.commercial_name_snapshot, 'unit_snapshot', checks.unit_snapshot,
      'total_before', checks.total_before, 'good_before', checks.good_before, 'damaged_before', checks.damaged_before,
      'newly_damaged_quantity', checks.newly_damaged_quantity, 'total_after', checks.total_before,
      'good_after', checks.good_after, 'damaged_after', checks.damaged_after
    ) order by checks.item_name_snapshot, checks.inventory_id) from public.basic_medical_session_equipment_checks checks
    where checks.confirmation_id = confirmations.id), '[]'::jsonb)
  ) into evidence
  from public.basic_medical_session_confirmations confirmations
  where confirmations.id = target_confirmation_id
    and (select private.can_view_basic_medical_registration(confirmations.registration_id_snapshot));
  if evidence is null then raise exception 'CONFIRMATION_EVIDENCE_NOT_FOUND' using errcode = 'P0002'; end if;
  return evidence;
end;
$$;

-- Staff must be explicitly granted this narrow capability; the role alone is insufficient.
alter table public.profiles add column if not exists can_manage_email_notifications boolean not null default false;
create or replace function private.can_manage_email_notifications()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id and r.role = 'staff'
    where p.id = (select auth.uid()) and p.can_manage_email_notifications
  );
$$;
create or replace function public.set_personnel_email_notification_capability(target_user_id uuid, target_enabled boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_access_version integer;
begin
  if not (select private.is_admin()) then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles where user_id = target_user_id and role = 'staff') then
    raise exception 'EMAIL_NOTIFICATION_CAPABILITY_STAFF_REQUIRED' using errcode = '22023';
  end if;
  update public.profiles set can_manage_email_notifications = target_enabled, access_version = access_version + 1
  where id = target_user_id returning access_version into new_access_version;
  if not found then raise exception 'PERSONNEL_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), 'personnel.email_notification_capability_changed', 'profile', target_user_id,
    jsonb_build_object('enabled', target_enabled));
  return new_access_version;
end;
$$;
drop policy if exists email_notifications_admin_select on public.email_notifications;
create policy email_notifications_manager_select on public.email_notifications for select to authenticated
using ((select private.can_manage_email_notifications()));

-- Durable saga state for password changes.  Values deliberately contain no
-- password, reset value, Auth token, or provider secret.
create table if not exists public.personnel_password_operations (
  id uuid primary key default gen_random_uuid(), target_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict, action text not null check (action in ('password_reset','password_changed_by_root')),
  status text not null check (status in ('reserved','auth_update_started','auth_updated','committed','auth_failed','reconciliation_required','resolved','rolled_back')),
  correlation_id uuid not null default gen_random_uuid(), created_at timestamptz not null default clock_timestamp(),
  auth_updated_at timestamptz, committed_at timestamptz, resolved_at timestamptz, last_error text
);
create table if not exists private.personnel_password_auth_evidence (
  operation_id uuid primary key references public.personnel_password_operations(id) on delete cascade,
  auth_password_hash_before text not null,
  auth_update_started_at timestamptz
);
revoke all on private.personnel_password_auth_evidence from public, anon, authenticated;
alter table public.personnel_password_operations enable row level security;
revoke all on public.personnel_password_operations from public, anon, authenticated;

drop index if exists public.personnel_password_operations_one_active_target;
create unique index personnel_password_operations_one_active_target
on public.personnel_password_operations(target_user_id)
where status in ('reserved', 'auth_update_started', 'auth_updated', 'reconciliation_required');

create or replace function private.assert_personnel_password_operation_service()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'PASSWORD_OPERATION_SERVICE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.reserve_personnel_password_operation(target_user_id uuid, target_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor record;
  operation_id uuid;
begin
  if target_action not in ('password_reset','password_changed_by_root') then raise exception 'INVALID_PASSWORD_OPERATION' using errcode = '22023'; end if;
  select * into actor from private.assert_personnel_password_target(target_user_id, target_action = 'password_changed_by_root');
  if not exists (select 1 from auth.users where id = target_user_id and (raw_app_meta_data ->> 'provider' = 'email' or raw_app_meta_data -> 'providers' ? 'email') and encrypted_password is not null) then
    raise exception 'PASSWORD_CHANGE_NOT_AVAILABLE' using errcode = '22023';
  end if;
  insert into public.personnel_password_operations(target_user_id, actor_id, action, status)
  values(target_user_id, actor.actor_id, target_action, 'reserved') returning id into operation_id;
  insert into private.personnel_password_auth_evidence(operation_id, auth_password_hash_before)
  values(operation_id, (select encrypted_password from auth.users where id = target_user_id));
  return operation_id;
end;
$$;

-- This durable marker is written before the non-transactional Auth call.  If
-- the later result write fails, reconciliation compares the current Auth hash
-- with this pre-call evidence without retaining password material.
create or replace function public.begin_personnel_password_auth_update(target_operation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare operation public.personnel_password_operations%rowtype;
begin
  perform private.assert_personnel_password_operation_service();
  select * into operation from public.personnel_password_operations where id = target_operation_id for update;
  if not found then raise exception 'PASSWORD_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation.status <> 'reserved' or not exists (select 1 from private.personnel_password_auth_evidence where operation_id = target_operation_id) then
    raise exception 'PASSWORD_OPERATION_STATE_INVALID' using errcode = '22023';
  end if;
  update public.personnel_password_operations
  set status = 'auth_update_started', last_error = null
  where id = target_operation_id;
  update private.personnel_password_auth_evidence set auth_update_started_at = clock_timestamp()
  where operation_id = target_operation_id;
end;
$$;

create or replace function public.record_personnel_password_auth_result(target_operation_id uuid, target_auth_succeeded boolean, target_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  operation public.personnel_password_operations%rowtype;
begin
  perform private.assert_personnel_password_operation_service();
  select * into operation from public.personnel_password_operations where id = target_operation_id for update;
  if not found then raise exception 'PASSWORD_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation.status <> 'auth_update_started' then raise exception 'PASSWORD_OPERATION_STATE_INVALID' using errcode = '22023'; end if;
  update public.personnel_password_operations set status = case when target_auth_succeeded then 'auth_updated' else 'auth_failed' end,
    auth_updated_at = case when target_auth_succeeded then clock_timestamp() else null end,
    last_error = case when target_auth_succeeded then null else nullif(btrim(coalesce(target_error, '')), '') end
  where id = target_operation_id;
  if not target_auth_succeeded then
    delete from private.personnel_password_auth_evidence where operation_id = target_operation_id;
  end if;
end;
$$;

create or replace function public.commit_personnel_password_operation(target_operation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  operation public.personnel_password_operations%rowtype;
begin
  perform private.assert_personnel_password_operation_service();
  select * into operation from public.personnel_password_operations where id = target_operation_id for update;
  if not found then raise exception 'PASSWORD_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation.status <> 'auth_updated' then raise exception 'PASSWORD_OPERATION_STATE_INVALID' using errcode = '22023'; end if;
  if operation.action = 'password_reset' then
    update public.profiles set must_change_password = true, must_change_password_hash = (select md5(encrypted_password) from auth.users where id = operation.target_user_id) where id = operation.target_user_id;
  end if;
  update public.personnel_password_operations set status = 'committed', committed_at = clock_timestamp() where id = target_operation_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata) values
    (operation.actor_id, operation.action, 'profile', operation.target_user_id, jsonb_build_object('result', 'committed', 'operation_id', target_operation_id, 'correlation_id', operation.correlation_id));
  delete from private.personnel_password_auth_evidence where operation_id = target_operation_id;
end;
$$;

create or replace function public.mark_personnel_password_reconciliation_required(target_operation_id uuid, target_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  operation public.personnel_password_operations%rowtype;
begin
  perform private.assert_personnel_password_operation_service();
  select * into operation from public.personnel_password_operations where id = target_operation_id for update;
  if not found then raise exception 'PASSWORD_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation.status not in ('reserved','auth_update_started','auth_updated') then raise exception 'PASSWORD_OPERATION_STATE_INVALID' using errcode = '22023'; end if;
  update public.personnel_password_operations set status = 'reconciliation_required', last_error = nullif(btrim(coalesce(target_error, '')), '') where id = target_operation_id;
end;
$$;

-- Retry only a durably recorded completed Auth phase; no password material is
-- accepted, stored, or re-sent by this reconciliation operation.
create or replace function public.reconcile_personnel_password_operation(target_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare operation public.personnel_password_operations%rowtype; current_auth_hash text; evidence private.personnel_password_auth_evidence%rowtype;
begin
  perform private.assert_personnel_password_operation_service();
  select * into operation from public.personnel_password_operations where id = target_operation_id for update;
  if not found then raise exception 'PASSWORD_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation.status in ('reserved','auth_update_started','reconciliation_required') and operation.auth_updated_at is null then
    select * into evidence from private.personnel_password_auth_evidence where operation_id = target_operation_id for update;
    if evidence.operation_id is null then raise exception 'PASSWORD_OPERATION_RECONCILIATION_UNSAFE' using errcode = '22023'; end if;
    select encrypted_password into current_auth_hash from auth.users where id = operation.target_user_id;
    if current_auth_hash is not distinct from evidence.auth_password_hash_before then
      update public.personnel_password_operations set status = 'auth_failed', resolved_at = clock_timestamp(),
        last_error = coalesce(last_error, 'auth_update_not_observed') where id = target_operation_id;
      delete from private.personnel_password_auth_evidence where operation_id = target_operation_id;
      return jsonb_build_object('operation_id', target_operation_id, 'outcome', 'auth_failed');
    end if;
    update public.personnel_password_operations set status = 'auth_updated', auth_updated_at = clock_timestamp(),
      last_error = coalesce(last_error, 'auth_result_reconciled_from_pre_auth_evidence') where id = target_operation_id;
    select * into operation from public.personnel_password_operations where id = target_operation_id;
  end if;
  if operation.status not in ('auth_updated','reconciliation_required') or operation.auth_updated_at is null then
    raise exception 'PASSWORD_OPERATION_RECONCILIATION_UNSAFE' using errcode = '22023';
  end if;
  if operation.action = 'password_reset' then
    update public.profiles set must_change_password = true,
      must_change_password_hash = (select md5(encrypted_password) from auth.users where id = operation.target_user_id)
    where id = operation.target_user_id;
  end if;
  update public.personnel_password_operations
  set status = 'committed', committed_at = clock_timestamp(), resolved_at = clock_timestamp(), last_error = null
  where id = target_operation_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata) values
    (operation.actor_id, operation.action, 'profile', operation.target_user_id,
      jsonb_build_object('result', 'reconciled', 'operation_id', target_operation_id, 'correlation_id', operation.correlation_id));
  delete from private.personnel_password_auth_evidence where operation_id = target_operation_id;
  return jsonb_build_object('operation_id', target_operation_id, 'outcome', 'committed');
end;
$$;

-- Fail deployment rather than silently turning zero/negative legacy capacities
-- into another value.
do $$ begin
  if exists (select 1 from public.rooms where capacity is not null and capacity < 1) then
    raise exception 'rooms capacity preflight failed: existing non-null capacity must be >= 1' using errcode = '23514';
  end if;
end $$;
alter table public.rooms drop constraint if exists rooms_capacity_real_or_unknown;
alter table public.rooms add constraint rooms_capacity_real_or_unknown check (capacity is null or capacity >= 1);

create or replace function private.assert_catalog_room_capacity(target_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin if target_capacity is not null and target_capacity < 1 then raise exception 'INVALID_ROOM_CAPACITY' using errcode = '22023'; end if; end;
$$;

-- Override the existing room mutation entry points so every server path shares
-- the same boundary (the table constraint remains the final line of defence).
create or replace function public.update_catalog_room(target_id uuid, target_room_code text, target_building_code text, target_room_name text, target_capacity integer, target_room_type_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_room public.rooms%rowtype;
begin
  perform private.assert_catalog_batch_ids(array[target_id]); perform private.assert_catalog_room_capacity(target_capacity);
  select * into current_room from public.rooms where id = target_id for update; if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if nullif(btrim(target_room_code), '') is null or nullif(btrim(target_building_code), '') is null then raise exception 'INVALID_ROOM_VALUES' using errcode = '22023'; end if;
  if not exists (select 1 from public.room_types where id = target_room_type_id and is_active) then raise exception 'INVALID_ROOM_TYPE' using errcode = '22023'; end if;
  if current_room.room_type_id is distinct from target_room_type_id and (exists (select 1 from public.class_schedules where room_id = target_id) or exists (select 1 from public.basic_medical_registrations where room_id = target_id) or exists (select 1 from public.basic_medical_room_inventory where room_id = target_id)) then raise exception 'ROOM_TYPE_CHANGE_HAS_HISTORY' using errcode = '23503'; end if;
  update public.rooms set room_code=btrim(target_room_code), building_code=btrim(target_building_code), room_name=nullif(btrim(target_room_name), ''), capacity=target_capacity, room_type_id=target_room_type_id where id=target_id;
end; $$;

-- A condition adjustment is an accountable operational event.  The existing
-- UI already requires a reason; enforce the same rule for direct RPC callers.
create or replace function public.adjust_basic_medical_inventory_condition(
  target_inventory_id uuid,
  target_good_quantity integer,
  target_damaged_quantity integer,
  target_note text default null
)
returns public.basic_medical_room_inventory
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  current_row public.basic_medical_room_inventory;
  changed_row public.basic_medical_room_inventory;
begin
  if actor_id is null or not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(target_note, '')), '') is null then
    raise exception 'BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into current_row from public.basic_medical_room_inventory where id = target_inventory_id for update;
  if current_row.id is null then raise exception 'BASIC_MEDICAL_INVENTORY_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_good_quantity is null or target_damaged_quantity is null or target_good_quantity < 0 or target_damaged_quantity < 0 or target_good_quantity + target_damaged_quantity <> current_row.total_quantity then
    raise exception 'BASIC_MEDICAL_INVENTORY_QUANTITY_INVALID' using errcode = '22023';
  end if;
  update public.basic_medical_room_inventory
  set good_quantity = target_good_quantity, damaged_quantity = target_damaged_quantity,
      last_damage_reporter_id = case when target_damaged_quantity > current_row.damaged_quantity then actor_id else last_damage_reporter_id end,
      last_damage_reported_at = case when target_damaged_quantity > current_row.damaged_quantity then clock_timestamp() else last_damage_reported_at end
  where id = target_inventory_id returning * into changed_row;
  if (current_row.good_quantity, current_row.damaged_quantity) is distinct from (changed_row.good_quantity, changed_row.damaged_quantity) then
    insert into public.basic_medical_equipment_condition_logs (
      inventory_id, event_type, total_before, good_before, damaged_before,
      total_after, good_after, damaged_after, quantity_delta, actor_id, note
    ) values (
      changed_row.id, 'condition_adjustment', current_row.total_quantity,
      current_row.good_quantity, current_row.damaged_quantity,
      changed_row.total_quantity, changed_row.good_quantity, changed_row.damaged_quantity,
      changed_row.damaged_quantity - current_row.damaged_quantity, actor_id, btrim(target_note)
    );
  end if;
  return changed_row;
end;
$$;

revoke all on function private.is_operationally_assignable(uuid), private.assert_operationally_assignable(uuid), private.guard_operational_assignment(), private.can_manage_email_notifications(), private.assert_catalog_room_capacity(integer), private.assert_personnel_password_operation_service() from public, anon, authenticated;
revoke all on function public.cancel_basic_medical_session(uuid,text), public.invalidate_basic_medical_session_confirmation(uuid,text), public.list_operational_people(), public.list_operational_shift_assignees(), public.reserve_personnel_password_operation(uuid,text), public.begin_personnel_password_auth_update(uuid), public.record_personnel_password_auth_result(uuid,boolean,text), public.commit_personnel_password_operation(uuid), public.mark_personnel_password_reconciliation_required(uuid,text), public.reconcile_personnel_password_operation(uuid) from public, anon, authenticated;
revoke all on function public.set_personnel_email_notification_capability(uuid,boolean) from public, anon;
grant execute on function public.cancel_basic_medical_session(uuid,text), public.invalidate_basic_medical_session_confirmation(uuid,text), public.list_operational_people(), public.list_operational_shift_assignees(), public.reserve_personnel_password_operation(uuid,text), public.set_personnel_email_notification_capability(uuid,boolean) to authenticated;
grant execute on function public.begin_personnel_password_auth_update(uuid), public.record_personnel_password_auth_result(uuid,boolean,text), public.commit_personnel_password_operation(uuid), public.mark_personnel_password_reconciliation_required(uuid,text), public.reconcile_personnel_password_operation(uuid) to service_role;
