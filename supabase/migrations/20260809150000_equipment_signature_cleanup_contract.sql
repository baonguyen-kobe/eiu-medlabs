alter table public.equipment_signature_operations
  add column cleanup_state text not null default 'none' check (cleanup_state in ('none','claimed','retry','deleted','missing')),
  add column cleanup_claim_token uuid,
  add column cleanup_claimed_at timestamptz,
  add column cleanup_completed_at timestamptz,
  add column cleanup_last_error text,
  add constraint equipment_signature_operations_cleanup_coherence check (
    (cleanup_state = 'claimed' and cleanup_claim_token is not null and cleanup_claimed_at is not null and cleanup_completed_at is null)
    or (cleanup_state in ('deleted','missing') and cleanup_completed_at is not null and cleanup_claim_token is null)
    or (cleanup_state in ('none','retry') and cleanup_claim_token is null)
  );
create index equipment_signature_operations_cleanup_claim_idx on public.equipment_signature_operations(cleanup_state, state, created_at);

create or replace function private.guard_equipment_signature_cleanup_fence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.cleanup_state = 'claimed' and new.state = 'adopted' then
    raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_CLAIMED' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger equipment_signature_operations_cleanup_fence before update on public.equipment_signature_operations
for each row execute function private.guard_equipment_signature_cleanup_fence();

create or replace function public.claim_equipment_signature_cleanup_candidates(target_pending_before timestamptz, target_rejected_before timestamptz, target_claimed_before timestamptz, target_limit integer, target_claim_token uuid)
returns table(operation_id uuid, request_id uuid, phase text, object_path text, operation_state text, cleanup_claim_token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if target_pending_before is null or target_rejected_before is null or target_claimed_before is null or target_claim_token is null or target_limit not between 1 and 100 then
    raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_INPUT_INVALID' using errcode = '22023';
  end if;
  return query with candidates as (
    select o.id from public.equipment_signature_operations o
    where o.state in ('pending','rejected')
      and ((o.state='pending' and o.created_at < target_pending_before) or (o.state='rejected' and coalesce(o.finalized_at,o.created_at) < target_rejected_before))
      and (o.cleanup_state in ('none','retry') or (o.cleanup_state='claimed' and o.cleanup_claimed_at < target_claimed_before and o.cleanup_claim_token is distinct from target_claim_token))
      and not exists (select 1 from public.equipment_requests r where r.handover_recipient_signature_storage_path=o.object_path or r.return_recipient_signature_storage_path=o.object_path)
    order by o.created_at for update skip locked limit target_limit
  ), claimed as (
    update public.equipment_signature_operations o set cleanup_state='claimed', cleanup_claim_token=target_claim_token, cleanup_claimed_at=clock_timestamp(), cleanup_completed_at=null, cleanup_last_error=null
    from candidates c where o.id=c.id
    returning o.id,o.request_id,o.phase,o.object_path,o.state,o.cleanup_claim_token
  ) select claimed_rows.id,claimed_rows.request_id,claimed_rows.phase,claimed_rows.object_path,claimed_rows.state,claimed_rows.cleanup_claim_token from claimed as claimed_rows;
end;
$$;

create or replace function public.ack_equipment_signature_cleanup(target_operation_id uuid, target_claim_token uuid, target_outcome text, target_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare row public.equipment_signature_operations;
begin
  if target_operation_id is null or target_claim_token is null or target_outcome not in ('deleted','missing','retry') or length(coalesce(target_error,'')) > 500 then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_INPUT_INVALID' using errcode='22023'; end if;
  select * into row from public.equipment_signature_operations where id=target_operation_id for update;
  if row.id is null or row.cleanup_state <> 'claimed' or row.cleanup_claim_token <> target_claim_token then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_CLAIM_REQUIRED' using errcode='42501'; end if;
  update public.equipment_signature_operations set cleanup_state=target_outcome, cleanup_claim_token=null, cleanup_completed_at=case when target_outcome in ('deleted','missing') then clock_timestamp() else null end, cleanup_last_error=case when target_outcome='retry' then target_error else null end where id=row.id;
end;
$$;
revoke all on function private.guard_equipment_signature_cleanup_fence() from public, anon, authenticated;
revoke execute on function public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid) from public, anon, authenticated;
revoke execute on function public.ack_equipment_signature_cleanup(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_equipment_signature_cleanup_candidates(timestamptz,timestamptz,timestamptz,integer,uuid) to service_role;
grant execute on function public.ack_equipment_signature_cleanup(uuid,uuid,text,text) to service_role;
