-- Ninth follow-up + Remaining Workflows hardening
-- Covers: N-HIGH-01, CF-HIGH-01, CF-HIGH-02, IMP-HIGH-01, EQ-HIGH-04,
--         N-MEDIUM-02 (concurrency), can_hard_delete, import RPC-only,
--         email queue cleanup, CSV formula injection helper.

-------------------------------------------------------------------------------
-- 1. Expand Basic Medical linked-schedule guard to cover INSERT
--    Previously only BEFORE UPDATE OR DELETE. Now also blocks direct INSERT
--    of a row whose basic_medical_registration_id is non-null, and UPDATE
--    that turns an ordinary schedule into a linked one.
-------------------------------------------------------------------------------
create or replace function private.guard_basic_medical_linked_schedule_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Guard INSERT: reject if new row is already linked to a registration
  if tg_op = 'INSERT' then
    if new.basic_medical_registration_id is not null
      and current_setting('app.basic_medical_registration_mutation', true) is distinct from 'true'
    then
      raise exception 'BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Guard UPDATE: reject if old OR new row is linked
  if tg_op = 'UPDATE' then
    if (
      old.basic_medical_registration_id is not null
      or new.basic_medical_registration_id is not null
    ) and current_setting('app.basic_medical_registration_mutation', true) is distinct from 'true'
    then
      raise exception 'BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Guard DELETE: reject if the row being removed is linked
  if tg_op = 'DELETE' then
    if old.basic_medical_registration_id is not null
      and current_setting('app.basic_medical_registration_mutation', true) is distinct from 'true'
    then
      raise exception 'BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED' using errcode = '42501';
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_basic_medical_linked_schedule_mutation() from public, anon, authenticated;

-- Recreate trigger to fire on INSERT OR UPDATE OR DELETE
drop trigger if exists guard_basic_medical_linked_schedule_mutation on public.class_schedules;
create trigger guard_basic_medical_linked_schedule_mutation
before insert or update or delete on public.class_schedules
for each row execute function private.guard_basic_medical_linked_schedule_mutation();

-------------------------------------------------------------------------------
-- 2. Equipment requests: change class_schedule_id FK from CASCADE → RESTRICT
--    Prevents deleting a class schedule from silently removing Equipment
--    Requests that belong to it.
-------------------------------------------------------------------------------
alter table public.equipment_requests
  drop constraint if exists equipment_requests_class_schedule_id_fkey;
alter table public.equipment_requests
  add constraint equipment_requests_class_schedule_id_fkey
    foreign key (class_schedule_id) references public.class_schedules(id)
    on delete restrict deferrable initially deferred;

-------------------------------------------------------------------------------
-- 3. Central hard-delete authority
--    Returns true only for Root Administrator and the designated secondary
--    principal (personnel manager / Bảo).  All hard-delete RPCs must call
--    this function instead of scattering email-based checks.
-------------------------------------------------------------------------------
create or replace function private.can_hard_delete()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.system_security_principals principals
    where principals.singleton
      and (
        principals.root_admin_id = (select auth.uid())
        or principals.personnel_manager_id = (select auth.uid())
      )
  );
$$;
revoke all on function private.can_hard_delete() from public, anon, authenticated;
grant execute on function private.can_hard_delete() to authenticated;

-------------------------------------------------------------------------------
-- 4. Fix record_import_validation_row to accept conflict and system_error
--    Previously the function rejected these two statuses with an exception,
--    causing any conflict or system-error row to turn the whole batch fatal.
-------------------------------------------------------------------------------
create or replace function public.record_import_validation_row(
  target_batch_id uuid,
  target_row_number integer,
  target_hash text,
  target_raw jsonb,
  target_normalized jsonb,
  target_status public.import_row_status,
  target_errors jsonb,
  target_warnings jsonb
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

  select batches.room_type_id
  into batch_room_type_id
  from public.import_batches batches
  where batches.id = target_batch_id
    and batches.created_by = caller_id
    and batches.status = 'importing';

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
    target_status, coalesce(target_errors, '[]'::jsonb),
    coalesce(target_warnings, '[]'::jsonb)
  )
  returning id into row_id;

  return row_id;
