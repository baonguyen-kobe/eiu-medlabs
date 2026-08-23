-- Domain-aware Equipment Request outbox: Nursing Skills and Basic Medical.

create or replace function private.format_equipment_email_subject(
  target_event text,
  target_audience text,
  base_subject text,
  target_request_domain text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  domain_prefix text := case when target_request_domain = 'basic_medical' then '[Y cơ sở]' else '' end;
  responsible_text text := case when target_request_domain = 'basic_medical' then 'buổi học bạn phụ trách' else 'bạn phụ trách' end;
begin
  if target_request_domain <> 'basic_medical' then
    return private.format_equipment_email_subject(target_event, target_audience, base_subject);
  end if;
  if target_audience = 'admin' then
    if target_event = 'created' then return concat('[Admin MedLabs Calendar]', domain_prefix, '[New] Có đăng ký trang thiết bị mới - ', base_subject); end if;
    if target_event = 'updated' then return concat('[Admin MedLabs Calendar]', domain_prefix, '[Adjusted] Điều chỉnh phiếu đăng ký thiết bị - ', base_subject); end if;
    return concat('[Admin MedLabs Calendar]', domain_prefix, '[Late] Có phiếu chờ duyệt đăng ký trễ - ', base_subject);
  end if;
  if target_audience = 'responsible' then
    if target_event = 'created' then return concat('[MedLabs Calendar]', domain_prefix, '[New] Phiếu thiết bị ', responsible_text, ' - ', base_subject); end if;
    if target_event = 'updated' then return concat('[MedLabs Calendar]', domain_prefix, '[Adjusted] Điều chỉnh phiếu đăng ký thiết bị - ', base_subject); end if;
    if target_event = 'late_approval_requested' then return concat('[MedLabs Calendar]', domain_prefix, '[Late] Phiếu thiết bị ', responsible_text, ' đăng ký trễ - ', base_subject); end if;
    if target_event = 'late_approval_approved' then return concat('[MedLabs Calendar]', domain_prefix, '[Late] Đã duyệt phiếu đăng ký trễ - ', base_subject); end if;
    return concat('[MedLabs Calendar]', domain_prefix, '[Late] Đã từ chối phiếu đăng ký trễ - ', base_subject);
  end if;
  if target_event = 'created' then return concat('[MedLabs Calendar]', domain_prefix, '[New] Xác nhận đăng ký trang thiết bị - ', base_subject); end if;
  if target_event = 'updated' then return concat('[MedLabs Calendar]', domain_prefix, '[Adjusted] Điều chỉnh phiếu đăng ký thiết bị - ', base_subject); end if;
  if target_event = 'late_approval_requested' then return concat('[MedLabs Calendar]', domain_prefix, '[Late] Gửi phiếu đăng ký thiết bị trễ - ', base_subject); end if;
  if target_event = 'late_approval_approved' then return concat('[MedLabs Calendar]', domain_prefix, '[Late] Đã duyệt đăng ký trễ - ', base_subject); end if;
  return concat('[MedLabs Calendar]', domain_prefix, '[Late] Từ chối đăng ký trễ - ', base_subject);
end;
$$;
revoke all on function private.format_equipment_email_subject(text,text,text,text) from public, anon, authenticated;

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
  room_row record;
  actor_name text;
  registrant_profile record;
  responsible_profile record;
  items_json jsonb;
  payload jsonb;
  recipients jsonb := '[]'::jsonb;
  event_key_value text;
  manager_row record;
  outbox_id uuid;
  effective_actor_id uuid := coalesce(target_actor_id, (select auth.uid()));
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
  nursing_skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  select delivery_mode into current_mode from public.email_delivery_settings where setting_key = 'primary';
  if current_mode not in ('test', 'live') then current_mode := 'off'; end if;

  select * into req_row from public.equipment_requests where id = target_request_id;
  if req_row.id is null or req_row.request_domain not in ('nursing_skills', 'basic_medical') then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into registrant_profile from public.profiles where id = req_row.registrant_id;
  select * into responsible_profile from public.profiles where id = req_row.responsible_lecturer_id;
  if effective_actor_id is not null then select full_name into actor_name from public.profiles where id = effective_actor_id; end if;
  select * into sched_row from public.class_schedules where id = req_row.class_schedule_id;
  if sched_row.room_id is not null then select * into room_row from public.rooms where id = sched_row.room_id; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'skill_name', item.skill_name,
    'item_name', case when req_row.request_domain = 'basic_medical' then coalesce(basic_catalog.item_name, 'Thiết bị không còn trong danh mục') else coalesce(skills_catalog.item_name, 'Thiết bị không còn trong danh mục') end,
    'commercial_name', case when req_row.request_domain = 'basic_medical' then coalesce(basic_catalog.commercial_name, '') else coalesce(skills_catalog.commercial_name, '') end,
    'unit', case when req_row.request_domain = 'basic_medical' then coalesce(basic_catalog.unit, '') else coalesce(skills_catalog.unit, '') end,
    'quantity', item.quantity,
    'note', item.note
  )), '[]'::jsonb)
  into items_json
  from public.equipment_request_items item
  left join public.equipment_catalog skills_catalog on skills_catalog.id = item.catalog_item_id
  left join public.basic_medical_equipment_catalog basic_catalog on basic_catalog.id = item.basic_medical_catalog_item_id
  where item.request_id = target_request_id;

  payload := jsonb_build_object(
    'request_id', req_row.id,
    'request_code', to_char(req_row.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYMMDDHH24MISS'),
    'request_domain', req_row.request_domain,
    'event', target_event,
    'actor', coalesce(actor_name, registrant_profile.full_name, 'Người dùng hệ thống'),
    'course_code', coalesce(sched_row.course_code_snapshot, ''),
    'course_name', coalesce(sched_row.course_name_snapshot, ''),
    'schedule_date', sched_row.schedule_date,
    'start_time', to_char(sched_row.start_time, 'HH24:MI'),
    'end_time', to_char(sched_row.end_time, 'HH24:MI'),
    'semester', req_row.semester,
    'student_count', sched_row.student_count,
    'lab_type', case when req_row.request_domain = 'basic_medical' then 'Y cơ sở' else 'Kỹ năng Điều dưỡng' end,
    'room', coalesce(concat_ws(' · ', room_row.room_code, room_row.building_code), ''),
    'room_name', room_row.room_name,
    'registrant_name', coalesce(registrant_profile.full_name, ''),
    'registrant_email', coalesce(req_row.email_snapshot, registrant_profile.email, ''),
    'registrant_phone', coalesce(req_row.phone_snapshot, registrant_profile.phone, ''),
    'responsible_name', coalesce(responsible_profile.full_name, ''),
    'responsible_email', coalesce(responsible_profile.email, ''),
    'receive_at', req_row.receive_at,
    'return_at', req_row.return_at,
    'note', req_row.note,
    'late_approval_status', req_row.late_approval_status,
    'late_registration_reason', req_row.late_registration_reason,
    'late_review_note', req_row.late_review_note,
    'items', items_json
  );

  if req_row.registrant_id is not null and position('@' in coalesce(req_row.email_snapshot, registrant_profile.email, '')) > 0 then
    recipients := recipients || jsonb_build_object('recipient_id', req_row.registrant_id, 'recipient_email', lower(coalesce(req_row.email_snapshot, registrant_profile.email)), 'audience', 'registrant');
  end if;
  if req_row.responsible_lecturer_id <> req_row.registrant_id
    and responsible_profile.is_active
    and position('@' in coalesce(responsible_profile.email, '')) > 0
    and lower(responsible_profile.email) <> lower(coalesce(req_row.email_snapshot, registrant_profile.email, '')) then
    recipients := recipients || jsonb_build_object('recipient_id', req_row.responsible_lecturer_id, 'recipient_email', lower(responsible_profile.email), 'audience', 'responsible');
  end if;

  if target_event not in ('late_approval_approved', 'late_approval_rejected', 'deleted') then
    for manager_row in
      select distinct profile.id as user_id, lower(btrim(profile.email)) as email
      from public.user_roles role_row
      join public.profiles profile on profile.id = role_row.user_id
      where role_row.role in ('admin', 'staff')
        and profile.is_active and position('@' in coalesce(profile.email, '')) > 0
        and (role_row.role = 'admin' or exists (
          select 1 from public.profile_room_types scope
          where scope.profile_id = profile.id
            and scope.room_type_id = case when req_row.request_domain = 'basic_medical' then basic_medical_room_type_id else nursing_skills_room_type_id end
        ))
    loop
      if not exists (select 1 from jsonb_array_elements(recipients) recipient where recipient->>'recipient_email' = manager_row.email) then
        recipients := recipients || jsonb_build_object('recipient_id', manager_row.user_id, 'recipient_email', manager_row.email, 'audience', 'admin');
      end if;
    end loop;
  end if;

  event_key_value := case when target_event = 'deleted' then concat('equipment_request:deleted:', target_request_id) else concat('equipment_request:', target_event, ':', target_request_id, ':', coalesce(target_operation_id, gen_random_uuid())) end;
  insert into public.email_outbox_events(event_key,domain,event_type,aggregate_id,actor_id,payload,recipients,delivery_mode_at_event,status,last_error)
  values(event_key_value,'equipment_request',target_event,target_request_id,effective_actor_id,payload,recipients,current_mode,'pending',null)
  on conflict(event_key) do nothing returning id into outbox_id;
  return outbox_id;
end;
$$;
revoke all on function private.enqueue_equipment_request_outbox_event(uuid,text,uuid,uuid) from public, anon;
grant execute on function private.enqueue_equipment_request_outbox_event(uuid,text,uuid,uuid) to authenticated;

create or replace function public.process_email_outbox_events(batch_size integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  evt record;
  recipient record;
  processed_count integer := 0;
  notification_type_value text;
  fixed_subject text;
  recipient_subject text;
  base_subject text;
  recipient_id_value uuid;
  recipient_email_value text;
  notification_payload jsonb;
  is_equipment_request boolean;
  is_suppressed boolean;
begin
  for evt in (
    with candidates as (
      select id from public.email_outbox_events
      where status = 'pending' or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
      order by created_at, id
      for update skip locked
      limit greatest(1, least(coalesce(batch_size, 25), 100))
    ), claimed as (
      update public.email_outbox_events event_row
      set status = 'processing', attempts = event_row.attempts + 1, processing_started_at = now()
      from candidates where event_row.id = candidates.id returning event_row.*
    ) select * from claimed
  ) loop
    is_equipment_request := evt.domain = 'equipment_request';
    fixed_subject := null;
    if evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created','class_schedule_import_summary','class_schedule_rescheduled','skills_lab_deleted') then
      notification_type_value := evt.event_type;
      fixed_subject := private.format_skills_lab_email_subject(evt.event_type, evt.payload);
    elsif evt.domain = 'basic_medical_registration' then
      notification_type_value := concat('basic_medical_registration_', evt.event_type);
      fixed_subject := private.format_basic_medical_registration_subject(evt.event_type, evt.payload);
    elsif evt.domain = 'basic_medical_damage' then
      notification_type_value := 'basic_medical_room_equipment_damaged';
      fixed_subject := private.format_basic_medical_damage_subject(evt.payload);
    elsif evt.domain = 'basic_medical_schedule' then
      notification_type_value := case when evt.event_type = 'schedule_cancelled' then 'class_schedule_basic_medical_cancelled' else 'class_schedule_basic_medical_updated' end;
      fixed_subject := case when evt.event_type = 'schedule_cancelled' then concat('[MedLabs Calendar] Hủy lịch Y cơ sở · ', evt.payload->>'course_code') else concat('[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · ', evt.payload->>'course_code') end;
    else
      notification_type_value := concat('equipment_request_', evt.event_type);
      is_equipment_request := true;
      base_subject := concat(evt.payload->>'registrant_name', ' - ', to_char((evt.payload->>'schedule_date')::date, 'DD/MM/YYYY'), ' - ', evt.payload->>'course_code', ' - ', evt.payload->>'request_code');
    end if;

    is_suppressed := evt.delivery_mode_at_event = 'off';
    for recipient in select * from jsonb_to_recordset(evt.recipients) as item(recipient_id uuid,recipient_email text,audience text,id uuid,email text) loop
      recipient_id_value := coalesce(recipient.recipient_id, recipient.id);
      recipient_email_value := coalesce(recipient.recipient_email, recipient.email);
      if recipient_id_value is null or recipient_email_value is null then continue; end if;
      recipient_subject := case when is_equipment_request then private.format_equipment_email_subject(evt.event_type, coalesce(recipient.audience, 'registrant'), base_subject, coalesce(evt.payload->>'request_domain', 'nursing_skills')) else fixed_subject end;
      notification_payload := case when is_equipment_request then jsonb_set(evt.payload, '{audience}', to_jsonb(coalesce(recipient.audience, 'registrant'))) else evt.payload end;
      insert into public.email_notifications(notification_type,recipient_id,recipient_email,dedupe_key,subject,payload,delivery_mode_at_enqueue,status,last_error)
      values(notification_type_value,recipient_id_value,recipient_email_value,concat('outbox_notif:',evt.id,':',recipient_id_value),recipient_subject,notification_payload,case when is_suppressed then 'off' else evt.delivery_mode_at_event end,case when is_suppressed then 'suppressed' else 'pending' end,case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end)
      on conflict(dedupe_key) do nothing;
    end loop;
    update public.email_outbox_events
    set status = case when is_suppressed then 'suppressed' else 'processed' end,
        processed_at = now(),
        last_error = case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end
    where id = evt.id;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;
revoke all on function public.process_email_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.process_email_outbox_events(integer) to service_role;

create or replace function public.create_equipment_request_with_items(target_class_schedule_id uuid,target_semester text,target_responsible_lecturer_id uuid,target_receive_at timestamptz,target_return_at timestamptz,target_note text,target_late_registration_reason text,target_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); actor_profile public.profiles; source_row record; request_id uuid; responsible_id uuid; req_late_status text; skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select s.id schedule_id,s.semester schedule_semester,bs.id session_id,bs.lesson_title,bs.teaching_lecturer_id,r.semester registration_semester,r.created_by,r.registrant_id into source_row from public.class_schedules s left join public.basic_medical_registration_sessions bs on bs.class_schedule_id=s.id left join public.basic_medical_registrations r on r.id=bs.registration_id where s.id=target_class_schedule_id and s.schedule_status<>'cancelled' for update of s;
  if source_row.schedule_id is null then raise exception 'EQUIPMENT_REQUEST_SOURCE_NOT_AVAILABLE' using errcode='P0002'; end if;
  if source_row.session_id is null then
    if not (select private.can_manage_equipment_schedule(target_class_schedule_id)) and not (((select private.has_role('lecturer')) or (select private.has_role('teaching_assistant'))) and (select private.has_room_type(skills_room_type_id))) then raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode='42501'; end if;
    responsible_id:=target_responsible_lecturer_id;
    if source_row.schedule_semester is null or source_row.schedule_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text) left join public.equipment_catalog c on c.id=i.catalog_item_id where nullif(btrim(i.skill_name),'') is null or i.quantity is null or i.quantity<1 or c.id is null or not c.is_active) then raise exception 'EQUIPMENT_REQUEST_SKILLS_CATALOG_REQUIRED' using errcode='22023'; end if;
  else
    if not ((select private.can_manage_basic_medical()) or actor_id in (source_row.created_by,source_row.registrant_id,source_row.teaching_lecturer_id)) then raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_SCOPE_REQUIRED' using errcode='42501'; end if;
    responsible_id:=coalesce(target_responsible_lecturer_id,source_row.teaching_lecturer_id);
    if responsible_id<>source_row.teaching_lecturer_id and not ((select private.is_admin()) or (select private.can_manage_basic_medical())) then raise exception 'BASIC_MEDICAL_RESPONSIBLE_OVERRIDE_FORBIDDEN' using errcode='42501'; end if;
    if source_row.registration_semester is null or source_row.registration_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode='22023'; end if;
    if exists(select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text) left join public.basic_medical_equipment_catalog c on c.id=i.catalog_item_id where nullif(btrim(i.skill_name),'') is null or i.quantity is null or i.quantity<1 or c.id is null or not c.is_active) then raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode='22023'; end if;
  end if;
  if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items) not between 1 and 500 then raise exception 'EQUIPMENT_REQUEST_ITEMS_REQUIRED' using errcode='22023'; end if;
  select * into actor_profile from public.profiles where id=actor_id; if actor_profile.id is null or coalesce(actor_profile.phone,'') !~ '^\d{10}$' then raise exception 'EQUIPMENT_REQUEST_PHONE_REQUIRED' using errcode='22023'; end if;
  insert into public.equipment_requests(class_schedule_id,semester,registrant_id,responsible_lecturer_id,phone_snapshot,email_snapshot,receive_at,return_at,late_registration_reason,note,created_by) values(target_class_schedule_id,coalesce(source_row.registration_semester,source_row.schedule_semester),actor_id,responsible_id,actor_profile.phone,actor_profile.email,target_receive_at,target_return_at,nullif(btrim(target_late_registration_reason),''),nullif(btrim(target_note),''),actor_id) returning id,status into request_id,req_late_status;
  insert into public.equipment_request_items(request_id,skill_name,catalog_item_id,basic_medical_catalog_item_id,quantity,note) select request_id,coalesce(nullif(btrim(i.skill_name),''),source_row.lesson_title),case when source_row.session_id is null then i.catalog_item_id else null end,case when source_row.session_id is not null then i.catalog_item_id else null end,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text);
  select late_approval_status into req_late_status from public.equipment_requests where id=request_id;
  perform private.enqueue_equipment_request_outbox_event(request_id,case when req_late_status='pending' then 'late_approval_requested' else 'created' end,null,actor_id);
  return request_id;
