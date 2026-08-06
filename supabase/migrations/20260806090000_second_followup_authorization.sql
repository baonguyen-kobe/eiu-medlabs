-- Second safe-review follow-up: make schedule ownership and equipment room
-- scope authoritative for direct RPC calls, RLS mutations and history deletes.

create or replace function private.can_modify_class_schedule(
  target_schedule_id uuid,
  target_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  schedule_row public.class_schedules;
  room_type_value uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then
    return false;
  end if;
  if target_action not in ('assign_lecturers', 'reschedule', 'details', 'delete') then
    return false;
  end if;

  select schedules.* into schedule_row
  from public.class_schedules schedules
  where schedules.id = target_schedule_id;
  if schedule_row.id is null or schedule_row.schedule_status = 'cancelled' then
    return false;
  end if;
  select rooms.room_type_id into room_type_value
  from public.rooms rooms where rooms.id = schedule_row.room_id;

  if (select private.has_role('admin')) then
    return true;
  end if;
  if (select private.has_role('staff')) then
    return (select private.has_room_type(room_type_value));
  end if;
  if (select private.has_role('importer')) then
    return (select private.has_room_type(room_type_value)) and (
      schedule_row.created_by = actor_id
      or exists (
        select 1 from public.import_batches batches
        where batches.id = schedule_row.import_batch_id
          and batches.created_by = actor_id
      )
    );
  end if;
  if (select private.has_role('lecturer')) then
    if target_action in ('reschedule', 'details') then
      return (select private.has_room_type(room_type_value)) and (
        schedule_row.created_by = actor_id
        or actor_id in (schedule_row.lecturer_id, schedule_row.lecturer_2_id)
      );
    end if;
    if target_action = 'delete' then
      return schedule_row.created_by = actor_id
        and (select private.has_room_type(room_type_value))
        and room_type_value = '40000000-0000-0000-0000-000000000001'::uuid;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function private.can_modify_class_schedule(uuid, text) from public, anon;
grant execute on function private.can_modify_class_schedule(uuid, text) to authenticated;

alter function public.assign_class_lecturers(uuid, uuid[])
  rename to assign_class_lecturers_authorized_impl;
revoke all on function public.assign_class_lecturers_authorized_impl(uuid, uuid[])
  from public, anon, authenticated;
create function public.assign_class_lecturers(
  target_schedule_id uuid,
  target_lecturer_ids uuid[]
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_modify_class_schedule(target_schedule_id, 'assign_lecturers')) then
    raise exception 'CLASS_MANAGEMENT_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return public.assign_class_lecturers_authorized_impl(target_schedule_id, target_lecturer_ids);
end;
$$;
revoke all on function public.assign_class_lecturers(uuid, uuid[]) from public, anon;
grant execute on function public.assign_class_lecturers(uuid, uuid[]) to authenticated;

alter function public.reschedule_class(uuid, date)
  rename to reschedule_class_authorized_impl;
revoke all on function public.reschedule_class_authorized_impl(uuid, date)
  from public, anon, authenticated;
create function public.reschedule_class(target_schedule_id uuid, target_schedule_date date)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_modify_class_schedule(target_schedule_id, 'reschedule')) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  return public.reschedule_class_authorized_impl(target_schedule_id, target_schedule_date);
end;
$$;
revoke all on function public.reschedule_class(uuid, date) from public, anon;
grant execute on function public.reschedule_class(uuid, date) to authenticated;

alter function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[])
  rename to update_class_schedule_details_authorized_impl;
revoke all on function public.update_class_schedule_details_authorized_impl(uuid, date, time, time, uuid, integer, uuid[])
  from public, anon, authenticated;
create function public.update_class_schedule_details(
  target_schedule_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_room_id uuid,
  target_student_count integer,
  target_lecturer_ids uuid[] default '{}'::uuid[]
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_modify_class_schedule(target_schedule_id, 'details')) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;
  return public.update_class_schedule_details_authorized_impl(
    target_schedule_id, target_schedule_date, target_start_time, target_end_time,
    target_room_id, target_student_count, target_lecturer_ids
  );
end;
$$;
revoke all on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[])
  from public, anon;
grant execute on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[])
  to authenticated;

drop policy if exists class_schedules_scoped_delete on public.class_schedules;
drop policy if exists class_schedules_authorized_delete on public.class_schedules;
create policy class_schedules_scoped_delete on public.class_schedules
for delete to authenticated
using ((select private.can_modify_class_schedule(id, 'delete')));

create or replace function private.can_manage_equipment_schedule(target_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role('admin')) or (
    (select private.has_role('staff'))
    and exists (
      select 1
      from public.class_schedules schedules
      join public.rooms rooms on rooms.id = schedules.room_id
      where schedules.id = target_schedule_id
        and (select private.has_room_type(rooms.room_type_id))
    )
  );
$$;

create or replace function private.can_manage_equipment_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.equipment_requests requests
    where requests.id = target_request_id
      and (select private.can_manage_equipment_schedule(requests.class_schedule_id))
  );
$$;

revoke all on function private.can_manage_equipment_schedule(uuid) from public, anon;
revoke all on function private.can_manage_equipment_request(uuid) from public, anon;
grant execute on function private.can_manage_equipment_schedule(uuid) to authenticated;
grant execute on function private.can_manage_equipment_request(uuid) to authenticated;

alter function public.manager_confirm_equipment_status(uuid, text)
  rename to manager_confirm_equipment_status_scoped_impl;
revoke all on function public.manager_confirm_equipment_status_scoped_impl(uuid, text)
  from public, anon, authenticated;
