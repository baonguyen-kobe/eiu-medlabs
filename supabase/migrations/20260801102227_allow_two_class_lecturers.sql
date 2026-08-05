alter table public.class_schedules
  add column lecturer_2_id uuid references public.profiles(id) on delete restrict;

alter table public.class_schedules
  add constraint class_schedules_lecturers_distinct check (
    lecturer_id is null or lecturer_2_id is null or lecturer_id <> lecturer_2_id
  );

create index class_schedules_lecturer_2_date_idx
  on public.class_schedules (lecturer_2_id, schedule_date);

drop index if exists public.class_schedules_open_idx;
create index class_schedules_open_idx
  on public.class_schedules (schedule_date, start_time)
  where schedule_status = 'published' and (lecturer_id is null or lecturer_2_id is null);

create or replace function private.prevent_class_lecturer_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lecturer_value uuid;
  target_range tsrange;
begin
  if new.schedule_status = 'cancelled' then
    return new;
  end if;

  if new.lecturer_id is not null and new.lecturer_id = new.lecturer_2_id then
    raise exception 'DUPLICATE_CLASS_LECTURER' using errcode = '23514';
  end if;

  target_range := tsrange(
    new.schedule_date + new.start_time,
    new.schedule_date + new.end_time,
    '[)'
  );

  for lecturer_value in
    select lecturer_id_value
    from unnest(array_remove(array[new.lecturer_id, new.lecturer_2_id]::uuid[], null))
      as lecturer_ids(lecturer_id_value)
    order by lecturer_id_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(lecturer_value::text, 0)
    );

    if exists (
      select 1
      from public.class_schedules as schedules
      where schedules.id <> new.id
        and schedules.schedule_status <> 'cancelled'
        and schedules.time_range && target_range
        and (
          schedules.lecturer_id = lecturer_value
          or schedules.lecturer_2_id = lecturer_value
        )
    ) then
      raise exception 'LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.prevent_class_lecturer_overlap() from public, anon, authenticated;

create trigger class_schedules_prevent_lecturer_overlap
before insert or update of lecturer_id, lecturer_2_id, schedule_date, start_time, end_time, schedule_status
on public.class_schedules
for each row execute function private.prevent_class_lecturer_overlap();

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
      when old.lecturer_id is distinct from new.lecturer_id
        or old.lecturer_2_id is distinct from new.lecturer_2_id
        then 'class_schedule.lecturer_changed'
      else 'class_schedule.updated'
    end;
  elsif tg_table_name = 'staff_shifts' then
    action_name := case
      when tg_op = 'INSERT' then 'staff_shift.created'
      when old.status is distinct from new.status then 'staff_shift.status_changed'
      else 'staff_shift.updated'
    end;
  elsif tg_table_name = 'staff_shift_patterns' then
    action_name := case
      when tg_op = 'INSERT' then 'staff_shift_pattern.created'
      when old.is_active is distinct from new.is_active then 'staff_shift_pattern.status_changed'
      else 'staff_shift_pattern.updated'
    end;
  elsif tg_table_name = 'import_batches' then
    action_name := case
      when tg_op = 'INSERT' then 'import.started'
      else 'import.status_changed'
    end;
  elsif tg_table_name = 'user_roles' then
    action_name := case when tg_op = 'INSERT' then 'role.assigned' else 'role.removed' end;
    target_id := coalesce(
      (after_data ->> 'user_id')::uuid,
      (before_data ->> 'user_id')::uuid
    );
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

create or replace function private.enqueue_manual_schedule_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_label text;
  lecturer_name text;
  creator_name text;
