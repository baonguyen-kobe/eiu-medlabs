alter table public.profiles
  add column if not exists allow_early_equipment_handover boolean not null default false;

update public.profiles
set allow_early_equipment_handover = true
where lower(btrim(email)) in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn');

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
  return request_id;
end;
$$;

revoke all on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb) to authenticated;

do $migration$
declare
  function_definition text;
  unsafe_fragment text := $unsafe$
  select lower(btrim(profiles.email)) into actor_email
  from public.profiles as profiles where profiles.id = actor_id;
  can_confirm_handover_early :=
    (select private.has_role('admin'))
    and actor_email in ('admin@campus.local', 'bao.nguyen@eiu.edu.vn');
$unsafe$;
  hardened_fragment text := $hardened$
  can_confirm_handover_early :=
    (select private.has_role('admin'))
    and exists (
      select 1 from public.profiles as profiles
      where profiles.id = actor_id and profiles.allow_early_equipment_handover
    );
$hardened$;
begin
  select pg_get_functiondef(procedures.oid) into function_definition
  from pg_proc procedures join pg_namespace namespaces on namespaces.oid = procedures.pronamespace
  where namespaces.nspname='public' and procedures.proname='manager_confirm_equipment_status'
    and pg_get_function_identity_arguments(procedures.oid)='target_request_id uuid, target_status text';
  if function_definition is null or position(unsafe_fragment in function_definition)=0 then
    raise exception 'MANAGER_EQUIPMENT_STATUS_DEFINITION_CHANGED';
  end if;
  execute replace(function_definition, unsafe_fragment, hardened_fragment);
end;
$migration$;
