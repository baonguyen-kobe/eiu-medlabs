drop index public.equipment_signature_operations_pending_actor_idx;
create unique index equipment_signature_operations_pending_actor_idx on public.equipment_signature_operations(request_id, phase, actor_id) where state = 'pending' and cleanup_state = 'none';

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
  if existing.id is not null then return query select existing.id,existing.object_path,existing.state; return; end if;
  new_path:=format('equipment-requests/%s/%s/%s.png',lower(target_request_id::text),target_phase,lower(new_id::text));
  insert into public.equipment_signature_operations(id,request_id,phase,actor_id,object_path,state) values(new_id,target_request_id,target_phase,current_actor_id,new_path,'pending');
  return query select new_id,new_path,'pending'::text;
end;
$$;
