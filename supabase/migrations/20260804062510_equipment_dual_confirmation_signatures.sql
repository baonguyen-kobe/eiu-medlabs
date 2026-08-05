alter table public.equipment_requests
  add column if not exists handover_staff_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists handover_staff_confirmed_at timestamptz,
  add column if not exists handover_recipient_signature text,
  add column if not exists handover_recipient_signed_at timestamptz,
  add column if not exists handover_effective_at timestamptz,
  add column if not exists return_staff_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists return_staff_confirmed_at timestamptz,
  add column if not exists return_recipient_signature text,
  add column if not exists return_recipient_signed_at timestamptz,
  add column if not exists return_effective_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'equipment_requests_handover_signature_valid'
  ) then
    alter table public.equipment_requests
      add constraint equipment_requests_handover_signature_valid check (
        handover_recipient_signature is null or (
          length(handover_recipient_signature) between 100 and 400000
          and handover_recipient_signature like 'data:image/png;base64,%'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'equipment_requests_return_signature_valid'
  ) then
    alter table public.equipment_requests
      add constraint equipment_requests_return_signature_valid check (
        return_recipient_signature is null or (
          length(return_recipient_signature) between 100 and 400000
          and return_recipient_signature like 'data:image/png;base64,%'
        )
      );
  end if;
end;
$$;

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

  if old.status <> 'new'
    and (
      new.class_schedule_id is distinct from old.class_schedule_id
      or new.registrant_id is distinct from old.registrant_id
      or new.responsible_lecturer_id is distinct from old.responsible_lecturer_id
      or new.phone_snapshot is distinct from old.phone_snapshot
      or new.email_snapshot is distinct from old.email_snapshot
      or new.receive_at is distinct from old.receive_at
      or new.return_at is distinct from old.return_at
      or new.note is distinct from old.note
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Chỉ có thể điều chỉnh phiếu trạng thái Mới.' using errcode = '42501';
  end if;

  if (select private.has_role('admin')) or (select private.has_role('staff')) then
    if new.status is distinct from old.status
      or new.handover_staff_confirmed_by is distinct from old.handover_staff_confirmed_by
      or new.handover_staff_confirmed_at is distinct from old.handover_staff_confirmed_at
      or new.handover_recipient_signature is distinct from old.handover_recipient_signature
      or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
      or new.handover_effective_at is distinct from old.handover_effective_at
      or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
      or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
      or new.return_recipient_signature is distinct from old.return_recipient_signature
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
    or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
    or new.handover_effective_at is distinct from old.handover_effective_at
    or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
    or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
    or new.return_recipient_signature is distinct from old.return_recipient_signature
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
      select 1 from public.list_scoped_lecturers(target_room_type_id) as lecturers
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
        handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
        handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
        return_staff_confirmed_by = null,
        return_staff_confirmed_at = null,
        return_recipient_signature = null,
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
    update public.equipment_requests
    set handover_staff_confirmed_by = actor_id,
        handover_staff_confirmed_at = clock_timestamp(),
        status = case when handover_recipient_signature is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_staff_confirmed_by = actor_id,
        return_staff_confirmed_at = clock_timestamp(),
        status = case when return_recipient_signature is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

create or replace function public.registrant_confirm_equipment_handoff(
  target_request_id uuid,
  target_phase text,
  target_signature text
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
  signed_at_value timestamptz := clock_timestamp();
  class_start_at timestamptz;
  signature_bytes bytea;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501';
  end if;
  if target_phase not in ('handover','return') then
    raise exception 'Loại xác nhận không hợp lệ.' using errcode = '22023';
  end if;
  if target_signature is null
    or length(target_signature) not between 100 and 400000
    or target_signature not like 'data:image/png;base64,%' then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end if;
  begin
    signature_bytes := decode(split_part(target_signature, ',', 2), 'base64');
  exception when others then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end;
  if substring(signature_bytes from 1 for 8) <> decode('iVBORw0KGgo=', 'base64') then
    raise exception 'Chữ ký phải là ảnh PNG.' using errcode = '22023';
  end if;

  select requests.* into current_row
  from public.equipment_requests as requests
  where requests.id = target_request_id for update;
  if current_row.id is null or current_row.registrant_id <> actor_id then
    raise exception 'Chỉ Người đăng ký của phiếu được ký xác nhận.' using errcode = '42501';
  end if;
  select ((schedules.schedule_date + schedules.start_time) at time zone 'Asia/Ho_Chi_Minh')
  into class_start_at
  from public.class_schedules as schedules
  where schedules.id = current_row.class_schedule_id;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_phase = 'handover' then
    if current_row.status not in ('new','preparing') then
      raise exception 'Phiếu không còn ở bước xác nhận giao.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_recipient_signature = target_signature,
        handover_recipient_signed_at = signed_at_value,
        handover_effective_at = case
          when signed_at_value > class_start_at then receive_at
          else signed_at_value end,
        status = case when handover_staff_confirmed_at is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  else
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi ký xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_recipient_signature = target_signature,
        return_recipient_signed_at = signed_at_value,
        return_effective_at = case
          when signed_at_value < return_at then return_at
          else signed_at_value end,
        status = case when return_staff_confirmed_at is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  end if;
  return changed_row;
end;
$$;

revoke execute on function public.manager_confirm_equipment_status(uuid, text) from public, anon;
grant execute on function public.manager_confirm_equipment_status(uuid, text) to authenticated;
revoke execute on function public.registrant_confirm_equipment_handoff(uuid, text, text) from public, anon;
grant execute on function public.registrant_confirm_equipment_handoff(uuid, text, text) to authenticated;
