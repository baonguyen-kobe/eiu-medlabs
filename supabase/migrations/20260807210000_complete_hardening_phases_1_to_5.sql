-- Phase 1: Basic Medical Guard Fix
do $$
declare definition text;
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into definition;
  definition := regexp_replace(
    definition,
    'begin\s+if actor_id is null',
    'begin' || chr(10) || '  perform set_config(''app.basic_medical_registration_mutation'', ''true'', true);' || chr(10) || '  if actor_id is null',
    'i'
  );
  execute definition;
end;
$$;


-- Phase 2: Hard Delete Architecture
create or replace function public.hard_delete_equipment_request(
  target_request_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;
  
  delete from public.equipment_request_items where request_id = target_request_id;
  delete from public.equipment_requests where id = target_request_id;
  get diagnostics deleted_count = row_count;
  
  if deleted_count > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id)
    values (actor_id, 'equipment_request.hard_deleted', 'equipment_request', target_request_id);
  end if;
  return deleted_count > 0;
end;
$$;
revoke all on function public.hard_delete_equipment_request(uuid) from public, anon;
grant execute on function public.hard_delete_equipment_request(uuid) to authenticated;

create or replace function public.hard_delete_class_schedule(
  target_schedule_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.class_schedules
    where id = target_schedule_id and basic_medical_registration_id is not null
  ) then
    raise exception 'ENTITY_HAS_DEPENDENCIES: Cannot hard delete linked basic medical schedule. Hard delete the registration instead.' using errcode = '23503';
  end if;

  if exists (
    select 1 from public.equipment_requests
    where class_schedule_id = target_schedule_id
  ) then
    raise exception 'ENTITY_HAS_DEPENDENCIES: Schedule has equipment requests attached.' using errcode = '23503';
  end if;

  delete from public.class_schedules where id = target_schedule_id;
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id)
    values (actor_id, 'class_schedule.hard_deleted', 'class_schedule', target_schedule_id);
  end if;
  return deleted_count > 0;
end;
$$;
revoke all on function public.hard_delete_class_schedule(uuid) from public, anon;
grant execute on function public.hard_delete_class_schedule(uuid) to authenticated;

create or replace function public.hard_delete_shift_pattern(
  target_pattern_id uuid
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  deleted_count integer;
begin
  if not (select private.can_hard_delete()) then
    raise exception 'HARD_DELETE_AUTHORITY_REQUIRED' using errcode = '42501';
  end if;

  delete from public.shift_pattern_occurrences where pattern_id = target_pattern_id;
  delete from public.shift_patterns where id = target_pattern_id;
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id)
    values (actor_id, 'shift_pattern.hard_deleted', 'shift_pattern', target_pattern_id);
  end if;
  return deleted_count > 0;
end;
$$;
revoke all on function public.hard_delete_shift_pattern(uuid) from public, anon;
grant execute on function public.hard_delete_shift_pattern(uuid) to authenticated;


-- Phase 3: Equipment Request Privacy & Triggers
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment_signatures',
  'equipment_signatures',
  false,
  524288,
  array['image/png', 'image/jpeg']
) on conflict (id) do nothing;

create policy "Signatures are viewable by admin, staff, and the registrant"
on storage.objects for select to authenticated
using (
  bucket_id = 'equipment_signatures'
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (owner = auth.uid())
  )
);

create policy "Signatures can be uploaded by admin, staff, and the registrant"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'equipment_signatures'
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (owner = auth.uid())
  )
);

create policy "Signatures can be deleted by admin, staff"
on storage.objects for delete to authenticated
using (
  bucket_id = 'equipment_signatures'
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
  )
);

alter table public.equipment_requests
  drop constraint if exists equipment_requests_handover_signature_valid,
  drop constraint if exists equipment_requests_return_signature_valid;

alter table public.equipment_requests
  drop column if exists handover_recipient_signature,
  drop column if exists return_recipient_signature;

alter table public.equipment_requests
  add column if not exists handover_signature_path text,
  add column if not exists return_signature_path text;


