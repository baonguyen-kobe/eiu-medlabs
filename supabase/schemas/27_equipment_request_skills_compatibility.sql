-- Preserve established Nursing Skills contracts alongside Wave 1 source identity.

create or replace function private.enforce_equipment_request_semester_authority()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_semester text; target_room_type_id uuid; skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if new.request_domain='basic_medical' then
    if new.class_schedule_id is null then
      if tg_op='UPDATE' and old.request_domain='basic_medical' and old.status='cancelled' then new.semester:=old.semester; return new; end if;
      raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode='22023';
    end if;
    select r.semester into target_semester from public.basic_medical_registration_sessions s join public.basic_medical_registrations r on r.id=s.registration_id where s.id=new.source_identity_id and s.class_schedule_id=new.class_schedule_id and r.cancelled_at is null;
    if target_semester is null or target_semester not in ('HK1','HK2','HK3','HK4') then raise exception 'BASIC_MEDICAL_SOURCE_INVALID' using errcode='22023'; end if;
    new.semester:=target_semester; return new;
  end if;
  if new.class_schedule_id is null then raise exception 'Lớp Skills lab không hợp lệ.' using errcode='22023'; end if;
  select s.semester,r.room_type_id into target_semester,target_room_type_id from public.class_schedules s join public.rooms r on r.id=s.room_id where s.id=new.class_schedule_id and s.schedule_status<>'cancelled';
  if target_room_type_id is null or target_room_type_id<>skills_room_type_id then raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode='22023'; end if;
  if target_semester is null or target_semester not in ('HK1','HK2','HK3','HK4') then
    if tg_op='UPDATE' and new.class_schedule_id is not distinct from old.class_schedule_id and old.semester in ('HK1','HK2','HK3','HK4') then new.semester:=old.semester; return new; end if;
    raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode='22023';
  end if;
  new.semester:=target_semester; return new;
end; $$;

create or replace function private.validate_equipment_request_timing()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_schedule_date date; target_room_type_id uuid; receive_local timestamp; return_local timestamp;
  skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid; basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if current_setting('app.equipment_confirmation_rpc',true)='true' then return new; end if;
  if tg_op='UPDATE' and new.class_schedule_id is not distinct from old.class_schedule_id and new.receive_at is not distinct from old.receive_at and new.return_at is not distinct from old.return_at then return new; end if;
  if new.class_schedule_id is null and new.request_domain='basic_medical' and tg_op='UPDATE' and old.status='cancelled' then return new; end if;
  select s.schedule_date,r.room_type_id into target_schedule_date,target_room_type_id from public.class_schedules s join public.rooms r on r.id=s.room_id where s.id=new.class_schedule_id and s.schedule_status<>'cancelled';
  if target_schedule_date is null or (new.request_domain='nursing_skills' and target_room_type_id<>skills_room_type_id) or (new.request_domain='basic_medical' and target_room_type_id<>basic_medical_room_type_id) then
    if new.request_domain='nursing_skills' then raise exception 'Lớp Skills lab không hợp lệ hoặc đã bị hủy.' using errcode='22023'; end if;
    raise exception 'EQUIPMENT_REQUEST_SOURCE_SCHEDULE_INVALID' using errcode='22023';
  end if;
  receive_local:=new.receive_at at time zone 'Asia/Ho_Chi_Minh'; return_local:=new.return_at at time zone 'Asia/Ho_Chi_Minh';
  if new.request_domain='nursing_skills' then
    if receive_local::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Ngày nhận không được trước ngày hiện tại.' using errcode='22023'; end if;
    if receive_local::date > target_schedule_date then raise exception 'Ngày nhận phải bằng hoặc trước ngày học.' using errcode='22023'; end if;
    if return_local < receive_local then raise exception 'Ngày và giờ trả phải sau hoặc bằng thời điểm nhận.' using errcode='22023'; end if;
    if return_local::date < target_schedule_date then raise exception 'Ngày trả phải bằng hoặc sau ngày học.' using errcode='22023'; end if;
    if receive_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') or return_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') then raise exception 'Giờ nhận và trả không hợp lệ.' using errcode='22023'; end if;
  elsif receive_local::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date or receive_local::date > target_schedule_date or return_local < receive_local or return_local::date < target_schedule_date or receive_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') or return_local::time not in (time '09:00',time '11:00',time '14:00',time '16:00') then raise exception 'EQUIPMENT_REQUEST_TIMING_INVALID' using errcode='22023'; end if;
  return new;
