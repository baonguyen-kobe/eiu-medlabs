-- C2 activation: database-owned equipment signature object references and adoption operations.
-- request_id deliberately has no foreign key so operation/object-path records survive hard deletes for future cleanup.
alter table public.equipment_requests
  add column if not exists handover_recipient_signature_storage_path text,
  add column if not exists return_recipient_signature_storage_path text;

create table public.equipment_signature_operations (
  id uuid primary key,
  request_id uuid not null,
  phase text not null constraint equipment_signature_operations_phase_check check (phase in ('handover', 'return')),
  actor_id uuid not null,
  object_path text not null unique constraint equipment_signature_operations_object_path_check check (
    object_path ~ '^equipment-requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(handover|return)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
  ),
  state text not null constraint equipment_signature_operations_state_check check (state in ('pending', 'adopted', 'rejected')),
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz
);

alter table public.equipment_signature_operations enable row level security;
revoke all on table public.equipment_signature_operations from public, anon, authenticated;
create unique index equipment_signature_operations_pending_actor_idx
  on public.equipment_signature_operations(request_id, phase, actor_id)
  where state = 'pending';
create index equipment_signature_operations_request_idx
  on public.equipment_signature_operations(request_id, phase);

create or replace function private.guard_equipment_request_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;

  if old.status not in ('new', 'preparing')
    and (
      new.class_schedule_id is distinct from old.class_schedule_id
      or new.semester is distinct from old.semester
      or new.registrant_id is distinct from old.registrant_id
      or new.responsible_lecturer_id is distinct from old.responsible_lecturer_id
      or new.phone_snapshot is distinct from old.phone_snapshot
      or new.email_snapshot is distinct from old.email_snapshot
      or new.receive_at is distinct from old.receive_at
      or new.return_at is distinct from old.return_at
      or new.note is distinct from old.note
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Chỉ có thể điều chỉnh phiếu trạng thái Mới hoặc Đã soạn.' using errcode = '42501';
  end if;

  if (select private.has_role('admin')) or (select private.has_role('staff')) then
    if new.status is distinct from old.status
      or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
      or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
      or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signature_storage_path is distinct from old.handover_recipient_signature_storage_path
      or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
      or new.handover_effective_at is distinct from old.handover_effective_at
      or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
      or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
      or new.return_recipient_signature is distinct from old.return_recipient_signature
      or new.return_recipient_signature_storage_path is distinct from old.return_recipient_signature_storage_path
      or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
      or new.return_effective_at is distinct from old.return_effective_at then
      raise exception 'Vui lòng dùng luồng xác nhận trạng thái phiếu.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.registrant_id is distinct from old.registrant_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.status is distinct from old.status
    or new.handover_file_url is distinct from old.handover_file_url
    or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
    or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
    or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signature_storage_path is distinct from old.handover_recipient_signature_storage_path
    or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
    or new.handover_effective_at is distinct from old.handover_effective_at
    or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
    or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
    or new.return_recipient_signature is distinct from old.return_recipient_signature
      or new.return_recipient_signature_storage_path is distinct from old.return_recipient_signature_storage_path
    or new.return_recipient_signed_at is distinct from old.return_recipient_signed_at
    or new.return_effective_at is distinct from old.return_effective_at
    or new.phone_snapshot is distinct from old.phone_snapshot
    or new.email_snapshot is distinct from old.email_snapshot then
    raise exception 'Người đăng ký chỉ được điều chỉnh nội dung phiếu.' using errcode = '42501';
  end if;

  select schedules.schedule_date, rooms.room_type_id
  into target_schedule_date, target_room_type_id
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = new.class_schedule_id
    and schedules.schedule_status <> 'cancelled';

  if target_schedule_date is null
    or target_room_type_id <> '40000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode = '22023';
  end if;

  if (new.receive_at at time zone 'Asia/Ho_Chi_Minh')::date > target_schedule_date then
    raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode = '22023';
  end if;

  if new.responsible_lecturer_id <> new.registrant_id
    and not exists (
      select 1
      from public.list_scoped_lecturers(target_room_type_id) as lecturers
      where lecturers.id = new.responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;

create or replace function public.manager_confirm_equipment_status(
  target_request_id uuid,
  target_status text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  current_rank integer;
  target_rank integer;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được chuyển trạng thái phiếu.' using errcode = '42501';
  end if;
  if target_status not in ('new','preparing','handed_over','returned','completed') then
    raise exception 'Trạng thái phiếu không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row from public.equipment_requests
  where id = target_request_id for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  current_rank := case current_row.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  target_rank := case target_status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_rank < current_rank then
    update public.equipment_requests
    set status = target_status,
        handover_staff_confirmed_by = case when target_rank >= 2 then handover_staff_confirmed_by else null end,
        handover_staff_confirmed_at = case when target_rank >= 2 then handover_staff_confirmed_at else null end,
        handover_recipient_signature = case when target_rank >= 2 then handover_recipient_signature else null end,
        handover_recipient_signature_storage_path = case when target_rank >= 2 then handover_recipient_signature_storage_path else null end,
        handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
        handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
        return_staff_confirmed_by = null,
        return_staff_confirmed_at = null,
        return_recipient_signature = null,
        return_recipient_signature_storage_path = null,
        return_recipient_signed_at = null,
        return_effective_at = null
    where id = target_request_id returning * into changed_row;
    return changed_row;
  end if;

  if target_status = current_row.status
    and target_status not in ('handed_over','returned') then
    return current_row;
  end if;
  if target_status = 'preparing' then
    update public.equipment_requests set status = 'preparing'
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'handed_over' then
    if current_row.status = 'new' then
      raise exception 'Phải chuyển phiếu sang Đã soạn trước khi xác nhận Đã giao.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_staff_confirmed_by = actor_id,
        handover_staff_confirmed_at = clock_timestamp(),
        status = case when handover_recipient_signature is not null or handover_recipient_signature_storage_path is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_staff_confirmed_by = actor_id,
        return_staff_confirmed_at = clock_timestamp(),
        status = case when return_recipient_signature is not null or return_recipient_signature_storage_path is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

create or replace function public.reserve_equipment_signature(
  target_request_id uuid,
  target_phase text
)
returns table(operation_id uuid, object_path text, state text)
language plpgsql security definer set search_path = '' as $$
declare
  request_row public.equipment_requests;
  existing public.equipment_signature_operations;
  current_actor_id uuid := (select auth.uid());
  new_id uuid := gen_random_uuid();
  new_path text;
begin
  if current_actor_id is null or not (select private.is_active_user()) then raise exception 'EQUIPMENT_SIGNATURE_AUTH_REQUIRED' using errcode = '42501'; end if;
  if target_phase not in ('handover', 'return') then raise exception 'EQUIPMENT_SIGNATURE_PHASE_INVALID' using errcode = '22023'; end if;
  select * into request_row from public.equipment_requests where id = target_request_id for update;
  if request_row.id is null then raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.class_schedules schedules where schedules.id = request_row.class_schedule_id and schedules.schedule_status <> 'cancelled') then raise exception 'EQUIPMENT_REQUEST_CANCELLED' using errcode = '22023'; end if;
  if current_actor_id not in (request_row.registrant_id, request_row.responsible_lecturer_id) then raise exception 'EQUIPMENT_SIGNATURE_SIGNER_REQUIRED' using errcode = '42501'; end if;
  if target_phase = 'handover' then
    if request_row.handover_recipient_signature is not null or request_row.handover_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode = '22023'; end if;
    if request_row.status not in ('new','preparing','handed_over') or (request_row.handover_staff_confirmed_at is null and request_row.status <> 'handed_over') then raise exception 'EQUIPMENT_HANDOVER_PREREQUISITE_REQUIRED' using errcode = '22023'; end if;
  else
    if request_row.return_recipient_signature is not null or request_row.return_recipient_signature_storage_path is not null then raise exception 'EQUIPMENT_SIGNATURE_ALREADY_SIGNED' using errcode = '22023'; end if;
    if request_row.status not in ('handed_over','returned') then raise exception 'EQUIPMENT_RETURN_PREREQUISITE_REQUIRED' using errcode = '22023'; end if;
  end if;
  select * into existing from public.equipment_signature_operations as operations where operations.request_id = target_request_id and operations.phase = target_phase and operations.actor_id = current_actor_id and operations.state = 'pending' for update;
  if existing.id is not null then return query select existing.id, existing.object_path, existing.state; return; end if;
  new_path := format('equipment-requests/%s/%s/%s.png', lower(target_request_id::text), target_phase, lower(new_id::text));
  insert into public.equipment_signature_operations(id,request_id,phase,actor_id,object_path,state) values (new_id,target_request_id,target_phase,current_actor_id,new_path,'pending');
  return query select new_id,new_path,'pending'::text;
end;
$$;

create or replace function public.get_equipment_signature_operation_status(target_operation_id uuid)
returns table(operation_id uuid, state text, request_id uuid, phase text, object_path text)
language sql security definer set search_path = '' as $$
  select id, state, request_id, phase, object_path
  from public.equipment_signature_operations
  where id = target_operation_id and actor_id = (select auth.uid())
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

revoke execute on function public.registrant_confirm_equipment_handoff(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.reserve_equipment_signature(uuid,text) from public, anon;
grant execute on function public.reserve_equipment_signature(uuid,text) to authenticated;
revoke execute on function public.get_equipment_signature_operation_status(uuid) from public, anon;
grant execute on function public.get_equipment_signature_operation_status(uuid) to authenticated;
revoke execute on function public.finalize_equipment_signature(uuid) from public, anon;
grant execute on function public.finalize_equipment_signature(uuid) to authenticated;
