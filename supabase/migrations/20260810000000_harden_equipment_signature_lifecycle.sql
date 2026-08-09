alter table public.equipment_signature_operations
  add column last_reserved_at timestamptz;

update public.equipment_signature_operations
set last_reserved_at = created_at
where last_reserved_at is null;

alter table public.equipment_signature_operations
  alter column last_reserved_at set default clock_timestamp(),
  alter column last_reserved_at set not null;

drop index public.equipment_signature_operations_cleanup_claim_idx;
create index equipment_signature_operations_cleanup_claim_idx
  on public.equipment_signature_operations(cleanup_state, state, last_reserved_at);

create or replace function private.guard_equipment_signature_cleanup_fence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.state = 'adopted'
    and (old.cleanup_state <> 'none' or new.cleanup_state <> 'none') then
    raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.reserve_equipment_signature(target_request_id uuid, target_phase text)
returns table(operation_id uuid, object_path text, state text)
language plpgsql security definer set search_path = '' as $$
declare request_row public.equipment_requests; existing public.equipment_signature_operations; current_actor_id uuid := (select auth.uid()); new_id uuid := gen_random_uuid(); new_path text;
begin
  if current_actor_id is null or not (select private.is_active_user()) then raise exception 'EQUIPMENT_SIGNATURE_AUTH_REQUIRED' using errcode = '42501'; end if;
  if target_phase not in ('handover','return') then raise exception 'EQUIPMENT_SIGNATURE_PHASE_INVALID' using errcode='22023'; end if;
  select * into request_row from public.equipment_requests where id=target_request_id for update;
  if request_row.id is null then raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode='P0002'; end if;
  if not exists (select 1 from public.class_schedules s where s.id=request_row.class_schedule_id and s.schedule_status <> 'cancelled') then raise exception 'EQUIPMENT_REQUEST_CANCELLED' using errcode='22023'; end if;
  if current_actor_id not in (request_row.registrant_id,request_row.responsible_lecturer_id) then raise exception 'EQUIPMENT_SIGNATURE_SIGNER_REQUIRED' using errcode='42501'; end if;
  if target_phase='handover' then
    if request_row.handover_recipient_signature is not null or request_row.handover_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode='22023'; end if;
    if request_row.status not in ('new','preparing','handed_over') or (request_row.handover_staff_confirmed_at is null and request_row.status <> 'handed_over') then raise exception 'EQUIPMENT_HANDOVER_PREREQUISITE_REQUIRED' using errcode='22023'; end if;
  else
    if request_row.return_recipient_signature is not null or request_row.return_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode='22023'; end if;
    if request_row.status not in ('handed_over','returned') then raise exception 'EQUIPMENT_RETURN_PREREQUISITE_REQUIRED' using errcode='22023'; end if;
  end if;
  select * into existing from public.equipment_signature_operations o where o.request_id=target_request_id and o.phase=target_phase and o.actor_id=current_actor_id and o.state='pending' and o.cleanup_state='none' for update;
  if existing.id is not null then
    update public.equipment_signature_operations set last_reserved_at=clock_timestamp() where id=existing.id returning * into existing;
    return query select existing.id,existing.object_path,existing.state;
    return;
  end if;
  new_path:=format('equipment-requests/%s/%s/%s.png',lower(target_request_id::text),target_phase,lower(new_id::text));
  insert into public.equipment_signature_operations(id,request_id,phase,actor_id,object_path,state) values(new_id,target_request_id,target_phase,current_actor_id,new_path,'pending');
  return query select new_id,new_path,'pending'::text;
