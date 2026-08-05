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

drop trigger if exists equipment_requests_guard_update on public.equipment_requests;
create trigger equipment_requests_guard_update
before update on public.equipment_requests
for each row execute function private.guard_equipment_request_update();

drop policy if exists equipment_requests_update on public.equipment_requests;
create policy equipment_requests_update
on public.equipment_requests
for update
to authenticated
using (
  (select private.has_role('admin'))
  or (select private.has_role('staff'))
  or registrant_id = (select auth.uid())
)
with check (
  (select private.has_role('admin'))
  or (select private.has_role('staff'))
  or (
    registrant_id = (select auth.uid())
    and created_by = (select auth.uid())
  )
);

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

revoke execute on function public.update_equipment_request_content(
  uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb
) from public, anon;
grant execute on function public.update_equipment_request_content(
  uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb
) to authenticated;
