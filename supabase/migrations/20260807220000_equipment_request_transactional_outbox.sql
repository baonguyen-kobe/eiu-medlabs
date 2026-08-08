-- Migration: equipment_request_transactional_outbox
-- Description: Transactional Outbox for Non-Destructive Equipment Request Mutations (EMAIL-MEDIUM-02)

-- 1. Create email_outbox_events table
create table if not exists public.email_outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  domain text not null,
  event_type text not null,
  aggregate_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null,
  recipients jsonb not null,
  delivery_mode_at_event text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  constraint email_outbox_events_delivery_mode_check check (delivery_mode_at_event in ('off', 'test', 'live')),
  constraint email_outbox_events_status_check check (status in ('pending', 'processing', 'processed', 'failed', 'suppressed'))
);

create index if not exists idx_email_outbox_events_pending
  on public.email_outbox_events(created_at, id)
  where status = 'pending';

alter table public.email_outbox_events enable row level security;
revoke all on public.email_outbox_events from public, anon, authenticated;
grant select, insert, update, delete on public.email_outbox_events to service_role;

-- 2. Format equipment email subject helper
create or replace function private.format_equipment_email_subject(
  target_event text,
  target_audience text,
  base_subject text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_audience = 'admin' then
    if target_event = 'created' then
      return concat('[Admin MedLabs Calendar][New] Có đăng ký trang thiết bị mới - ', base_subject);
    elsif target_event = 'updated' then
      return concat('[Admin MedLabs Calendar][Adjusted] Điều chỉnh phiếu đăng ký thiết bị của ', base_subject);
    else
      return concat('[Admin MedLabs Calendar][Late] Có phiếu chờ duyệt đăng ký trễ - ', base_subject);
    end if;
  elsif target_audience = 'responsible' then
    if target_event = 'created' then
      return concat('[MedLabs Calendar][New] Phiếu thiết bị bạn phụ trách - ', base_subject);
    elsif target_event = 'updated' then
      return concat('[MedLabs Calendar][Adjusted] Điều chỉnh phiếu thiết bị bạn phụ trách - ', base_subject);
    elsif target_event = 'late_approval_requested' then
      return concat('[MedLabs Calendar][Late] Phiếu thiết bị bạn phụ trách đăng ký trễ - ', base_subject);
    elsif target_event = 'late_approval_approved' then
      return concat('[MedLabs Calendar][Late] Đã duyệt phiếu đăng ký trễ bạn phụ trách - ', base_subject);
    elsif target_event = 'late_approval_rejected' then
      return concat('[MedLabs Calendar][Late] Đã từ chối phiếu đăng ký trễ bạn phụ trách - ', base_subject);
    else
      return concat('[MedLabs Calendar][Deleted] Phiếu thiết bị bạn phụ trách đã bị xóa - ', base_subject);
    end if;
  else
    if target_event = 'created' then
      return concat('[MedLabs Calendar][New] Xác nhận đăng ký trang thiết bị của ', base_subject);
    elsif target_event = 'updated' then
      return concat('[MedLabs Calendar][Adjusted] Điều chỉnh phiếu đăng ký thiết bị của ', base_subject);
    elsif target_event = 'late_approval_requested' then
      return concat('[MedLabs Calendar][Late] Gửi phiếu đăng ký thiết bị trễ - ', base_subject);
    elsif target_event = 'late_approval_approved' then
      return concat('[MedLabs Calendar][Late] Đã duyệt đăng ký trễ - ', base_subject);
    elsif target_event = 'late_approval_rejected' then
      return concat('[MedLabs Calendar][Late] Từ chối đăng ký trễ - ', base_subject);
    else
      return concat('[MedLabs Calendar][Deleted] Phiếu đăng ký thiết bị đã bị xóa - ', base_subject);
    end if;
  end if;
end;
$$;
revoke all on function private.format_equipment_email_subject(text, text, text) from public, anon, authenticated;

-- 3. Enqueue outbox event helper for Equipment Request
create or replace function private.enqueue_equipment_request_outbox_event(
  target_request_id uuid,
  target_event text,
  target_operation_id uuid default null,
  target_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_mode text;
  req_row record;
  sched_row record;
  rm_row record;
  actor_name text;
  reg_profile record;
  resp_profile record;
  items_json jsonb;
  request_code text;
  room_label text;
  payload jsonb;
  recipients jsonb := '[]'::jsonb;
  event_key_val text;
  sends_to_managers boolean;
  mgr record;
  outbox_id uuid;
  effective_actor_id uuid := coalesce(target_actor_id, (select auth.uid()));
begin
  select delivery_mode into current_mode
  from public.email_delivery_settings
  where setting_key = 'primary';
  if current_mode not in ('test', 'live') then
    current_mode := 'off';
  end if;

  select * into req_row
  from public.equipment_requests
  where id = target_request_id;
  if req_row.id is null then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into reg_profile
  from public.profiles
  where id = req_row.registrant_id;

  select * into resp_profile
  from public.profiles
  where id = req_row.responsible_lecturer_id;

  if effective_actor_id is not null then
    select full_name into actor_name
    from public.profiles
    where id = effective_actor_id;
  end if;

  select * into sched_row
  from public.class_schedules
  where id = req_row.class_schedule_id;

  if sched_row.room_id is not null then
    select * into rm_row
    from public.rooms
    where id = sched_row.room_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_name', item.skill_name,
    'item_name', coalesce(cat.item_name, 'Thiết bị không còn trong danh mục'),
    'commercial_name', coalesce(cat.commercial_name, ''),
    'unit', coalesce(cat.unit, ''),
    'quantity', item.quantity,
    'note', item.note
  )), '[]'::jsonb) into items_json
  from public.equipment_request_items item
  left join public.equipment_catalog cat on cat.id = item.catalog_item_id
  where item.request_id = target_request_id;

  request_code := to_char(req_row.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYMMDDHH24MISS');
  room_label := coalesce(concat_ws(' · ', rm_row.room_code, rm_row.building_code), '');

  payload := jsonb_build_object(
    'request_id', req_row.id,
    'request_code', request_code,
    'event', target_event,
    'actor', coalesce(actor_name, reg_profile.full_name, 'Người dùng hệ thống'),
    'course_code', coalesce(sched_row.course_code_snapshot, ''),
    'course_name', coalesce(sched_row.course_name_snapshot, ''),
    'schedule_date', sched_row.schedule_date,
    'start_time', to_char(sched_row.start_time, 'HH24:MI'),
    'end_time', to_char(sched_row.end_time, 'HH24:MI'),
    'semester', req_row.semester,
    'student_count', sched_row.student_count,
    'lab_type', 'Kỹ năng Điều dưỡng',
    'room', room_label,
    'room_name', rm_row.room_name,
    'registrant_name', coalesce(reg_profile.full_name, ''),
    'registrant_email', coalesce(req_row.email_snapshot, reg_profile.email, ''),
    'registrant_phone', coalesce(req_row.phone_snapshot, reg_profile.phone, ''),
    'responsible_name', coalesce(resp_profile.full_name, ''),
    'responsible_email', coalesce(resp_profile.email, ''),
    'receive_at', req_row.receive_at,
    'return_at', req_row.return_at,
    'note', req_row.note,
    'late_approval_status', req_row.late_approval_status,
    'late_registration_reason', req_row.late_registration_reason,
    'late_review_note', req_row.late_review_note,
    'items', items_json
  );

  sends_to_managers := target_event not in ('late_approval_approved', 'late_approval_rejected', 'deleted');

  -- Add registrant
  if req_row.registrant_id is not null and coalesce(req_row.email_snapshot, reg_profile.email) is not null then
    recipients := recipients || jsonb_build_object(
      'recipient_id', req_row.registrant_id,
      'recipient_email', lower(coalesce(req_row.email_snapshot, reg_profile.email)),
      'audience', 'registrant'
    );
  end if;

  -- Add responsible lecturer
  if req_row.responsible_lecturer_id <> req_row.registrant_id
     and resp_profile.email is not null
     and position('@' in resp_profile.email) > 0
     and lower(resp_profile.email) <> lower(coalesce(req_row.email_snapshot, reg_profile.email, '')) then
    recipients := recipients || jsonb_build_object(
      'recipient_id', req_row.responsible_lecturer_id,
      'recipient_email', lower(resp_profile.email),
      'audience', 'responsible'
    );
  end if;

  -- Add managers if required
  if sends_to_managers then
    for mgr in (
      select distinct p.id as user_id, lower(btrim(p.email)) as email
      from public.user_roles r
      join public.profiles p on p.id = r.user_id
      where r.role in ('admin', 'staff')
        and p.is_active = true
        and p.email is not null
        and position('@' in p.email) > 0
        and (
          r.role = 'admin'
          or exists (
            select 1 from public.profile_room_types prt
            where prt.profile_id = p.id
              and prt.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
          )
        )
    ) loop
      if not exists (select 1 from jsonb_array_elements(recipients) elem where elem->>'recipient_email' = mgr.email) then
        recipients := recipients || jsonb_build_object(
          'recipient_id', mgr.user_id,
          'recipient_email', mgr.email,
          'audience', 'admin'
        );
      end if;
    end loop;
  end if;

  event_key_val := case
    when target_event = 'deleted' then concat('equipment_request:deleted:', target_request_id)
    else concat('equipment_request:', target_event, ':', target_request_id, ':', coalesce(target_operation_id, gen_random_uuid()))
  end;

  insert into public.email_outbox_events (
    event_key, domain, event_type, aggregate_id, actor_id, payload, recipients, delivery_mode_at_event, status, last_error
  ) values (
    event_key_val,
    'equipment_request',
    target_event,
    target_request_id,
    effective_actor_id,
    payload,
    recipients,
    current_mode,
    'pending',
    null
  ) on conflict (event_key) do nothing
  returning id into outbox_id;

  return outbox_id;
end;
$$;
revoke all on function private.enqueue_equipment_request_outbox_event(uuid, text, uuid, uuid) from public, anon;
grant execute on function private.enqueue_equipment_request_outbox_event(uuid, text, uuid, uuid) to authenticated;

-- 4. Process email outbox events RPC
create or replace function public.process_email_outbox_events(batch_size integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  evt record;
  processed_count integer := 0;
  rcp record;
  subject_text text;
  base_subject text;
  date_label text;
  notif_type text;
  dedupe_val text;
begin
  for evt in (
    with candidates as (
      select id from public.email_outbox_events
      where status = 'pending'
         or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
      order by created_at, id
      for update skip locked
      limit greatest(1, least(coalesce(batch_size, 25), 100))
    ),
    claimed as (
      update public.email_outbox_events e
      set status = 'processing',
          attempts = e.attempts + 1,
          processing_started_at = now()
      from candidates
      where e.id = candidates.id
      returning e.*
    )
    select * from claimed
  ) loop
    date_label := to_char((evt.payload->>'schedule_date')::date, 'DD/MM/YYYY');
    base_subject := concat(evt.payload->>'registrant_name', ' - ', date_label, ' - ', evt.payload->>'course_code', ' - ', evt.payload->>'request_code');
    notif_type := concat('equipment_request_', evt.event_type);

    if evt.delivery_mode_at_event = 'off' then
      for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text) loop
        subject_text := private.format_equipment_email_subject(evt.event_type, rcp.audience, base_subject);
        dedupe_val := concat('outbox_notif:', evt.id, ':', rcp.recipient_id);

        insert into public.email_notifications (
          notification_type,
          recipient_id,
          recipient_email,
          dedupe_key,
          subject,
          payload,
          delivery_mode_at_enqueue,
          status,
          last_error
        ) values (
          notif_type,
          rcp.recipient_id,
          rcp.recipient_email,
          dedupe_val,
          subject_text,
          jsonb_set(evt.payload, '{audience}', to_jsonb(rcp.audience)),
          'off',
          'suppressed',
          'Email được tạo khi chế độ gửi đang tắt.'
        ) on conflict (dedupe_key) do nothing;
      end loop;

      update public.email_outbox_events
      set status = 'suppressed',
          processed_at = now(),
          last_error = 'Email được tạo khi chế độ gửi đang tắt.'
      where id = evt.id;
      processed_count := processed_count + 1;
      continue;
    end if;

    for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text) loop
      subject_text := private.format_equipment_email_subject(evt.event_type, rcp.audience, base_subject);
      dedupe_val := concat('outbox_notif:', evt.id, ':', rcp.recipient_id);

      insert into public.email_notifications (
        notification_type,
        recipient_id,
        recipient_email,
        dedupe_key,
        subject,
        payload,
        delivery_mode_at_enqueue
      ) values (
        notif_type,
        rcp.recipient_id,
        rcp.recipient_email,
        dedupe_val,
        subject_text,
        jsonb_set(evt.payload, '{audience}', to_jsonb(rcp.audience)),
        evt.delivery_mode_at_event
      ) on conflict (dedupe_key) do nothing;
    end loop;

    update public.email_outbox_events
    set status = 'processed',
        processed_at = now()
    where id = evt.id;

    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.process_email_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.process_email_outbox_events(integer) to service_role;

