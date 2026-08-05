alter table public.equipment_requests
  add column late_approval_status text not null default 'not_required',
  add column late_registration_reason text,
  add column late_requested_at timestamptz,
  add column late_reviewed_by uuid references public.profiles(id) on delete set null,
  add column late_reviewed_at timestamptz,
  add column late_review_note text,
  add constraint equipment_requests_late_approval_status_valid check (
    late_approval_status in ('not_required','pending','approved','rejected')
  ),
  add constraint equipment_requests_late_approval_reason_required check (
    late_approval_status = 'not_required'
    or nullif(btrim(late_registration_reason), '') is not null
  ),
  add constraint equipment_requests_late_review_valid check (
    (late_approval_status in ('not_required','pending') and late_reviewed_by is null and late_reviewed_at is null)
    or (late_approval_status in ('approved','rejected') and late_reviewed_by is not null and late_reviewed_at is not null)
  );

create index equipment_requests_late_approval_pending_idx
  on public.equipment_requests(created_at desc)
  where late_approval_status = 'pending';

create or replace function private.enforce_equipment_late_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('app.equipment_confirmation_rpc', true) = 'true' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.receive_at is not distinct from old.receive_at
    and new.late_registration_reason is not distinct from old.late_registration_reason
    and old.late_approval_status <> 'rejected' then
    return new;
  end if;
  if new.receive_at <= clock_timestamp() then
    raise exception 'Thời gian nhận thiết bị phải sau thời điểm đăng ký.' using errcode = '22023';
  end if;

  perform set_config('app.equipment_late_approval_system', 'true', true);
  if new.receive_at < clock_timestamp() + interval '24 hours' then
    if nullif(btrim(new.late_registration_reason), '') is null then
      raise exception 'Vui lòng nhập Lý do đăng ký trễ.' using errcode = '22023';
    end if;
    new.late_approval_status := 'pending';
    new.late_requested_at := clock_timestamp();
    new.late_reviewed_by := null;
    new.late_reviewed_at := null;
    new.late_review_note := null;
  else
    new.late_approval_status := 'not_required';
    new.late_registration_reason := null;
    new.late_requested_at := null;
    new.late_reviewed_by := null;
    new.late_reviewed_at := null;
    new.late_review_note := null;
  end if;
  return new;
end;
$$;

create trigger equipment_requests_enforce_late_approval
before insert or update on public.equipment_requests
for each row execute function private.enforce_equipment_late_approval();

create or replace function private.guard_equipment_late_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_rank integer;
  new_rank integer;
begin
  if (
    new.late_approval_status is distinct from old.late_approval_status
    or new.late_requested_at is distinct from old.late_requested_at
    or new.late_reviewed_by is distinct from old.late_reviewed_by
    or new.late_reviewed_at is distinct from old.late_reviewed_at
    or new.late_review_note is distinct from old.late_review_note
  ) and current_setting('app.equipment_late_approval_system', true) <> 'true'
    and current_setting('app.equipment_late_approval_rpc', true) <> 'true'
    and current_setting('app.equipment_confirmation_rpc', true) <> 'true' then
    raise exception 'Vui lòng dùng luồng duyệt đăng ký trễ.' using errcode = '42501';
  end if;

  old_rank := case old.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  new_rank := case new.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  if new_rank > old_rank and old.late_approval_status in ('pending', 'rejected') then
    raise exception 'Phiếu chưa được duyệt đăng ký trễ.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger equipment_requests_guard_late_approval
before update on public.equipment_requests
for each row execute function private.guard_equipment_late_approval();

create or replace function public.manager_review_late_equipment_request(
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

  return changed_row;
end;
$$;

revoke execute on function public.manager_review_late_equipment_request(uuid, text, text) from public, anon;
grant execute on function public.manager_review_late_equipment_request(uuid, text, text) to authenticated;

drop function if exists public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb);
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

  return updated_request_id;
end;
$$;

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

revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, jsonb) to authenticated;
revoke execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) from public, anon;
grant execute on function public.update_equipment_request_content(uuid, uuid, text, uuid, timestamptz, timestamptz, text, jsonb) to authenticated;
