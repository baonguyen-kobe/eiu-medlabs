-- Basic Medical equipment request edit: immutable source, domain-local catalog, no outbox.

create or replace function private.guard_equipment_request_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_schedule_date date;
  target_room_type_id uuid;
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;
  if current_setting('app.basic_medical_equipment_edit_rpc', true) = 'true'
    and old.request_domain = 'basic_medical'
    and new.request_domain = 'basic_medical' then
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
      or new.handover_signature_path is distinct from old.handover_signature_path
      or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
      or new.handover_effective_at is distinct from old.handover_effective_at
      or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
      or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
      or new.return_signature_path is distinct from old.return_signature_path
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
    or new.handover_signature_path is distinct from old.handover_signature_path
    or new.handover_recipient_signed_at is distinct from old.handover_recipient_signed_at
    or new.handover_effective_at is distinct from old.handover_effective_at
    or new.return_staff_confirmed_by is distinct from old.return_staff_confirmed_by
    or new.return_staff_confirmed_at is distinct from old.return_staff_confirmed_at
    or new.return_signature_path is distinct from old.return_signature_path
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

create or replace function public.update_basic_medical_equipment_request_content(
  target_request_id uuid,
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
  request_row record;
  source_row record;
  updated_request_id uuid;
  receive_local timestamp;
  return_local timestamp;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select requests.* into request_row
  from public.equipment_requests as requests
  where requests.id = target_request_id
    and requests.request_domain = 'basic_medical'
  for update;
  if request_row.id is null then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_FORBIDDEN' using errcode = '42501';
  end if;
  if request_row.status not in ('new', 'preparing') then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_STATUS' using errcode = '22023';
  end if;
  if request_row.registrant_id <> actor_id
    and not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_FORBIDDEN' using errcode = '42501';
  end if;

  select sessions.id as session_id,
         sessions.class_schedule_id,
         sessions.lesson_title,
         sessions.teaching_lecturer_id,
         sessions.cancelled_at as session_cancelled_at,
         registrations.cancelled_at as registration_cancelled_at,
         registrations.semester as registration_semester,
         schedules.schedule_date,
         schedules.schedule_status
  into source_row
  from public.basic_medical_registration_sessions as sessions
  join public.basic_medical_registrations as registrations
    on registrations.id = sessions.registration_id
  join public.class_schedules as schedules
    on schedules.id = sessions.class_schedule_id
  where sessions.id = request_row.source_identity_id
  for update of sessions, schedules;
  if source_row.session_id is null
    or source_row.session_cancelled_at is not null
    or source_row.registration_cancelled_at is not null
    or source_row.schedule_status = 'cancelled' then
    raise exception 'BASIC_MEDICAL_SESSION_CANCELLED' using errcode = '22023';
  end if;
  if request_row.class_schedule_id is distinct from source_row.class_schedule_id then
    raise exception 'EQUIPMENT_REQUEST_LIVE_SOURCE_IMMUTABLE' using errcode = '22023';
  end if;
  if source_row.registration_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode = '22023';
  end if;

  if target_items is null
    or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) not between 1 and 500 then
    raise exception 'EQUIPMENT_REQUEST_ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(target_items) as item(
      catalog_item_id uuid, quantity integer, note text
    )
    left join public.basic_medical_equipment_catalog as catalog
      on catalog.id = item.catalog_item_id
    where item.catalog_item_id is null
      or item.quantity is null or item.quantity < 1 or item.quantity > 100000
      or length(coalesce(item.note, '')) > 1000
      or catalog.id is null or not catalog.is_active
  ) then
    raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode = '22023';
  end if;

  receive_local := target_receive_at at time zone 'Asia/Ho_Chi_Minh';
  return_local := target_return_at at time zone 'Asia/Ho_Chi_Minh';
  if target_receive_at is null or target_return_at is null
    or target_return_at < target_receive_at
    or receive_local::date < (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date
    or receive_local::date > source_row.schedule_date
    or return_local::date < source_row.schedule_date
    or receive_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00')
    or return_local::time not in (time '09:00', time '11:00', time '14:00', time '16:00') then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_TIMING_INVALID' using errcode = '22023';
  end if;

  perform set_config('app.basic_medical_equipment_edit_rpc', 'true', true);

  update public.equipment_requests
  set responsible_lecturer_id = source_row.teaching_lecturer_id,
      semester = source_row.registration_semester,
      receive_at = target_receive_at,
      return_at = target_return_at,
      note = nullif(btrim(target_note), ''),
      late_registration_reason = nullif(btrim(target_late_registration_reason), '')
  where id = target_request_id
    and request_domain = 'basic_medical'
    and status in ('new', 'preparing')
  returning id into updated_request_id;
  if updated_request_id is null then
    raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_STATUS' using errcode = '22023';
  end if;

  delete from public.equipment_request_items where request_id = target_request_id;
  insert into public.equipment_request_items (
    request_id, skill_name, basic_medical_catalog_item_id, quantity, note
  )
  select target_request_id,
         source_row.lesson_title,
         item.catalog_item_id,
         item.quantity,
         nullif(btrim(item.note), '')
  from jsonb_to_recordset(target_items) as item(
    catalog_item_id uuid, quantity integer, note text
  );

  return updated_request_id;
end;
$$;

revoke all on function public.update_basic_medical_equipment_request_content(uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.update_basic_medical_equipment_request_content(uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