-- 5. Update create_equipment_request_with_items to include outbox event
create or replace function public.create_equipment_request_with_items(
  target_class_schedule_id uuid, target_semester text,
  target_responsible_lecturer_id uuid, target_receive_at timestamptz,
  target_return_at timestamptz, target_note text,
  target_late_registration_reason text, target_items jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  actor_profile public.profiles;
  request_id uuid;
  req_late_status text;
begin
  if actor_id is null or not (select private.is_active_user()) or not (
    (select private.has_role('admin')) or (select private.has_role('staff'))
    or (select private.has_role('importer')) or (select private.has_role('lecturer'))
  ) then raise exception 'Bạn không có quyền tạo phiếu thiết bị.' using errcode = '42501'; end if;
  if target_semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array'
    or jsonb_array_length(target_items) = 0 or jsonb_array_length(target_items) > 500 then
    raise exception 'Danh sách thiết bị phải có từ 1 đến 500 dòng.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.class_schedules schedules
    join public.rooms rooms on rooms.id = schedules.room_id
    where schedules.id = target_class_schedule_id and schedules.schedule_status <> 'cancelled'
      and rooms.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
      and (select private.has_room_type(rooms.room_type_id))
  ) then raise exception 'Lớp Skills lab không hợp lệ.' using errcode = '42501'; end if;
  if target_responsible_lecturer_id <> actor_id and not exists (
    select 1 from public.list_scoped_lecturers('40000000-0000-0000-0000-000000000001'::uuid) lecturers
    where lecturers.id = target_responsible_lecturer_id
  ) then raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501'; end if;
  if exists (
    select 1 from jsonb_to_recordset(target_items) item(skill_name text,catalog_item_id uuid,quantity integer,note text)
    left join public.equipment_catalog catalog on catalog.id = item.catalog_item_id
    where item.skill_name is null or btrim(item.skill_name) = '' or length(item.skill_name) > 200
      or item.catalog_item_id is null or item.quantity is null or item.quantity < 1 or item.quantity > 100000
      or length(coalesce(item.note, '')) > 1000 or catalog.id is null or not catalog.is_active
  ) then raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode = '22023'; end if;
  select * into actor_profile from public.profiles where id = actor_id;
  if actor_profile.id is null or coalesce(actor_profile.phone, '') !~ '^\d{10}$' then
    raise exception 'Hồ sơ Nhân sự chưa có số điện thoại 10 chữ số.' using errcode = '22023';
  end if;
  insert into public.equipment_requests (
    class_schedule_id,semester,registrant_id,responsible_lecturer_id,
    phone_snapshot,email_snapshot,receive_at,return_at,late_registration_reason,note,created_by
  ) values (
    target_class_schedule_id,target_semester,actor_id,target_responsible_lecturer_id,
    actor_profile.phone,actor_profile.email,target_receive_at,target_return_at,
    nullif(btrim(target_late_registration_reason),''),nullif(btrim(target_note),''),actor_id
  ) returning id into request_id;
  insert into public.equipment_request_items(request_id,skill_name,catalog_item_id,quantity,note)
  select request_id,btrim(item.skill_name),item.catalog_item_id,item.quantity,nullif(btrim(item.note),'')
  from jsonb_to_recordset(target_items) item(skill_name text,catalog_item_id uuid,quantity integer,note text);

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