create or replace function public.manager_confirm_equipment_status(
  target_request_id uuid,
  target_status text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  current_rank integer;
  target_rank integer;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được chuyển trạng thái phiếu.' using errcode = '42501';
  end if;
  if target_status not in ('new','preparing','handed_over','returned','completed') then
    raise exception 'Trạng thái phiếu không hợp lệ.' using errcode = '22023';
  end if;

  select * into current_row from public.equipment_requests
  where id = target_request_id for update;
  if current_row.id is null then
    raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002';
  end if;

  current_rank := case current_row.status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  target_rank := case target_status
    when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2
    when 'returned' then 3 when 'completed' then 4 end;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_rank < current_rank then
    update public.equipment_requests
    set status = target_status,
        handover_staff_confirmed_by = case when target_rank >= 2 then handover_staff_confirmed_by else null end,
        handover_staff_confirmed_at = case when target_rank >= 2 then handover_staff_confirmed_at else null end,
        handover_signature_path = case when target_rank >= 2 then handover_signature_path else null end,
        handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
        handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
        return_staff_confirmed_by = null,
        return_staff_confirmed_at = null,
        return_signature_path = null,
        return_recipient_signed_at = null,
        return_effective_at = null
    where id = target_request_id returning * into changed_row;
    return changed_row;
  end if;

  if target_status = current_row.status
    and target_status not in ('handed_over','returned') then
    return current_row;
  end if;
  if target_status = 'preparing' then
    update public.equipment_requests set status = 'preparing'
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'handed_over' then
    update public.equipment_requests
    set handover_staff_confirmed_by = actor_id,
        handover_staff_confirmed_at = clock_timestamp(),
        status = case when handover_signature_path is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_staff_confirmed_by = actor_id,
        return_staff_confirmed_at = clock_timestamp(),
        status = case when return_signature_path is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

create or replace function public.registrant_confirm_equipment_handoff(
  target_request_id uuid,
  target_phase text,
  target_signature text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  class_start_at timestamptz;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501';
  end if;
  if target_phase not in ('handover','return') then
    raise exception 'Loại xác nhận không hợp lệ.' using errcode = '22023';
  end if;
  if target_signature is null or trim(target_signature) = '' then
    raise exception 'Đường dẫn chữ ký không hợp lệ.' using errcode = '22023';
  end if;

  select requests.* into current_row
  from public.equipment_requests as requests
  where requests.id = target_request_id for update;
  if current_row.id is null or current_row.registrant_id <> actor_id then
    raise exception 'Chỉ Người đăng ký của phiếu được ký xác nhận.' using errcode = '42501';
  end if;
  select ((schedules.schedule_date + schedules.start_time) at time zone 'Asia/Ho_Chi_Minh')
  into class_start_at
  from public.class_schedules as schedules
  where schedules.id = current_row.class_schedule_id;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_phase = 'handover' then
    if current_row.status not in ('new','preparing') then
      raise exception 'Phiếu không còn ở bước xác nhận giao.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set handover_signature_path = target_signature,
        handover_recipient_signed_at = signed_at_value,
        handover_effective_at = case
          when signed_at_value > class_start_at then receive_at
          else signed_at_value end,
        status = case when handover_staff_confirmed_at is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  else
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi ký xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests
    set return_signature_path = target_signature,
        return_recipient_signed_at = signed_at_value,
        return_effective_at = case
          when signed_at_value < return_at then return_at
          else signed_at_value end,
        status = case when return_staff_confirmed_at is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  end if;
  return changed_row;
end;
$$;


-- Equipment request triggers for TB-06 (delete) and TB-02 (item added)
create or replace function private.enqueue_equipment_request_deleted_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registrant_email text;
begin
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled')
     or (tg_op = 'DELETE') then
     
    select email into registrant_email from public.profiles where id = old.registrant_id;
    if registrant_email is not null then
      insert into public.email_notifications (
        notification_type, recipient_id, recipient_email, dedupe_key, subject, payload, delivery_mode
      ) values (
        'equipment_request_deleted', old.registrant_id, registrant_email, 
        concat('equipment_request_deleted:', old.id, ':', old.registrant_id, ':', extract(epoch from now())),
        'Yêu cầu trang thiết bị đã bị hủy', 
        jsonb_build_object('request_id', old.id, 'status', coalesce(new.status, 'deleted')), 
        'immediate'
      ) on conflict do nothing;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists equipment_request_deleted_email on public.equipment_requests;
create trigger equipment_request_deleted_email
after delete or update of status on public.equipment_requests
for each row execute function private.enqueue_equipment_request_deleted_email();


-- Phase 4: Manual Schedule RPC
create or replace function public.create_manual_class_schedule(
  target_course_id uuid,
  target_room_id uuid,
  target_lecturer_id uuid,
  target_lecturer_2_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_note text,
  target_student_count integer
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_row public.class_schedules;
  course_code_val text;
  course_name_val text;
  room_type_val uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select courses.course_code, courses.course_name, courses.room_type_id
  into course_code_val, course_name_val, room_type_val
  from public.courses where id = target_course_id;

  if not (select private.has_role('admin')) 
     and not (select private.has_role('staff')) 
     and not (
       (select private.has_role('lecturer')) and actor_id in (target_lecturer_id, target_lecturer_2_id)
     ) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  if not (select private.has_room_type(room_type_val)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, lecturer_2_id, schedule_date, start_time, end_time,
    source, schedule_status, note, student_count, created_by, published_by, published_at
  ) values (
    target_course_id, course_code_val, course_name_val, target_room_id,
    target_lecturer_id, target_lecturer_2_id, target_schedule_date, target_start_time, target_end_time,
    'manual', 'published', target_note, target_student_count, actor_id, actor_id, clock_timestamp()
  ) returning * into created_row;

  return created_row;
end;
$$;
revoke all on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer) from public, anon;
grant execute on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer) to authenticated;

revoke insert on public.class_schedules from authenticated;

