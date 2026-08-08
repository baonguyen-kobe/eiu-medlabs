-- Migration: TB-06 Transactional Destructive Equipment Request Lifecycle
-- Enforces soft cancellation for ordinary Admin/Staff/Registrant, pre-delete transactional outbox,
-- exactly-once TB-06 outbox events, and blocks direct physical DELETE bypass on equipment_requests.

-- 1. Allow 'cancelled' status in equipment_requests_status_check constraint
alter table public.equipment_requests
  drop constraint if exists equipment_requests_status_check;

alter table public.equipment_requests
  add constraint equipment_requests_status_check
  check (status in ('new', 'preparing', 'handed_over', 'returned', 'completed', 'cancelled'));

-- Force RLS on equipment_requests so direct DELETE bypass is closed even for table owner context
alter table public.equipment_requests enable row level security;
alter table public.equipment_requests force row level security;

-- 2. Revoke generic direct DELETE from authenticated users to close browser bypass
drop policy if exists equipment_requests_delete on public.equipment_requests;
create policy equipment_requests_delete on public.equipment_requests
  for delete to authenticated using (false);

revoke delete on public.equipment_requests from authenticated, anon, public;
grant delete on public.equipment_requests to service_role;

-- 3. Create or replace soft_cancel_equipment_request RPC
create or replace function public.soft_cancel_equipment_request(
  target_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  req_row public.equipment_requests;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into req_row
  from public.equipment_requests
  where id = target_request_id
  for update;

  if req_row.id is null then
    return false;
  end if;

  if not (
    req_row.registrant_id = actor_id
    or req_row.created_by = actor_id
    or (select private.can_manage_equipment_request(target_request_id))
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Idempotent check
  if req_row.status = 'cancelled' then
    return true;
  end if;

  -- Allow update by setting RPC flag
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  -- Update status to cancelled
  update public.equipment_requests
  set status = 'cancelled'
  where id = target_request_id;

  -- Insert audit log
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (actor_id, 'equipment_request.cancelled', 'equipment_request', target_request_id);

  -- Enqueue TB-06 outbox event in the same transaction
  perform private.enqueue_equipment_request_outbox_event(target_request_id, 'deleted', actor_id);

  return true;
end;
$$;

revoke all on function public.soft_cancel_equipment_request(uuid) from public, anon;
grant execute on function public.soft_cancel_equipment_request(uuid) to authenticated;

-- 4. Create or replace hard_delete_equipment_request RPC
create or replace function public.hard_delete_equipment_request(
  target_request_id uuid
)
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
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;

  select * into req_row
  from public.equipment_requests
  where id = target_request_id
  for update;

  if req_row.id is null then
    return false;
  end if;

  -- Enqueue pre-delete TB-06 outbox snapshot in the same transaction before deleting
  perform private.enqueue_equipment_request_outbox_event(target_request_id, 'deleted', actor_id);

  -- Delete exclusive child items
  delete from public.equipment_request_items where request_id = target_request_id;

  -- Delete parent request
  delete from public.equipment_requests where id = target_request_id;
  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id)
    values (actor_id, 'equipment_request.hard_deleted', 'equipment_request', target_request_id);
  end if;

  return deleted_count > 0;
end;
$$;

revoke all on function public.hard_delete_equipment_request(uuid) from public, anon;
grant execute on function public.hard_delete_equipment_request(uuid) to authenticated;