-- 6. Update update_equipment_request_content to include outbox event
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
begin
  if target_semester not in ('HK1','HK2','HK3','HK4') then
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
      semester = target_semester,
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

-- 7. Update add_equipment_request_item to include outbox event
create or replace function public.add_equipment_request_item(
  target_request_id uuid,
  target_skill_name text,
  target_catalog_item_id uuid,
  target_quantity integer,
  target_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_status text;
  new_item_id uuid;
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'ADMIN_OR_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(target_skill_name, '')), '') is null then
    raise exception 'INVALID_SKILL_NAME' using errcode = '22023';
  end if;
  if target_quantity is null or target_quantity < 1 or target_quantity > 9999 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  select r.status into request_status
  from public.equipment_requests r
  where r.id = target_request_id
    and (select private.can_manage_equipment_request(r.id))
  for update;

  if request_status is null then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request_status not in ('new', 'preparing') then
    raise exception 'EQUIPMENT_REQUEST_NOT_EDITABLE' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.equipment_catalog where id = target_catalog_item_id and is_active
  ) then
    raise exception 'CATALOG_ITEM_INACTIVE_OR_MISSING' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.equipment_request_items
    where request_id = target_request_id
      and skill_name = btrim(target_skill_name)
  ) then
    raise exception 'SKILL_NOT_FOUND_IN_REQUEST' using errcode = 'P0002';
  end if;

  insert into public.equipment_request_items (request_id, skill_name, catalog_item_id, quantity, note)
  values (
    target_request_id,
    btrim(target_skill_name),
    target_catalog_item_id,
    target_quantity,
    nullif(btrim(coalesce(target_note, '')), '')
  )
  returning id into new_item_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    actor_id, 'equipment_request.item_added', 'equipment_request', target_request_id,
    jsonb_build_object('item_id', new_item_id, 'catalog_item_id', target_catalog_item_id,
      'skill_name', btrim(target_skill_name), 'quantity', target_quantity)
  );

  perform private.enqueue_equipment_request_outbox_event(
    target_request_id,
    'updated',
    null,
    actor_id
  );

  return new_item_id;
