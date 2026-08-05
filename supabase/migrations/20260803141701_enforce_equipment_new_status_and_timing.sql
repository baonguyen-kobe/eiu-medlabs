create or replace function private.validate_equipment_request_timing()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
  receive_local timestamp;
  return_local timestamp;
begin
  if tg_op = 'UPDATE'
    and new.class_schedule_id is not distinct from old.class_schedule_id
    and new.receive_at is not distinct from old.receive_at
    and new.return_at is not distinct from old.return_at then
    return new;
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

  receive_local := new.receive_at at time zone 'Asia/Ho_Chi_Minh';
  return_local := new.return_at at time zone 'Asia/Ho_Chi_Minh';

  if receive_local::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày nhận không được trước ngày hiện tại.' using errcode = '22023';
  end if;
  if receive_local::date > target_schedule_date then
    raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode = '22023';
  end if;
  if return_local < receive_local then
    raise exception 'Ngày và giờ trả phải sau hoặc bằng thời điểm nhận.' using errcode = '22023';
  end if;
  if receive_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00')
    or return_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00') then
    raise exception 'Giờ nhận và giờ trả không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_requests_validate_timing on public.equipment_requests;
create trigger equipment_requests_validate_timing
before insert or update on public.equipment_requests
for each row execute function private.validate_equipment_request_timing();

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
    return new;
  end if;

  if new.registrant_id is distinct from old.registrant_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.status is distinct from old.status
    or new.handover_file_url is distinct from old.handover_file_url
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

create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_request_id uuid;
begin
  if target_items is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 then
    raise exception 'Danh sách thiết bị không hợp lệ.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      skill_name text,
      catalog_item_id uuid,
      quantity integer,
      note text
    )
    left join public.equipment_catalog catalog on catalog.id = item.catalog_item_id
    where item.skill_name is null
      or btrim(item.skill_name) = ''
      or item.catalog_item_id is null
      or item.quantity is null
      or item.quantity < 1
      or catalog.id is null
      or not catalog.is_active
  ) then
    raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  update public.equipment_requests
  set class_schedule_id = target_class_schedule_id,
      responsible_lecturer_id = target_responsible_lecturer_id,
      receive_at = target_receive_at,
      return_at = target_return_at,
      note = nullif(btrim(target_note), '')
  where id = target_request_id
    and status = 'new'
  returning id into updated_request_id;

  if updated_request_id is null then
    raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh.' using errcode = '42501';
  end if;

  delete from public.equipment_request_items where request_id = target_request_id;

  insert into public.equipment_request_items (
    request_id,
    skill_name,
    catalog_item_id,
    quantity,
    note
  )
  select target_request_id,
         btrim(item.skill_name),
         item.catalog_item_id,
         item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    skill_name text,
    catalog_item_id uuid,
    quantity integer,
    note text
  );

  return updated_request_id;
end;
$$;

drop policy if exists equipment_items_manage on public.equipment_request_items;
create policy equipment_items_manage on public.equipment_request_items
for all to authenticated
using (
  exists (
    select 1
    from public.equipment_requests r
    where r.id = request_id
      and r.status = 'new'
      and (
        r.registrant_id = (select auth.uid())
        or (select private.has_role('admin'))
        or (select private.has_role('staff'))
      )
  )
)
with check (
  exists (
    select 1
    from public.equipment_requests r
    where r.id = request_id
      and r.status = 'new'
      and (
        r.registrant_id = (select auth.uid())
        or (select private.has_role('admin'))
        or (select private.has_role('staff'))
      )
  )
);