end;
$$;
revoke all on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) from public, anon;
grant execute on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) to authenticated;

-------------------------------------------------------------------------------
-- 5. finalize_import_batch: RPC computes counts from DB instead of trusting
--    client-supplied numbers. Revoke direct import_batches UPDATE from
--    authenticated so the browser cannot forge status or row counts.
-------------------------------------------------------------------------------
create or replace function public.finalize_import_batch(
  target_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  batch_room_type_id uuid;
  imported_count integer;
  warning_count integer;
  error_count integer;
  duplicate_count integer;
  conflict_count integer;
  system_error_count integer;
  total_count integer;
  new_status text;
begin
  -- Verify ownership and current state
  select batches.room_type_id
  into batch_room_type_id
  from public.import_batches batches
  where batches.id = target_batch_id
    and batches.created_by = caller_id
    and batches.status = 'importing';

  if batch_room_type_id is null then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;
  if not (select private.can_import_schedules(batch_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  -- Count from DB — do not trust client numbers
  select
    count(*) filter (where validation_status = 'imported'),
    count(*) filter (where validation_status = 'warning'),
    count(*) filter (where validation_status = 'error'),
    count(*) filter (where validation_status = 'duplicate'),
    count(*) filter (where validation_status = 'conflict'),
    count(*) filter (where validation_status = 'system_error'),
    count(*)
  into imported_count, warning_count, error_count, duplicate_count, conflict_count, system_error_count, total_count
  from public.import_rows
  where import_batch_id = target_batch_id;

  new_status := case
    when imported_count + warning_count > 0 then
      case when error_count + duplicate_count + conflict_count + system_error_count > 0
        then 'completed_with_errors' else 'completed' end
    else 'failed'
  end;

  update public.import_batches
  set status = new_status::public.import_status,
      imported_rows = imported_count + warning_count,
      error_rows = error_count,
      warning_rows = warning_count,
      duplicate_rows = duplicate_count,
      conflict_rows = conflict_count,
      completed_at = clock_timestamp()
  where id = target_batch_id;

  return jsonb_build_object(
    'status', new_status,
    'imported', imported_count + warning_count,
    'warnings', warning_count,
    'errors', error_count,
    'duplicates', duplicate_count,
    'conflicts', conflict_count,
    'system_errors', system_error_count,
    'total', total_count
  );
end;
$$;
revoke all on function public.finalize_import_batch(uuid) from public, anon;
grant execute on function public.finalize_import_batch(uuid) to authenticated;

-- Revoke direct UPDATE on import_batches.status and row-count columns from
-- authenticated; the application must call finalize_import_batch instead.
-- INSERT (to create batches) and SELECT are still needed.
drop policy if exists import_batches_scoped_update on public.import_batches;

-- Revoke direct UPDATE on import_rows from authenticated; rows must be written
-- only through create_import_schedule_row and record_import_validation_row.
revoke update on public.import_rows from authenticated;

-------------------------------------------------------------------------------
-- 6. Reconciliation concurrency: claim/lease prevents two workers from
--    processing the same operation simultaneously.
--    Adds reconcile_started_at, reconcile_lease_expires_at, reconcile_worker_id
--    and a new 'reconciling' status value.
--    claim_personnel_reconciliation_batch atomically claims rows with
--    FOR UPDATE SKIP LOCKED so parallel workers never see the same operation.
-------------------------------------------------------------------------------
alter table public.personnel_update_operations
  add column if not exists reconcile_started_at timestamptz,
  add column if not exists reconcile_lease_expires_at timestamptz,
  add column if not exists reconcile_worker_id text;

-- Extend status check constraint to include 'reconciling' (used while a
-- worker holds the claim lease).
alter table public.personnel_update_operations
  drop constraint if exists personnel_update_operations_status_check;
alter table public.personnel_update_operations
  add constraint personnel_update_operations_status_check check (
    status in (
      'reserved', 'auth_updated', 'committed', 'rollback_required',
      'rolled_back', 'reconciliation_required', 'expired', 'reconciling'
    )
  );

-- Grant SELECT on import tables to service_role so integration tests and
-- internal monitoring can read batch/row state without going through REST.
grant select on public.import_batches to service_role;
grant select on public.import_rows to service_role;

-- Extend reconcile index to include the new status
drop index if exists public.personnel_update_operations_reconcile_idx;
create index personnel_update_operations_reconcile_idx
  on public.personnel_update_operations(status, expires_at)
  where status in ('reserved', 'auth_updated', 'rollback_required',
                   'reconciliation_required', 'reconciling');

-- Atomic claim RPC: sets status = reconciling and records lease
-- Returns claimed operations so the worker can process them without
-- keeping an open Postgres transaction across the external Auth API calls.
create or replace function public.claim_personnel_reconciliation_batch(
  target_limit integer default 10,
  target_worker_id text default null,
  target_lease_seconds integer default 300
)
returns table (
  id uuid,
  profile_id uuid,
  previous_email text,
  requested_email text,
  expected_version integer,
  prior_status text,
  expires_at timestamptz,
  actor_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts timestamptz := clock_timestamp();
  worker_id text := coalesce(nullif(btrim(coalesce(target_worker_id, '')), ''), gen_random_uuid()::text);
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_limit is null or target_limit < 1 or target_limit > 100 then
    raise exception 'INVALID_BATCH_LIMIT' using errcode = '22023';
  end if;
  if target_lease_seconds is null or target_lease_seconds < 30 or target_lease_seconds > 3600 then
    raise exception 'INVALID_LEASE_SECONDS' using errcode = '22023';
  end if;

  return query
  with claimed as (
    update public.personnel_update_operations ops
    set status = 'reconciling',
        reconcile_started_at = now_ts,
        reconcile_lease_expires_at = now_ts + (target_lease_seconds || ' seconds')::interval,
        reconcile_worker_id = worker_id
    where ops.id in (
      select sub.id
      from public.personnel_update_operations sub
      where sub.status in ('reserved', 'auth_updated', 'rollback_required', 'reconciliation_required')
        and sub.expires_at <= now_ts
        and (sub.reconcile_lease_expires_at is null or sub.reconcile_lease_expires_at < now_ts)
      order by sub.created_at
      limit target_limit
      for update skip locked
    )
    returning ops.id, ops.profile_id, ops.previous_email, ops.requested_email,
              ops.expected_version, ops.status as prior_status, ops.expires_at, ops.actor_id
  )
  select claimed.id, claimed.profile_id, claimed.previous_email, claimed.requested_email,
         claimed.expected_version, claimed.prior_status, claimed.expires_at, claimed.actor_id
  from claimed;
end;
$$;
revoke all on function public.claim_personnel_reconciliation_batch(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_personnel_reconciliation_batch(integer, text, integer) to service_role;

-- Allow resolve_personnel_update_operation to also accept 'reconciling' as
-- current status (a claimed-but-not-yet-resolved operation).
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
    and status in ('reserved','auth_updated','rollback_required','reconciliation_required','reconciling');
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;
revoke all on function public.resolve_personnel_update_operation(uuid,text,text) from public, anon, authenticated;
grant execute on function public.resolve_personnel_update_operation(uuid,text,text) to service_role;

-------------------------------------------------------------------------------
-- 7. Equipment request items: revoke generic direct DML, create RPC paths
--    Drops the equipment_items_manage for-all policy and replaces it with
--    SELECT only. All writes must go through official RPCs:
--      add_equipment_request_item  (Admin/Staff only, status new/preparing)
--      remove_equipment_request_item (Admin/Staff or registrant, status new/preparing)
--    Full edit (save_equipment_request) remains the existing Server Action
--    path; its direct DML is already guarded by the existing update policies
--    on equipment_requests. Items within a full-save RPC are transactional
--    with the parent update and handled by security definer functions.
-------------------------------------------------------------------------------
-- Drop the broad for-all policy; the existing equipment_items_select policy
-- (for select only) remains intact and provides read access.
drop policy if exists equipment_items_manage on public.equipment_request_items;

create or replace function public.add_equipment_request_item(
  target_request_id uuid,
  target_skill_name text,
  target_catalog_item_id uuid,
  target_quantity integer,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_status text;
  new_item_id uuid;
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'ADMIN_OR_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(target_skill_name, '')), '') is null then
    raise exception 'INVALID_SKILL_NAME' using errcode = '22023';
  end if;
  if target_quantity is null or target_quantity < 1 or target_quantity > 9999 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  select r.status into request_status
  from public.equipment_requests r
  where r.id = target_request_id
    and (select private.can_manage_equipment_request(r.id))
  for update;

  if request_status is null then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request_status not in ('new', 'preparing') then
    raise exception 'EQUIPMENT_REQUEST_NOT_EDITABLE' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.equipment_catalog where id = target_catalog_item_id and is_active
  ) then
    raise exception 'CATALOG_ITEM_INACTIVE_OR_MISSING' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.equipment_request_items
    where request_id = target_request_id
      and skill_name = btrim(target_skill_name)
  ) then
    raise exception 'SKILL_NOT_FOUND_IN_REQUEST' using errcode = 'P0002';
  end if;

  insert into public.equipment_request_items (request_id, skill_name, catalog_item_id, quantity, note)
  values (
    target_request_id,
    btrim(target_skill_name),
    target_catalog_item_id,
    target_quantity,
    nullif(btrim(coalesce(target_note, '')), '')
  )
  returning id into new_item_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id, 'equipment_request.item_added', 'equipment_request', target_request_id,
    jsonb_build_object('item_id', new_item_id, 'catalog_item_id', target_catalog_item_id,
      'skill_name', btrim(target_skill_name), 'quantity', target_quantity)
  );

  return new_item_id;
end;
$$;
revoke all on function public.add_equipment_request_item(uuid, text, uuid, integer, text) from public, anon;
grant execute on function public.add_equipment_request_item(uuid, text, uuid, integer, text) to authenticated;

create or replace function public.remove_equipment_request_item(
  target_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_id_val uuid;
  request_status text;
  deleted_count integer;
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select r.id, r.status into request_id_val, request_status
  from public.equipment_request_items items
  join public.equipment_requests r on r.id = items.request_id
  where items.id = target_item_id
    and (
      r.registrant_id = actor_id
      or (select private.can_manage_equipment_request(r.id))
    )
  for update of r;

  if request_id_val is null then
    raise exception 'EQUIPMENT_REQUEST_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request_status not in ('new', 'preparing') then
    raise exception 'EQUIPMENT_REQUEST_NOT_EDITABLE' using errcode = '42501';
  end if;

  delete from public.equipment_request_items where id = target_item_id;
  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_id, 'equipment_request.item_removed', 'equipment_request', request_id_val,
      jsonb_build_object('item_id', target_item_id)
    );
  end if;

  return deleted_count = 1;
end;
$$;
revoke all on function public.remove_equipment_request_item(uuid) from public, anon;
grant execute on function public.remove_equipment_request_item(uuid) to authenticated;

-------------------------------------------------------------------------------
-- 8. Email queue cleanup: Root/Bảo can hard-delete pending/suppressed/failed/
--    simulated notifications. Processing and sent records are protected.
-------------------------------------------------------------------------------
create or replace function public.admin_delete_email_notifications(
  target_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;
  if target_ids is null or cardinality(target_ids) = 0 or cardinality(target_ids) > 200 then
    raise exception 'INVALID_NOTIFICATION_IDS' using errcode = '22023';
  end if;

  delete from public.email_notifications
  where id = any(target_ids)
    and status in ('pending', 'suppressed', 'failed', 'simulated');
  get diagnostics deleted_count = row_count;

  insert into public.audit_logs (actor_id, action, entity_type, metadata)
  values (actor_id, 'email_notifications.bulk_deleted', 'email_notifications',
    jsonb_build_object('requested_count', cardinality(target_ids), 'deleted_count', deleted_count));

  return deleted_count;
end;
$$;
revoke all on function public.admin_delete_email_notifications(uuid[]) from public, anon;
grant execute on function public.admin_delete_email_notifications(uuid[]) to authenticated;
