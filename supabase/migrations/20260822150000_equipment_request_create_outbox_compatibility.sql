-- Restore the established Nursing Skills creation outbox without applying it to Basic Medical.

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
  if source_row.session_id is null then
    select late_approval_status into req_late_status from public.equipment_requests where id=request_id;
    perform private.enqueue_equipment_request_outbox_event(
      request_id,
      case when req_late_status='pending' then 'late_approval_requested' else 'created' end,
      null,
      actor_id
    );
  end if;
  return request_id;
end; $$;

revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;