end;
$$;

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
      and ((o.state='pending' and o.last_reserved_at < target_pending_before) or (o.state='rejected' and coalesce(o.finalized_at,o.created_at) < target_rejected_before))
      and (o.cleanup_state in ('none','retry') or (o.cleanup_state='claimed' and o.cleanup_claimed_at < target_claimed_before and o.cleanup_claim_token is distinct from target_claim_token))
      and not exists (select 1 from public.equipment_requests r where r.handover_recipient_signature_storage_path=o.object_path or r.return_recipient_signature_storage_path=o.object_path)
    order by o.last_reserved_at for update skip locked limit target_limit
  ), claimed as (
    update public.equipment_signature_operations o set cleanup_state='claimed', cleanup_claim_token=target_claim_token, cleanup_claimed_at=clock_timestamp(), cleanup_completed_at=null, cleanup_last_error=null
    from candidates c where o.id=c.id
    returning o.id,o.request_id,o.phase,o.object_path,o.state,o.cleanup_claim_token
  ) select claimed_rows.id,claimed_rows.request_id,claimed_rows.phase,claimed_rows.object_path,claimed_rows.state,claimed_rows.cleanup_claim_token from claimed as claimed_rows;
end;
$$;

create or replace function public.finalize_equipment_signature(target_operation_id uuid)
returns public.equipment_requests
language plpgsql security definer set search_path = '' as $$
declare
  operation_row public.equipment_signature_operations;
  request_row public.equipment_requests;
  changed_row public.equipment_requests;
  current_actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  class_start_at timestamptz;
begin
  if current_actor_id is null or not (select private.is_active_user()) then raise exception 'EQUIPMENT_SIGNATURE_AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into operation_row from public.equipment_signature_operations where id = target_operation_id for update;
  if operation_row.id is null then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if operation_row.actor_id <> current_actor_id then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_OWNER_REQUIRED' using errcode = '42501'; end if;
  select * into request_row from public.equipment_requests where id = operation_row.request_id for update;
  if request_row.id is null then raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.class_schedules schedules where schedules.id = request_row.class_schedule_id and schedules.schedule_status <> 'cancelled') then raise exception 'EQUIPMENT_REQUEST_CANCELLED' using errcode = '22023'; end if;
  if operation_row.state = 'adopted' then return request_row; end if;
  if operation_row.state <> 'pending' then raise exception 'EQUIPMENT_SIGNATURE_OPERATION_REJECTED' using errcode = '22023'; end if;
  if operation_row.cleanup_state <> 'none' then raise exception 'EQUIPMENT_SIGNATURE_CLEANUP_OWNED' using errcode = '55000'; end if;
  if current_actor_id not in (request_row.registrant_id, request_row.responsible_lecturer_id) then
    update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
    raise exception 'EQUIPMENT_SIGNATURE_SIGNER_REQUIRED' using errcode = '42501';
  end if;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  select ((s.schedule_date + s.start_time) at time zone 'Asia/Ho_Chi_Minh') into class_start_at from public.class_schedules s where s.id=request_row.class_schedule_id;
  if operation_row.phase = 'handover' then
    if request_row.handover_recipient_signature is not null or request_row.handover_recipient_signature_storage_path is not null or request_row.status not in ('new','preparing','handed_over') or (request_row.handover_staff_confirmed_at is null and request_row.status <> 'handed_over') then
      update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
      raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED_OR_INVALID' using errcode = '22023';
    end if;
    update public.equipment_requests set handover_recipient_signature_storage_path=operation_row.object_path,handover_recipient_signed_at=signed_at_value,handover_effective_at=case when signed_at_value>class_start_at then receive_at else signed_at_value end,status=case when handover_staff_confirmed_at is not null then 'handed_over' else status end where id=request_row.id returning * into changed_row;
  else
    if request_row.return_recipient_signature is not null or request_row.return_recipient_signature_storage_path is not null or request_row.status not in ('handed_over','returned') then
      update public.equipment_signature_operations set state='rejected', finalized_at=clock_timestamp() where id=operation_row.id;
      raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED_OR_INVALID' using errcode = '22023';
    end if;
    update public.equipment_requests set return_recipient_signature_storage_path=operation_row.object_path,return_recipient_signed_at=signed_at_value,return_effective_at=case when signed_at_value<return_at then return_at else signed_at_value end,status=case when return_staff_confirmed_at is not null then 'completed' else status end where id=request_row.id returning * into changed_row;
  end if;
  update public.equipment_signature_operations set state='adopted', finalized_at=clock_timestamp() where id=operation_row.id;
  return changed_row;
end;
$$;
