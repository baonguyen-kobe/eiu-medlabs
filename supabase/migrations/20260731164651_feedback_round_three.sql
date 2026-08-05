-- Feedback round three: effective fixed shifts and aggregate schedule emails.

drop function if exists public.register_own_shift_pattern(smallint, text, text);

alter table public.staff_shift_patterns
  drop constraint if exists staff_shift_patterns_no_overlap;

alter table public.staff_shift_patterns
  add column effective_range daterange generated always as (
    daterange(effective_from, effective_to + 1, '[)')
  ) stored;

alter table public.staff_shift_patterns
  add constraint staff_shift_patterns_no_overlap exclude using gist (
    staff_id with =,
    weekday with =,
    time_range with &&,
    effective_range with &&
  ) where (is_active);

alter table public.staff_shifts
  add column shift_pattern_id uuid
  references public.staff_shift_patterns(id) on delete set null;

create index staff_shifts_pattern_idx
  on public.staff_shifts (shift_pattern_id, shift_date);

create unique index staff_shifts_pattern_occurrence_unique_idx
  on public.staff_shifts (shift_pattern_id, shift_date)
  where shift_pattern_id is not null;

create table public.email_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  dedupe_key text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  constraint email_notifications_type_not_blank check (btrim(notification_type) <> ''),
  constraint email_notifications_recipient_not_blank check (btrim(recipient_email) <> ''),
  constraint email_notifications_subject_not_blank check (btrim(subject) <> ''),
  constraint email_notifications_attempts_non_negative check (attempts >= 0),
  constraint email_notifications_status_valid check (
    status in ('pending', 'processing', 'sent', 'simulated', 'failed')
  )
);

create unique index email_notifications_dedupe_idx
  on public.email_notifications (dedupe_key);
create index email_notifications_dispatch_idx
  on public.email_notifications (status, attempts, created_at)
  where status in ('pending', 'failed');
create index email_notifications_recipient_idx
  on public.email_notifications (recipient_id, created_at desc);