end;
$$;
revoke all on function public.add_equipment_request_item(uuid, text, uuid, integer, text) from public, anon;
grant execute on function public.add_equipment_request_item(uuid, text, uuid, integer, text) to authenticated;

-- 8. Update remove_equipment_request_item to include outbox event
create or replace function public.remove_equipment_request_item(
  target_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_id_val uuid;
  request_status text;
  deleted_count integer;
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select r.id, r.status into request_id_val, request_status
  from public.equipment_request_items items
  join public.equipment_requests r on r.id = items.request_id
  where items.id = target_item_id
    and (
      r.registrant_id = actor_id
      or (select private.can_manage_equipment_request(r.id))
    )
  for update of r;

  if request_id_val is null then
    raise exception 'EQUIPMENT_REQUEST_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if request_status not in ('new', 'preparing') then
    raise exception 'EQUIPMENT_REQUEST_NOT_EDITABLE' using errcode = '42501';
  end if;

  delete from public.equipment_request_items where id = target_item_id;
  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      actor_id, 'equipment_request.item_removed', 'equipment_request', request_id_val,
      jsonb_build_object('item_id', target_item_id)
    );

    perform private.enqueue_equipment_request_outbox_event(
      request_id_val,
      'updated',
      null,
      actor_id
    );
  end if;

  return deleted_count = 1;