create function public.manager_confirm_equipment_status(target_request_id uuid, target_status text)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return public.manager_confirm_equipment_status_scoped_impl(target_request_id, target_status);
end;
$$;
revoke all on function public.manager_confirm_equipment_status(uuid, text) from public, anon;
grant execute on function public.manager_confirm_equipment_status(uuid, text) to authenticated;

alter function public.manager_review_late_equipment_request(uuid, text, text)
  rename to manager_review_late_equipment_request_scoped_impl;
revoke all on function public.manager_review_late_equipment_request_scoped_impl(uuid, text, text)
  from public, anon, authenticated;
create function public.manager_review_late_equipment_request(
  target_request_id uuid,
  target_decision text,
  target_note text default null
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return public.manager_review_late_equipment_request_scoped_impl(
    target_request_id, target_decision, target_note
  );
end;
$$;
revoke all on function public.manager_review_late_equipment_request(uuid, text, text)
  from public, anon;
grant execute on function public.manager_review_late_equipment_request(uuid, text, text)
  to authenticated;

create or replace function private.enforce_equipment_request_room_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
begin
  if (select auth.role()) = 'service_role' or (select private.has_role('admin')) then
    return coalesce(new, old);
  end if;
  if (select private.has_role('staff')) then
    if not (select private.can_manage_equipment_schedule(coalesce(new.class_schedule_id, old.class_schedule_id))) then
      raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
    end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.registrant_id = actor_id and new.created_by = actor_id then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
    (old.registrant_id = actor_id and new.registrant_id = actor_id)
    or (old.responsible_lecturer_id = actor_id and new.responsible_lecturer_id = actor_id)
  ) then
    return new;
  end if;
  raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
end;
$$;

drop trigger if exists equipment_requests_enforce_room_scope on public.equipment_requests;
create trigger equipment_requests_enforce_room_scope
before insert or update or delete on public.equipment_requests
for each row execute function private.enforce_equipment_request_room_scope();

drop policy if exists equipment_requests_select on public.equipment_requests;
create policy equipment_requests_select on public.equipment_requests
for select to authenticated using (
  (select private.is_active_user()) and (
    (select private.can_manage_equipment_request(id))
    or registrant_id = (select auth.uid())
    or responsible_lecturer_id = (select auth.uid())
  )
);
drop policy if exists equipment_requests_update on public.equipment_requests;
create policy equipment_requests_update on public.equipment_requests
for update to authenticated
using (
  (select private.can_manage_equipment_request(id))
  or registrant_id = (select auth.uid())
)
with check (
  (select private.can_manage_equipment_request(id))
  or (registrant_id = (select auth.uid()) and created_by = (select auth.uid()))
);
drop policy if exists equipment_requests_delete on public.equipment_requests;
create policy equipment_requests_delete on public.equipment_requests
for delete to authenticated
using ((select private.can_manage_equipment_request(id)));

drop policy if exists equipment_items_manage on public.equipment_request_items;
create policy equipment_items_manage on public.equipment_request_items
for all to authenticated
using (exists (
  select 1 from public.equipment_requests requests
  where requests.id = request_id
    and requests.status in ('new', 'preparing')
    and (
      requests.registrant_id = (select auth.uid())
      or (select private.can_manage_equipment_request(requests.id))
    )
))
with check (exists (
  select 1 from public.equipment_requests requests
  where requests.id = request_id
    and requests.status in ('new', 'preparing')
    and (
      requests.registrant_id = (select auth.uid())
      or (select private.can_manage_equipment_request(requests.id))
    )
));

-- A delete issued by pattern replacement/cancellation may only remove an
-- unused generated occurrence in the future. Historical and manual rows are
-- silently preserved, including cancellation metadata.
create or replace function private.preserve_staff_shift_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.registration_source <> 'generated'
    or old.status in ('completed', 'cancelled')
    or old.shift_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    return null;
  end if;
  return old;
end;
$$;

drop trigger if exists staff_shifts_preserve_history on public.staff_shifts;
create trigger staff_shifts_preserve_history
before delete on public.staff_shifts
for each row execute function private.preserve_staff_shift_history();

revoke all on function private.enforce_equipment_request_room_scope() from public, anon, authenticated;
revoke all on function private.preserve_staff_shift_history() from public, anon, authenticated;

-- Changing delivery mode is atomic with suppressing only rows that have not
-- been claimed. Processing rows remain owned by their worker, preventing a
-- provider success from being misreported as suppressed.
create or replace function public.set_email_delivery_mode(target_mode text)
returns public.email_delivery_settings
language plpgsql
security definer
set search_path = ''
as $$
declare changed public.email_delivery_settings;
begin
  if not (select private.has_role('admin')) then
    raise exception 'ADMIN_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_mode not in ('off', 'test', 'live') then
    raise exception 'INVALID_EMAIL_DELIVERY_MODE' using errcode = '22023';
  end if;

  update public.email_delivery_settings
  set delivery_mode = target_mode,
      updated_by = (select auth.uid()),
      updated_at = clock_timestamp()
  where setting_key = 'primary'
  returning * into changed;

  if target_mode = 'off' then
    update public.email_notifications
    set status = 'suppressed',
        processing_started_at = null,
        last_error = 'Đã bỏ qua vì hệ thống đang tắt gửi email.'
    where status = 'pending';
  end if;
  return changed;
end;
$$;

revoke all on function public.set_email_delivery_mode(text) from public, anon;
grant execute on function public.set_email_delivery_mode(text) to authenticated;
