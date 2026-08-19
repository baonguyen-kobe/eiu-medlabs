-- Secure DB/RPC Semester Authority for Equipment Requests
-- Enforces that create and update derive semester strictly from class_schedules (with historical preservation for unchanged schedules).
-- Caller-supplied target_semester cannot bypass or override schedule semester.

create or replace function public.create_equipment_request_with_items(
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_late_registration_reason text,
  target_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.profiles;
  request_id uuid;
  req_late_status text;
  derived_semester text;
begin
  if actor_id is null or not (select private.is_active_user())
    or not (
      (select private.has_role('admin'))
      or (select private.has_role('staff'))
      or (select private.has_role('teaching_assistant'))
      or (select private.has_role('lecturer'))
    ) then
    raise exception 'Bạn không có quyền tạo phiếu thiết bị.' using errcode = '42501';
  end if;

  select schedules.semester into derived_semester
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = target_class_schedule_id
    and schedules.schedule_status <> 'cancelled'
    and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
    and (select private.has_room_type(rooms.room_type_id));

  if not found then
    raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '42501';
  end if;

  if derived_semester is null or derived_semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode = '22023';
  end if;

  if target_items is null or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0
    or jsonb_array_length(target_items) > 500 then
    raise exception 'Danh sách thiết bị phải có từ 1 đến 500 dòng.' using errcode = '22023';
  end if;

  if target_responsible_lecturer_id <> actor_id
    and not exists (
      select 1
      from public.list_scoped_lecturers('40000000-0000-0000-0000-000000000001'::uuid) as lecturers
      where lecturers.id = target_responsible_lecturer_id
    ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      skill_name text, catalog_item_id uuid, quantity integer, note text
    )
    left join public.equipment_catalog as catalog on catalog.id = item.catalog_item_id
    where item.skill_name is null or btrim(item.skill_name) = ''
      or length(item.skill_name) > 200
      or item.catalog_item_id is null
      or item.quantity is null or item.quantity < 1 or item.quantity > 100000
      or length(coalesce(item.note, '')) > 1000
      or catalog.id is null or not catalog.is_active
  ) then
    raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  select * into actor_profile from public.profiles where id = actor_id;
  if actor_profile.id is null or coalesce(actor_profile.phone, '') !~ '^\d{10}$' then
    raise exception 'Hồ sơ Nhân sự chưa có số điện thoại 10 chữ số.' using errcode = '22023';
  end if;

  insert into public.equipment_requests (
    class_schedule_id, semester, registrant_id, responsible_lecturer_id,
    phone_snapshot, email_snapshot, receive_at, return_at,
    late_registration_reason, note, created_by
  ) values (
    target_class_schedule_id, derived_semester, actor_id, target_responsible_lecturer_id,
    actor_profile.phone, actor_profile.email, target_receive_at, target_return_at,
    nullif(btrim(target_late_registration_reason), ''), nullif(btrim(target_note), ''), actor_id
  ) returning id into request_id;

  insert into public.equipment_request_items (
    request_id, skill_name, catalog_item_id, quantity, note
  )
  select request_id, btrim(item.skill_name), item.catalog_item_id, item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    skill_name text, catalog_item_id uuid, quantity integer, note text
  );

  select late_approval_status into req_late_status
  from public.equipment_requests where id = request_id;

  perform private.enqueue_equipment_request_outbox_event(
    request_id,
    case when req_late_status = 'pending' then 'late_approval_requested' else 'created' end,
    null,
    actor_id
  );

  return request_id;
end;
$$;

revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

create or replace function public.update_equipment_request_content(
  target_request_id uuid,
  target_class_schedule_id uuid,
  target_semester text,
  target_responsible_lecturer_id uuid,
  target_receive_at timestamptz,
  target_return_at timestamptz,
  target_note text,
  target_late_registration_reason text,
  target_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_request_id uuid;
  req_late_status text;
  actor_id uuid := (select auth.uid());
  target_sched_semester text;
  current_request record;
  effective_semester text;
begin
  select schedules.semester into target_sched_semester
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  where schedules.id = target_class_schedule_id
    and schedules.schedule_status <> 'cancelled'
    and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
    and (select private.has_room_type(rooms.room_type_id));

  if not found then
    raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '42501';
  end if;

  select req.class_schedule_id, req.semester into current_request
  from public.equipment_requests as req
  where req.id = target_request_id;

  if target_sched_semester in ('HK1','HK2','HK3','HK4') then
    effective_semester := target_sched_semester;
  elsif current_request.class_schedule_id is not null
    and current_request.class_schedule_id = target_class_schedule_id
    and current_request.semester in ('HK1','HK2','HK3','HK4') then
    effective_semester := current_request.semester;
  else
    effective_semester := null;
  end if;

  if effective_semester is null or effective_semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode = '22023';
  end if;

  if target_items is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 then
    raise exception 'Danh sách thiết bị không hợp lệ.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      skill_name text, catalog_item_id uuid, quantity integer, note text
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
      semester = effective_semester,
      responsible_lecturer_id = target_responsible_lecturer_id,
      receive_at = target_receive_at,
      return_at = target_return_at,
      note = nullif(btrim(target_note), ''),
      late_registration_reason = nullif(btrim(target_late_registration_reason), '')
  where id = target_request_id
    and status in ('new', 'preparing')
  returning id into updated_request_id;

  if updated_request_id is null then
    raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh.' using errcode = '42501';
  end if;

  delete from public.equipment_request_items where request_id = target_request_id;

  insert into public.equipment_request_items (
    request_id, skill_name, catalog_item_id, quantity, note
  )
  select target_request_id,
         btrim(item.skill_name),
         item.catalog_item_id,
         item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    skill_name text, catalog_item_id uuid, quantity integer, note text
  );

  select late_approval_status into req_late_status
  from public.equipment_requests where id = target_request_id;

  perform private.enqueue_equipment_request_outbox_event(
    target_request_id,
    case when req_late_status = 'pending' then 'late_approval_requested' else 'updated' end,
    null,
    actor_id
  );

  return updated_request_id;
end;
$$;

revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) to authenticated;

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
language sql
security invoker
set search_path = ''
as $$
  select public.update_equipment_request_content(
    target_request_id,
    target_class_schedule_id,
    target_semester,
    target_responsible_lecturer_id,
    target_receive_at,
    target_return_at,
    target_note,
    coalesce((
      select requests.late_registration_reason
      from public.equipment_requests as requests
      where requests.id = target_request_id
    ), ''),
    target_items
  );
$$;

revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) to authenticated;