begin
  if new.source <> 'manual' then return new; end if;

  select concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_label from public.rooms as rooms where rooms.id = new.room_id;

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name
  from public.profiles as profiles
  where profiles.id in (new.lecturer_id, new.lecturer_2_id);

  select profiles.full_name into creator_name
  from public.profiles as profiles where profiles.id = new.created_by;

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
  )
  select
    'class_schedule_created', recipient.id, recipient.email,
    concat('class_schedule_created:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Lịch lớp mới · ', new.course_code_snapshot),
    jsonb_build_object(
      'schedule_id', new.id, 'source', 'manual',
      'course_code', new.course_code_snapshot, 'course_name', new.course_name_snapshot,
      'schedule_date', new.schedule_date, 'start_time', new.start_time, 'end_time', new.end_time,
      'room', coalesce(room_label, 'Chưa có phòng'),
      'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
      'creator', coalesce(creator_name, 'Người tạo phiếu')
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id and roles.role in ('staff', 'admin')
    )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function private.enqueue_import_summary_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_name text;
  schedule_rows jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.imported_rows <= 0 then
    return new;
  end if;

  select profiles.full_name into creator_name
  from public.profiles as profiles where profiles.id = new.created_by;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schedule_id', schedules.id, 'course_code', schedules.course_code_snapshot,
        'course_name', schedules.course_name_snapshot, 'schedule_date', schedules.schedule_date,
        'start_time', schedules.start_time, 'end_time', schedules.end_time,
        'room', concat_ws(' · ', rooms.room_code, rooms.building_code),
        'lecturer', coalesce(
          nullif(concat_ws(' · ', lecturers.full_name, lecturers_2.full_name), ''),
          'Chưa có giảng viên'
        )
      ) order by schedules.schedule_date, schedules.start_time, schedules.id
    ),
    '[]'::jsonb
  ) into schedule_rows
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  left join public.profiles as lecturers on lecturers.id = schedules.lecturer_id
  left join public.profiles as lecturers_2 on lecturers_2.id = schedules.lecturer_2_id
  where schedules.import_batch_id = new.id and schedules.schedule_status <> 'cancelled';

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
  )
  select
    'class_schedule_import_summary', recipient.id, recipient.email,
    concat('class_schedule_import_summary:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Tổng hợp import · ', new.imported_rows, ' lịch mới'),
    jsonb_build_object(
      'batch_id', new.id, 'source', 'import', 'file_name', new.original_file_name,
      'creator', coalesce(creator_name, 'Người import'), 'completed_at', new.completed_at,
      'total_rows', new.total_rows, 'imported_rows', new.imported_rows,
      'warning_rows', new.warning_rows, 'error_rows', new.error_rows,
      'duplicate_rows', new.duplicate_rows, 'schedules', schedule_rows
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id and roles.role in ('staff', 'admin')
    )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function public.claim_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  claimed public.class_schedules;
begin
  if not ((select private.has_role('lecturer')) or (select private.has_role('admin'))) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.class_schedules
  where id = target_schedule_id
    and schedule_status <> 'cancelled'
    and (schedule_date + start_time) > (now() at time zone 'Asia/Ho_Chi_Minh')
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if (select auth.uid()) in (before_row.lecturer_id, before_row.lecturer_2_id) then
    raise exception 'CLASS_ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  if before_row.lecturer_id is null then
    update public.class_schedules
    set lecturer_id = (select auth.uid()), updated_at = now()
    where id = target_schedule_id returning * into claimed;
  elsif before_row.lecturer_2_id is null then
    update public.class_schedules
    set lecturer_2_id = (select auth.uid()), updated_at = now()
    where id = target_schedule_id returning * into claimed;
  else
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
  where id = target_schedule_id
    and (select auth.uid()) in (lecturer_id, lecturer_2_id)
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
  set lecturer_id = case
        when lecturer_id = (select auth.uid()) then lecturer_2_id
        else lecturer_id
      end,
      lecturer_2_id = null,
      updated_at = now()
  where id = target_schedule_id
  returning * into withdrawn;

  return withdrawn;
end;
$$;

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
  and (
    (select private.has_role('admin'))
    or (lecturer_id is null and lecturer_2_id is null)
  )
);