create or replace function private.materialize_shift_pattern(
  target_pattern_id uuid,
  target_horizon_end date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pattern public.staff_shift_patterns;
  materialize_to date;
  occurrence_date date;
begin
  select * into pattern
  from public.staff_shift_patterns
  where id = target_pattern_id
  for update;

  if pattern.id is null or not pattern.is_active then
    return;
  end if;

  materialize_to := least(
    coalesce(pattern.effective_to, pattern.effective_from + 365),
    coalesce(target_horizon_end, pattern.effective_from + 365)
  );

  delete from public.staff_shifts
  where shift_pattern_id = pattern.id
    and shift_date between pattern.effective_from and materialize_to;

  for occurrence_date in
    select generated.day_value::date
    from generate_series(
      pattern.effective_from::timestamp,
      materialize_to::timestamp,
      interval '1 day'
    ) as generated(day_value)
    where extract(isodow from generated.day_value)::smallint = pattern.weekday
    order by generated.day_value
  loop
    delete from public.staff_shifts
    where staff_id = pattern.staff_id
      and shift_date = occurrence_date
      and status <> 'cancelled'
      and time_range && tsrange(
        occurrence_date + pattern.start_time,
        occurrence_date + pattern.end_time,
        '[)'
      );

    insert into public.staff_shifts (
      staff_id, shift_date, start_time, end_time, shift_type,
      shift_template_id, shift_pattern_id, note, status,
      registration_source, created_by
    ) values (
      pattern.staff_id, occurrence_date, pattern.start_time, pattern.end_time,
      pattern.shift_type, null, pattern.id, pattern.note, 'scheduled',
      'generated', pattern.created_by
    );
  end loop;
end;
$$;

create or replace function public.register_own_shift_pattern(
  target_weekday smallint,
  target_shift_type text,
  target_effective_from date,
  target_effective_to date default null,
  target_note text default null
)
returns setof public.staff_shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_type text := upper(btrim(target_shift_type));
  slot record;
  replaced_pattern record;
  created_pattern public.staff_shift_patterns;
begin
  if not (
    (select private.has_role('staff'))
    or (select private.has_role('admin'))
  ) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_weekday not between 1 and 7 then
    raise exception 'INVALID_SHIFT_WEEKDAY' using errcode = '22023';
  end if;
  if target_effective_from is null then
    raise exception 'SHIFT_EFFECTIVE_FROM_REQUIRED' using errcode = '22004';
  end if;
  if target_effective_to is not null and target_effective_to < target_effective_from then
    raise exception 'INVALID_SHIFT_EFFECTIVE_RANGE' using errcode = '22007';
  end if;
  if normalized_type not in ('MORNING', 'AFTERNOON', 'ALL_DAY') then
    raise exception 'INVALID_SHIFT_TYPE' using errcode = '22023';
  end if;

  for slot in
    select * from (
      values
        ('MORNING'::text, time '08:30', time '11:30'),
        ('AFTERNOON'::text, time '13:30', time '16:30')
    ) as available_slots(shift_type, start_time, end_time)
    where normalized_type = 'ALL_DAY' or available_slots.shift_type = normalized_type
    order by available_slots.start_time
  loop
    for replaced_pattern in
      select id
      from public.staff_shift_patterns
      where staff_id = caller_id
        and weekday = target_weekday
        and is_active
        and time_range && tsrange(
          date '2000-01-01' + slot.start_time,
          date '2000-01-01' + slot.end_time,
          '[)'
        )
        and effective_range && daterange(
          target_effective_from,
          target_effective_to + 1,
          '[)'
        )
      order by id
      for update
    loop
      delete from public.staff_shifts
      where shift_pattern_id = replaced_pattern.id;

      update public.staff_shift_patterns
      set is_active = false,
          updated_at = now()
      where id = replaced_pattern.id;
    end loop;

    insert into public.staff_shift_patterns (
      staff_id, weekday, start_time, end_time, shift_type,
      effective_from, effective_to, note, created_by
    ) values (
      caller_id, target_weekday, slot.start_time, slot.end_time, slot.shift_type,
      target_effective_from, target_effective_to,
      nullif(btrim(target_note), ''), caller_id
    )
    returning * into created_pattern;

    perform private.materialize_shift_pattern(created_pattern.id);
    return next created_pattern;
  end loop;
  return;
exception
  when exclusion_violation then
    raise exception 'STAFF_SHIFT_PATTERN_CONFLICT' using errcode = '23P01';
end;
$$;

create or replace function public.cancel_own_shift_pattern(target_pattern_id uuid)
returns public.staff_shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.staff_shift_patterns;
  cancelled_pattern public.staff_shift_patterns;
begin
  select * into before_row
  from public.staff_shift_patterns
  where id = target_pattern_id
    and is_active
    and (
      staff_id = (select auth.uid())
      or (select private.has_role('admin'))
    )
  for update;

  if before_row.id is null then
    raise exception 'NOT_SHIFT_PATTERN_OWNER' using errcode = '42501';
  end if;

  delete from public.staff_shifts
  where shift_pattern_id = target_pattern_id;

  update public.staff_shift_patterns
  set is_active = false,
      updated_at = now()
  where id = target_pattern_id
  returning * into cancelled_pattern;

  return cancelled_pattern;
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
  if new.source <> 'manual' then
    return new;
  end if;

  select concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_label
  from public.rooms as rooms
  where rooms.id = new.room_id;

  select profiles.full_name into lecturer_name
  from public.profiles as profiles
  where profiles.id = new.lecturer_id;

  select profiles.full_name into creator_name
  from public.profiles as profiles
  where profiles.id = new.created_by;

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email,
    dedupe_key, subject, payload
  )
  select
    'class_schedule_created',
    recipient.id,
    recipient.email,
    concat('class_schedule_created:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Lịch lớp mới · ', new.course_code_snapshot),
    jsonb_build_object(
      'schedule_id', new.id,
      'source', 'manual',
      'course_code', new.course_code_snapshot,
      'course_name', new.course_name_snapshot,
      'schedule_date', new.schedule_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'room', coalesce(room_label, 'Chưa có phòng'),
      'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
      'creator', coalesce(creator_name, 'Người tạo phiếu')
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id
        and roles.role in ('staff', 'admin')
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
  if new.status <> 'completed'
     or old.status = 'completed'
     or new.imported_rows <= 0 then
    return new;
  end if;

  select profiles.full_name into creator_name
  from public.profiles as profiles
  where profiles.id = new.created_by;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'schedule_id', schedules.id,
        'course_code', schedules.course_code_snapshot,
        'course_name', schedules.course_name_snapshot,
        'schedule_date', schedules.schedule_date,
        'start_time', schedules.start_time,
        'end_time', schedules.end_time,
        'room', concat_ws(' · ', rooms.room_code, rooms.building_code),
        'lecturer', coalesce(lecturers.full_name, 'Chưa có giảng viên')
      ) order by schedules.schedule_date, schedules.start_time, schedules.id
    ),
    '[]'::jsonb
  ) into schedule_rows
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  left join public.profiles as lecturers on lecturers.id = schedules.lecturer_id
  where schedules.import_batch_id = new.id
    and schedules.schedule_status <> 'cancelled';

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email,
    dedupe_key, subject, payload
  )
  select
    'class_schedule_import_summary',
    recipient.id,
    recipient.email,
    concat('class_schedule_import_summary:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Tổng hợp import · ', new.imported_rows, ' lịch mới'),
    jsonb_build_object(
      'batch_id', new.id,
      'source', 'import',
      'file_name', new.original_file_name,
      'creator', coalesce(creator_name, 'Người import'),
      'completed_at', new.completed_at,
      'total_rows', new.total_rows,
      'imported_rows', new.imported_rows,
      'warning_rows', new.warning_rows,
      'error_rows', new.error_rows,
      'duplicate_rows', new.duplicate_rows,
      'schedules', schedule_rows
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id
        and roles.role in ('staff', 'admin')
    )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create trigger class_schedules_email_outbox
after insert on public.class_schedules
for each row execute function private.enqueue_manual_schedule_email();

create trigger import_batches_email_outbox
after update on public.import_batches
for each row execute function private.enqueue_import_summary_email();

create or replace function public.claim_email_notifications(batch_size integer default 25)
returns setof public.email_notifications
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select notifications.id
    from public.email_notifications as notifications
    where notifications.status in ('pending', 'failed')
      and notifications.attempts < 5
    order by notifications.created_at, notifications.id
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 25), 100))
  )
  update public.email_notifications as notifications
  set status = 'processing',
      attempts = notifications.attempts + 1,
      processing_started_at = now(),
      last_error = null
  from candidates
  where notifications.id = candidates.id
  returning notifications.*;
$$;

alter table public.email_notifications enable row level security;

create policy email_notifications_admin_select on public.email_notifications
for select to authenticated
using ((select private.has_role('admin')));

revoke all on function public.register_own_shift_pattern(smallint, text, date, date, text)
  from public, anon;
grant execute on function public.register_own_shift_pattern(smallint, text, date, date, text)
  to authenticated;

revoke all on function public.claim_email_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_email_notifications(integer)
  to service_role;

grant select on public.email_notifications to authenticated;
