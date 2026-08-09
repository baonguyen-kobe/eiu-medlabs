-- Reconcile the migration-era Base64 signature columns with the canonical
-- declarative-schema and application contract before Storage integration.

alter table public.equipment_requests
  add column if not exists handover_recipient_signature text,
  add column if not exists return_recipient_signature text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipment_requests'
      and column_name in ('handover_recipient_signature', 'return_recipient_signature')
      and (data_type <> 'text' or is_nullable <> 'YES')
  ) then
    raise exception 'EQUIPMENT_SIGNATURE_CANONICAL_CONTRACT_INVALID';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'equipment_requests'
      and column_name in ('handover_signature_path', 'return_signature_path')
      and data_type <> 'text'
  ) then
    raise exception 'EQUIPMENT_SIGNATURE_LEGACY_CONTRACT_INVALID';
  end if;
end;
$$;

do $$
declare
  phase text;
  canonical_column text;
  legacy_column text;
  legacy_exists boolean;
  legacy_projection text;
  legacy_predicate text;
  request_row record;
  signature_value text;
  signature_bytes bytea;
  payload text;
begin
  foreach phase in array array['handover', 'return'] loop
    canonical_column := phase || '_recipient_signature';
    legacy_column := phase || '_signature_path';

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'equipment_requests'
        and column_name = legacy_column
    ) into legacy_exists;

    legacy_projection := case
      when legacy_exists then format('%I::text', legacy_column)
      else 'null::text'
    end;
    legacy_predicate := case
      when legacy_exists then format(' or %I is not null', legacy_column)
      else ''
    end;

    for request_row in execute format(
      'select id, %1$I::text as canonical_value, %2$s as legacy_value
       from public.equipment_requests
       where %1$I is not null%3$s',
      canonical_column,
      legacy_projection,
      legacy_predicate
    ) loop
      foreach signature_value in array array[
        request_row.canonical_value,
        request_row.legacy_value
      ] loop
        if signature_value is null then
          continue;
        end if;

        if length(signature_value) not between 100 and 400000
          or left(signature_value, length('data:image/png;base64,'))
            <> 'data:image/png;base64,' then
          raise exception using message =
            'EQUIPMENT_' || upper(phase) || '_SIGNATURE_RECONCILIATION_INVALID';
        end if;

        payload := substr(signature_value, length('data:image/png;base64,') + 1);
        if payload = ''
          or length(payload) % 4 <> 0
          or payload !~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
          raise exception using message =
            'EQUIPMENT_' || upper(phase) || '_SIGNATURE_RECONCILIATION_INVALID';
        end if;

        begin
          signature_bytes := decode(payload, 'base64');
        exception when others then
          raise exception using message =
            'EQUIPMENT_' || upper(phase) || '_SIGNATURE_RECONCILIATION_INVALID';
        end;

        if substring(signature_bytes from 1 for 8)
          <> decode('iVBORw0KGgo=', 'base64') then
          raise exception using message =
            'EQUIPMENT_' || upper(phase) || '_SIGNATURE_RECONCILIATION_INVALID';
        end if;
      end loop;

      if legacy_exists and request_row.legacy_value is not null then
        if request_row.canonical_value is null then
          execute format(
            'update public.equipment_requests set %I = $1 where id = $2',
            canonical_column
          ) using request_row.legacy_value, request_row.id;
        elsif request_row.canonical_value <> request_row.legacy_value then
          raise exception using message =
            'EQUIPMENT_' || upper(phase) || '_SIGNATURE_RECONCILIATION_CONFLICT';
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

alter table public.equipment_requests
  drop constraint if exists equipment_requests_handover_signature_valid,
  drop constraint if exists equipment_requests_return_signature_valid,
  add constraint equipment_requests_handover_signature_valid check (
    handover_recipient_signature is null or (
      length(handover_recipient_signature) between 100 and 400000
      and handover_recipient_signature like 'data:image/png;base64,%'
    )
  ),
  add constraint equipment_requests_return_signature_valid check (
    return_recipient_signature is null or (
      length(return_recipient_signature) between 100 and 400000
      and return_recipient_signature like 'data:image/png;base64,%'
    )
  );

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
    if current_row.status = 'new' then
      raise exception 'Phải chuyển phiếu sang Đã soạn trước khi xác nhận Đã giao.' using errcode = '22023';
    end if;
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
  if current_row.id is null
    or actor_id not in (current_row.registrant_id, current_row.responsible_lecturer_id) then
    raise exception 'Chỉ Người đăng ký hoặc Giảng viên phụ trách được ký xác nhận.' using errcode = '42501';
  end if;
  select ((schedules.schedule_date + schedules.start_time) at time zone 'Asia/Ho_Chi_Minh')
  into class_start_at
  from public.class_schedules as schedules
  where schedules.id = current_row.class_schedule_id;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_phase = 'handover' then
    if current_row.status not in ('new','preparing','handed_over') then
      raise exception 'Phiếu không còn ở bước xác nhận giao.' using errcode = '22023';
    end if;
    if current_row.handover_staff_confirmed_at is null
      and current_row.status <> 'handed_over' then
      raise exception 'Kho phải xác nhận Đã giao trước khi Người đăng ký hoặc Giảng viên phụ trách ký.' using errcode = '22023';
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

drop function if exists public.manager_confirm_equipment_status_scoped_impl(uuid, text);

alter table public.equipment_requests
  drop column if exists handover_signature_path,
  drop column if exists return_signature_path;