end; $$;

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
  return request_id;
end; $$;

create or replace function public.update_equipment_request_content(target_request_id uuid,target_class_schedule_id uuid,target_semester text,target_responsible_lecturer_id uuid,target_receive_at timestamptz,target_return_at timestamptz,target_note text,target_late_registration_reason text,target_items jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare updated_request_id uuid; req_late_status text; actor_id uuid:=(select auth.uid()); target_sched_semester text; current_request record; effective_semester text;
begin
  select req.class_schedule_id,req.semester into current_request from public.equipment_requests req where req.id=target_request_id;
  if current_request.class_schedule_id is null then raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh.' using errcode='42501'; end if;
  if target_class_schedule_id is distinct from current_request.class_schedule_id then raise exception 'EQUIPMENT_REQUEST_DOMAIN_OR_SOURCE_IMMUTABLE' using errcode='22023'; end if;
  select s.semester into target_sched_semester from public.class_schedules s join public.rooms r on r.id=s.room_id where s.id=target_class_schedule_id and s.schedule_status<>'cancelled' and r.room_type_id='40000000-0000-0000-0000-000000000001'::uuid and (select private.has_room_type(r.room_type_id));
  if not found then raise exception 'Lớp Skills lab không hợp lệ.' using errcode='42501'; end if;
  if target_sched_semester in ('HK1','HK2','HK3','HK4') then effective_semester:=target_sched_semester; elsif current_request.semester in ('HK1','HK2','HK3','HK4') then effective_semester:=current_request.semester; else raise exception 'Lịch học chưa có thông tin Học kỳ hợp lệ.' using errcode='22023'; end if;
  if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)=0 then raise exception 'Danh sách thiết bị không hợp lệ.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text) left join public.equipment_catalog c on c.id=i.catalog_item_id where i.skill_name is null or btrim(i.skill_name)='' or i.catalog_item_id is null or i.quantity is null or i.quantity<1 or c.id is null or not c.is_active) then raise exception 'Danh sách thiết bị có dữ liệu không hợp lệ.' using errcode='22023'; end if;
  update public.equipment_requests set semester=effective_semester,responsible_lecturer_id=target_responsible_lecturer_id,receive_at=target_receive_at,return_at=target_return_at,note=nullif(btrim(target_note),''),late_registration_reason=nullif(btrim(target_late_registration_reason),'') where id=target_request_id and status in ('new','preparing') returning id into updated_request_id;
  if updated_request_id is null then raise exception 'Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh.' using errcode='42501'; end if;
  delete from public.equipment_request_items where request_id=target_request_id;
  insert into public.equipment_request_items(request_id,skill_name,catalog_item_id,quantity,note) select target_request_id,btrim(i.skill_name),i.catalog_item_id,i.quantity,nullif(btrim(i.note),'') from jsonb_to_recordset(target_items) i(skill_name text,catalog_item_id uuid,quantity integer,note text);
  select late_approval_status into req_late_status from public.equipment_requests where id=target_request_id;
  perform private.enqueue_equipment_request_outbox_event(target_request_id,case when req_late_status='pending' then 'late_approval_requested' else 'updated' end,null,actor_id);
  return updated_request_id;
end; $$;

revoke all on function private.enforce_equipment_request_semester_authority() from public,anon,authenticated;
revoke all on function private.validate_equipment_request_timing() from public,anon,authenticated;
revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
revoke execute on function public.update_equipment_request_content(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.update_equipment_request_content(uuid,uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
