-- Feedback round two: remove the draft/publish/complete workflow from product
-- behavior while retaining the existing enum columns for backwards-compatible
-- audit history and soft cancellation.

update public.class_schedules
set schedule_status = 'published',
    published_by = coalesce(published_by, created_by),
    published_at = coalesce(published_at, created_at),
    updated_at = now()
where schedule_status in ('draft', 'completed');

create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
  target_id uuid;
  before_data jsonb;
  after_data jsonb;
begin
  before_data := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_data := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_id := coalesce((after_data ->> 'id')::uuid, (before_data ->> 'id')::uuid);

  if tg_table_name = 'class_schedules' then
    action_name := case
      when tg_op = 'INSERT' then 'class_schedule.created'
      when tg_op = 'DELETE' then 'class_schedule.deleted'
      when old.schedule_status is distinct from new.schedule_status then 'class_schedule.status_changed'
      when old.lecturer_id is distinct from new.lecturer_id then 'class_schedule.lecturer_changed'
      else 'class_schedule.updated'
    end;
  elsif tg_table_name = 'staff_shifts' then
    action_name := case
      when tg_op = 'INSERT' then 'staff_shift.created'
      when old.status is distinct from new.status then 'staff_shift.status_changed'
      else 'staff_shift.updated'
    end;
  elsif tg_table_name = 'import_batches' then
    action_name := case when tg_op = 'INSERT' then 'import.started' else 'import.status_changed' end;
  elsif tg_table_name = 'user_roles' then
    action_name := case when tg_op = 'INSERT' then 'role.assigned' else 'role.removed' end;
    target_id := coalesce((after_data ->> 'user_id')::uuid, (before_data ->> 'user_id')::uuid);
  else
    action_name := 'profile.updated';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, old_data, new_data
  ) values (
    (select auth.uid()), action_name, tg_table_name, target_id, before_data, after_data
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists class_schedules_audit on public.class_schedules;
create trigger class_schedules_audit
after insert or update or delete on public.class_schedules
for each row execute function private.audit_business_change();

create or replace function public.claim_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.class_schedules;
begin
  if not ((select private.has_role('lecturer')) or (select private.has_role('admin'))) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  update public.class_schedules
  set lecturer_id = (select auth.uid()), updated_at = now()
  where id = target_schedule_id
    and schedule_status <> 'cancelled'
    and lecturer_id is null
    and (schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')
  returning * into claimed;

  if claimed.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return claimed;
exception
  when exclusion_violation then
    raise exception 'LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

create or replace function public.withdraw_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  withdrawn public.class_schedules;
begin
  if not ((select private.has_role('lecturer')) or (select private.has_role('admin'))) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.class_schedules
  where id = target_schedule_id and lecturer_id = (select auth.uid())
  for update;

  if before_row.id is null then
    raise exception 'NOT_CLASS_OWNER' using errcode = '42501';
  end if;
  if before_row.schedule_status = 'cancelled'
     or (before_row.schedule_date + before_row.start_time) <=
        (now() at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'CLASS_WITHDRAWAL_CLOSED' using errcode = 'P0001';
  end if;

  update public.class_schedules
  set lecturer_id = null, updated_at = now()
  where id = target_schedule_id
  returning * into withdrawn;
  return withdrawn;
end;
$$;

create or replace function public.create_import_schedule_row(
  target_batch_id uuid,
  target_row_number integer,
  target_hash text,
  target_raw jsonb,
  target_normalized jsonb,
  target_status public.import_row_status,
  target_errors jsonb,
  target_warnings jsonb,
  target_course_id uuid,
  target_course_code text,
  target_course_name text,
  target_room_id uuid,
  target_lecturer_id uuid,
  target_date date,
  target_start time,
  target_end time,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  lecturer_id_value uuid;
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('imported', 'warning') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.import_batches b
    where b.id = target_batch_id and b.created_by = caller_id and b.status = 'importing'
  ) then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;

  lecturer_id_value := case when (select private.has_role('admin')) then target_lecturer_id else null end;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, class_code, schedule_date, start_time, end_time,
    source, source_row_id, import_batch_id, schedule_status, note, created_by,
    published_by, published_at
  ) values (
    target_course_id, target_course_code, target_course_name, target_room_id,
    lecturer_id_value, null, target_date, target_start, target_end,
    'import', null, target_batch_id, 'published', target_note, caller_id,
    caller_id, now()
  )
  returning id into schedule_id;

  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings,
    class_schedule_id
  ) values (
    target_batch_id, target_row_number, null, target_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb),
    coalesce(target_warnings, '[]'::jsonb), schedule_id
  );
  return schedule_id;
end;
$$;

drop policy if exists class_schedules_select on public.class_schedules;
create policy class_schedules_select on public.class_schedules
for select to authenticated
using (
  (select private.is_active_user())
  and (
    schedule_status <> 'cancelled'
    or (select private.has_role('admin'))
    or created_by = (select auth.uid())
  )
);

drop policy if exists class_schedules_creator_insert on public.class_schedules;
create policy class_schedules_creator_insert on public.class_schedules
for insert to authenticated
with check (
  (select private.can_create_schedule_entries())
  and created_by = (select auth.uid())
  and schedule_status = 'published'
  and published_by = (select auth.uid())
  and published_at is not null
  and cancelled_at is null
  and cancelled_by is null
  and ((select private.has_role('admin')) or lecturer_id is null)
);

drop policy if exists class_schedules_creator_update_draft on public.class_schedules;
drop policy if exists class_schedules_authorized_delete on public.class_schedules;
create policy class_schedules_authorized_delete on public.class_schedules
for delete to authenticated
using ((select private.can_create_schedule_entries()));

revoke execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) from public, anon;
grant execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) to authenticated;