end;
$$;
revoke all on function public.remove_equipment_request_item(uuid) from public, anon;
grant execute on function public.remove_equipment_request_item(uuid) to authenticated;

-- 9. Update manager_review_late_equipment_request_scoped_impl to include outbox event
create or replace function public.manager_review_late_equipment_request_scoped_impl(
  target_request_id uuid,
  target_decision text,
  target_note text default null
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được duyệt đăng ký trễ.' using errcode = '42501';
  end if;
  if target_decision not in ('approved', 'rejected') then
    raise exception 'Kết quả duyệt đăng ký trễ không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row
  from public.equipment_requests
  where id = target_request_id
  for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;
  if current_row.late_approval_status <> 'pending' then
    raise exception 'Phiếu không ở trạng thái Chờ duyệt đăng ký trễ.' using errcode = '22023';
  end if;
  if current_row.receive_at <= clock_timestamp() then
    raise exception 'Thời gian nhận thiết bị đã đến hoặc đã qua.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_late_approval_rpc', 'true', true);
  update public.equipment_requests
  set late_approval_status = target_decision,
      late_reviewed_by = actor_id,
      late_reviewed_at = clock_timestamp(),
      late_review_note = nullif(btrim(target_note), '')
  where id = target_request_id
  returning * into changed_row;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, old_data, new_data, metadata
  ) values (
    actor_id,
    case when target_decision = 'approved' then 'approve_late_equipment_registration' else 'reject_late_equipment_registration' end,
    'equipment_request',
    target_request_id,
    jsonb_build_object('late_approval_status', current_row.late_approval_status),
    jsonb_build_object('late_approval_status', target_decision),
    jsonb_build_object('review_note', nullif(btrim(target_note), ''))
  );

  perform private.enqueue_equipment_request_outbox_event(
    target_request_id,
    case when target_decision = 'approved' then 'late_approval_approved' else 'late_approval_rejected' end,
    null,
    actor_id
  );

  return changed_row;
end;
$$;
revoke all on function public.manager_review_late_equipment_request_scoped_impl(uuid, text, text) from public, anon, authenticated;