end; $$;
revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

create or replace function public.update_basic_medical_equipment_request_content(target_request_id uuid,target_receive_at timestamptz,target_return_at timestamptz,target_note text,target_late_registration_reason text,target_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); request_row record; source_row record; updated_request_id uuid; receive_local timestamp; return_local timestamp; req_late_status text;
begin
  if actor_id is null or not (select private.is_active_user()) then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  select requests.* into request_row from public.equipment_requests requests where requests.id=target_request_id and requests.request_domain='basic_medical' for update;
  if request_row.id is null then raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_FORBIDDEN' using errcode='42501'; end if;
  if request_row.status not in ('new','preparing') then raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_STATUS' using errcode='22023'; end if;
  if request_row.registrant_id<>actor_id and not (select private.can_manage_basic_medical()) then raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_FORBIDDEN' using errcode='42501'; end if;
  select s.id session_id,s.class_schedule_id,s.lesson_title,s.teaching_lecturer_id,s.cancelled_at session_cancelled_at,r.cancelled_at registration_cancelled_at,r.semester registration_semester,c.schedule_date,c.schedule_status into source_row from public.basic_medical_registration_sessions s join public.basic_medical_registrations r on r.id=s.registration_id join public.class_schedules c on c.id=s.class_schedule_id where s.id=request_row.source_identity_id for update of s,c;
  if source_row.session_id is null or source_row.session_cancelled_at is not null or source_row.registration_cancelled_at is not null or source_row.schedule_status='cancelled' then raise exception 'BASIC_MEDICAL_SESSION_CANCELLED' using errcode='22023'; end if;
  if request_row.class_schedule_id is distinct from source_row.class_schedule_id then raise exception 'EQUIPMENT_REQUEST_LIVE_SOURCE_IMMUTABLE' using errcode='22023'; end if;
  if source_row.registration_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'EQUIPMENT_REQUEST_SEMESTER_REQUIRED' using errcode='22023'; end if;
  if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items) not between 1 and 500 then raise exception 'EQUIPMENT_REQUEST_ITEMS_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(target_items) i(catalog_item_id uuid,quantity integer,note text) left join public.basic_medical_equipment_catalog c on c.id=i.catalog_item_id where i.catalog_item_id is null or i.quantity is null or i.quantity<1 or i.quantity>100000 or length(coalesce(i.note,''))>1000 or c.id is null or not c.is_active) then raise exception 'EQUIPMENT_REQUEST_BASIC_MEDICAL_CATALOG_REQUIRED' using errcode='22023'; end if;
  receive_local:=target_receive_at at time zone 'Asia/Ho_Chi_Minh'; return_local:=target_return_at at time zone 'Asia/Ho_Chi_Minh';
  if target_receive_at is null or target_return_at is null or target_return_at<target_receive_at or receive_local::date<(clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date or receive_local::date>source_row.schedule_date or return_local::date<source_row.schedule_date or receive_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') or return_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') then raise exception 'BASIC_MEDICAL_EQUIPMENT_TIMING_INVALID' using errcode='22023'; end if;
  perform set_config('app.basic_medical_equipment_edit_rpc','true',true);
  update public.equipment_requests set responsible_lecturer_id=source_row.teaching_lecturer_id,semester=source_row.registration_semester,receive_at=target_receive_at,return_at=target_return_at,note=nullif(btrim(target_note),''),late_registration_reason=nullif(btrim(target_late_registration_reason),'') where id=target_request_id and request_domain='basic_medical' and status in ('new','preparing') returning id into updated_request_id;
  if updated_request_id is null then raise exception 'BASIC_MEDICAL_EQUIPMENT_EDIT_STATUS' using errcode='22023'; end if;
  delete from public.equipment_request_items where request_id=target_request_id;
  insert into public.equipment_request_items(request_id,skill_name,basic_medical_catalog_item_id,quantity,note) select target_request_id,source_row.lesson_title,i.catalog_item_id,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(catalog_item_id uuid,quantity integer,note text);
  select late_approval_status into req_late_status from public.equipment_requests where id=target_request_id;
  perform private.enqueue_equipment_request_outbox_event(target_request_id,case when req_late_status='pending' then 'late_approval_requested' else 'updated' end,null,actor_id);
  return updated_request_id;
end; $$;
revoke all on function public.update_basic_medical_equipment_request_content(uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.update_basic_medical_equipment_request_content(uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
