alter table public.equipment_requests
  add column if not exists semester text;

update public.equipment_requests as requests
set semester = case
  when extract(month from schedules.schedule_date) >= 10 then 'HK1'
  when extract(month from schedules.schedule_date) <= 3 then 'HK2'
  when extract(month from schedules.schedule_date) <= 6 then 'HK3'
  else 'HK4'
end
from public.class_schedules as schedules
where schedules.id = requests.class_schedule_id
  and requests.semester is null;

alter table public.equipment_requests
  alter column semester set not null;

alter table public.equipment_requests
  drop constraint if exists equipment_requests_semester_check;

alter table public.equipment_requests
  add constraint equipment_requests_semester_check
  check (semester in ('HK1', 'HK2', 'HK3', 'HK4'));

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
      select 1
      from public.list_scoped_lecturers(target_room_type_id) as lecturers
      where lecturers.id = new.responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop function if exists public.update_equipment_request_content(
  uuid, uuid, uuid, timestamptz, timestamptz, text, jsonb
);

create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_semester text,
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
  if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;

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
    left join public.equipment_catalog as catalog on catalog.id = item.catalog_item_id
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
      semester = target_semester,
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

revoke execute on function public.update_equipment_request_content(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb
) from public, anon;
grant execute on function public.update_equipment_request_content(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb
) to authenticated;

create or replace function public.import_equipment_requests(target_requests jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_payload jsonb;
  item_payload jsonb;
  new_request_id uuid;
  source_code text;
  results jsonb := '[]'::jsonb;
begin
  if actor_id is null
    or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Quản trị viên hoặc Chuyên viên được import phiếu thiết bị.' using errcode = '42501';
  end if;
  if target_requests is null
    or jsonb_typeof(target_requests) <> 'array'
    or jsonb_array_length(target_requests) = 0
    or jsonb_array_length(target_requests) > 500 then
    raise exception 'Danh sách import phải có từ 1 đến 500 phiếu.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_confirmation_rpc', 'true', true);
  for request_payload in select value from jsonb_array_elements(target_requests)
  loop
    source_code := coalesce(request_payload ->> 'source_code', '');
    begin
      if jsonb_typeof(request_payload -> 'items') <> 'array'
        or jsonb_array_length(request_payload -> 'items') = 0 then
        raise exception 'Phiếu % chưa có danh sách thiết bị.', source_code using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.profiles as profiles
        where profiles.id = (request_payload ->> 'registrant_id')::uuid
          and profiles.is_active
      ) then
        raise exception 'Người đăng ký của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.class_schedules as schedules
        join public.rooms as rooms on rooms.id = schedules.room_id
        where schedules.id = (request_payload ->> 'class_schedule_id')::uuid
          and schedules.schedule_status <> 'cancelled'
          and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
      ) then
        raise exception 'Lớp Skills lab của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if (request_payload ->> 'responsible_lecturer_id')::uuid
          <> (request_payload ->> 'registrant_id')::uuid
        and not exists (
          select 1
          from public.list_scoped_lecturers(
            '40000000-0000-0000-0000-000000000001'::uuid
          ) as lecturers
          where lecturers.id = (request_payload ->> 'responsible_lecturer_id')::uuid
        ) then
        raise exception 'Giảng viên phụ trách của phiếu % không hợp lệ.', source_code using errcode = '22023';
      end if;
      if coalesce(request_payload ->> 'semester', '') not in ('HK1', 'HK2', 'HK3', 'HK4') then
        raise exception 'Học kỳ của phiếu % phải là HK1, HK2, HK3 hoặc HK4.', source_code using errcode = '22023';
      end if;

      insert into public.equipment_requests (
        class_schedule_id,
        semester,
        registrant_id,
        responsible_lecturer_id,
        phone_snapshot,
        email_snapshot,
        receive_at,
        return_at,
        status,
        note,
        created_by,
        created_at,
        updated_at
      ) values (
        (request_payload ->> 'class_schedule_id')::uuid,
        request_payload ->> 'semester',
        (request_payload ->> 'registrant_id')::uuid,
        (request_payload ->> 'responsible_lecturer_id')::uuid,
        request_payload ->> 'phone_snapshot',
        request_payload ->> 'email_snapshot',
        (request_payload ->> 'receive_at')::timestamptz,
        (request_payload ->> 'return_at')::timestamptz,
        request_payload ->> 'status',
        nullif(request_payload ->> 'note', ''),
        actor_id,
        (request_payload ->> 'created_at')::timestamptz,
        (request_payload ->> 'created_at')::timestamptz
      ) returning id into new_request_id;

      for item_payload in
        select value from jsonb_array_elements(request_payload -> 'items')
      loop
        if not exists (
          select 1
          from public.equipment_catalog as catalog
          where catalog.id = (item_payload ->> 'catalog_item_id')::uuid
        ) then
          raise exception 'Danh mục thiết bị của phiếu % đã thay đổi.', source_code using errcode = '22023';
        end if;
        insert into public.equipment_request_items (
          request_id,
          skill_name,
          catalog_item_id,
          quantity,
          note,
          created_at
        ) values (
          new_request_id,
          item_payload ->> 'skill_name',
          (item_payload ->> 'catalog_item_id')::uuid,
          (item_payload ->> 'quantity')::integer,
          nullif(item_payload ->> 'note', ''),
          (request_payload ->> 'created_at')::timestamptz
        );
      end loop;

      results := results || jsonb_build_array(jsonb_build_object(
        'source_code', source_code,
        'ok', true,
        'request_id', new_request_id
      ));
    exception
      when unique_violation then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Lớp hoặc mã phiếu đã có phiếu thiết bị.'
        ));
      when sqlstate '22023' then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', sqlerrm
        ));
      when foreign_key_violation or check_violation then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Dữ liệu liên quan của phiếu không còn hợp lệ.'
        ));
      when others then
        results := results || jsonb_build_array(jsonb_build_object(
          'source_code', source_code,
          'ok', false,
          'message', 'Không thể tạo phiếu thiết bị.'
        ));
    end;
  end loop;
  return results;
end;
$$;

revoke execute on function public.import_equipment_requests(jsonb) from public, anon;
grant execute on function public.import_equipment_requests(jsonb) to authenticated;
