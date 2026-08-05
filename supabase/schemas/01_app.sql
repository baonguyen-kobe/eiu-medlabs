create extension if not exists btree_gist with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;

create type public.app_role as enum ('admin', 'lecturer', 'staff', 'importer', 'viewer');
create type public.schedule_source as enum ('manual', 'import', 'google_sheet');
create type public.schedule_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.shift_status as enum ('scheduled', 'cancelled', 'completed');
create type public.shift_registration_source as enum ('self_registered', 'admin_assigned', 'generated');
create type public.import_status as enum ('uploaded', 'validating', 'ready', 'importing', 'completed', 'failed');
create type public.import_row_status as enum ('valid', 'warning', 'error', 'duplicate', 'imported', 'skipped');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  title text,
  employee_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_name_not_blank check (btrim(full_name) <> '')
);

create unique index profiles_email_unique_idx on public.profiles (lower(email));
create unique index profiles_employee_code_unique_idx
  on public.profiles (upper(btrim(employee_code)))
  where employee_code is not null and btrim(employee_code) <> '';

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, role)
);

create index user_roles_created_by_idx on public.user_roles (created_by);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null,
  course_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_code_not_blank check (btrim(course_code) <> ''),
  constraint courses_name_not_blank check (btrim(course_name) <> '')
);

create unique index courses_code_unique_idx on public.courses (upper(btrim(course_code)));
create index courses_active_name_idx on public.courses (is_active, course_name);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  building_code text not null,
  room_name text,
  room_type text,
  capacity integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_code_not_blank check (btrim(room_code) <> ''),
  constraint rooms_building_not_blank check (btrim(building_code) <> ''),
  constraint rooms_capacity_positive check (capacity is null or capacity > 0)
);

create unique index rooms_code_building_unique_idx
  on public.rooms (upper(btrim(room_code)), upper(btrim(building_code)));
create index rooms_active_type_idx on public.rooms (is_active, room_type);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type public.schedule_source not null default 'import',
  original_file_name text not null,
  file_hash text not null,
  status public.import_status not null default 'uploaded',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  imported_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_batches_counts_non_negative check (
    total_rows >= 0 and valid_rows >= 0 and warning_rows >= 0 and
    error_rows >= 0 and imported_rows >= 0 and duplicate_rows >= 0
  )
);

create index import_batches_created_by_idx on public.import_batches (created_by, created_at desc);
create index import_batches_status_idx on public.import_batches (status, created_at desc);

-- Declared here because room-type policies in the next schema file reference
-- both this registration table and the class schedule foreign-key column.
create table public.basic_medical_registrations (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null check (btrim(academic_year) <> ''),
  semester text not null check (semester in ('HK1','HK2','HK3','HK4')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  course_id uuid not null references public.courses(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  student_count integer not null check (student_count > 0),
  registrant_id uuid not null references public.profiles(id) on delete restrict,
  responsible_lecturer_id uuid not null references public.profiles(id) on delete restrict,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete restrict,
  course_code_snapshot text not null,
  course_name_snapshot text not null,
  room_id uuid not null references public.rooms(id) on delete restrict,
  lecturer_id uuid references public.profiles(id) on delete restrict,
  class_code text,
  schedule_date date not null,
  start_time time not null,
  end_time time not null,
  time_range tsrange generated always as (
    tsrange(schedule_date + start_time, schedule_date + end_time, '[)')
  ) stored,
  source public.schedule_source not null default 'manual',
  source_row_id text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  basic_medical_registration_id uuid references public.basic_medical_registrations(id) on delete cascade,
  schedule_status public.schedule_status not null default 'draft',
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lecturer_2_id uuid references public.profiles(id) on delete restrict,
  constraint class_schedules_course_code_not_blank check (btrim(course_code_snapshot) <> ''),
  constraint class_schedules_course_name_not_blank check (btrim(course_name_snapshot) <> ''),
  constraint class_schedules_valid_time check (end_time > start_time),
  constraint class_schedules_publish_metadata check (
    (schedule_status <> 'published') or (published_at is not null and published_by is not null)
  ),
  constraint class_schedules_cancel_metadata check (
    (schedule_status <> 'cancelled') or (cancelled_at is not null and cancelled_by is not null)
  ),
  constraint class_schedules_lecturers_distinct check (
    lecturer_id is null or lecturer_2_id is null or lecturer_id <> lecturer_2_id
  ),
  constraint class_schedules_room_no_overlap exclude using gist (
    room_id with =,
    time_range with &&
  ) where (schedule_status <> 'cancelled'),
  constraint class_schedules_lecturer_no_overlap exclude using gist (
    lecturer_id with =,
    time_range with &&
  ) where (lecturer_id is not null and schedule_status <> 'cancelled')
);

create index class_schedules_course_id_idx on public.class_schedules (course_id);
create index class_schedules_room_date_idx on public.class_schedules (room_id, schedule_date);
create index class_schedules_lecturer_date_idx on public.class_schedules (lecturer_id, schedule_date);
create index class_schedules_lecturer_2_date_idx on public.class_schedules (lecturer_2_id, schedule_date);
create index class_schedules_created_by_idx on public.class_schedules (created_by, created_at desc);
create index class_schedules_import_batch_idx on public.class_schedules (import_batch_id);
create index class_schedules_open_idx
  on public.class_schedules (schedule_date, start_time)
  where schedule_status = 'published' and (lecturer_id is null or lecturer_2_id is null);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  source_row_id text,
  normalized_row_hash text not null,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  validation_status public.import_row_status not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  class_schedule_id uuid references public.class_schedules(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint import_rows_row_number_positive check (row_number > 0),
  unique (import_batch_id, row_number)
);

create index import_rows_batch_status_idx on public.import_rows (import_batch_id, validation_status);
create index import_rows_hash_idx on public.import_rows (normalized_row_hash);
create index import_rows_schedule_idx on public.import_rows (class_schedule_id);

create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  shift_code text not null,
  shift_name text not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_code_not_blank check (btrim(shift_code) <> ''),
  constraint shift_templates_name_not_blank check (btrim(shift_name) <> ''),
  constraint shift_templates_valid_time check (end_time > start_time)
);

create unique index shift_templates_code_unique_idx on public.shift_templates (upper(btrim(shift_code)));

create table public.staff_shift_patterns (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete restrict,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  time_range tsrange generated always as (
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)')
  ) stored,
  shift_type text not null,
  effective_from date not null,
  effective_to date not null,
  effective_range daterange generated always as (
    daterange(effective_from, effective_to + 1, '[)')
  ) stored,
  is_active boolean not null default true,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_patterns_weekday_valid check (weekday between 1 and 7),
  constraint shift_patterns_time_valid check (end_time > start_time),
  constraint shift_patterns_dates_valid check (effective_to >= effective_from),
  constraint staff_shift_patterns_no_overlap exclude using gist (
    staff_id with =,
    weekday with =,
    time_range with &&,
    effective_range with &&
  ) where (is_active)
);

create index staff_shift_patterns_staff_idx on public.staff_shift_patterns (staff_id, is_active);
create index staff_shift_patterns_created_by_idx on public.staff_shift_patterns (created_by);

create table public.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete restrict,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  time_range tsrange generated always as (
    tsrange(shift_date + start_time, shift_date + end_time, '[)')
  ) stored,
  shift_type text not null,
  shift_template_id uuid references public.shift_templates(id) on delete restrict,
  shift_pattern_id uuid references public.staff_shift_patterns(id) on delete set null,
  note text,
  status public.shift_status not null default 'scheduled',
  registration_source public.shift_registration_source not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_shifts_valid_time check (end_time > start_time),
  constraint staff_shifts_cancel_metadata check (
    (status <> 'cancelled') or (cancelled_at is not null and cancelled_by is not null)
  ),
  constraint staff_shifts_staff_no_overlap exclude using gist (
    staff_id with =,
    time_range with &&
  ) where (status <> 'cancelled')
);

create index staff_shifts_staff_date_idx on public.staff_shifts (staff_id, shift_date);
create index staff_shifts_date_status_idx on public.staff_shifts (shift_date, status);
create index staff_shifts_template_idx on public.staff_shifts (shift_template_id);
create index staff_shifts_pattern_idx on public.staff_shifts (shift_pattern_id, shift_date);
create index staff_shifts_created_by_idx on public.staff_shifts (created_by);
create unique index staff_shifts_pattern_occurrence_unique_idx
  on public.staff_shifts (shift_pattern_id, shift_date)
  where shift_pattern_id is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (btrim(action) <> ''),
  constraint audit_logs_entity_type_not_blank check (btrim(entity_type) <> '')
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

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
    status in ('pending', 'processing', 'sent', 'simulated', 'suppressed', 'failed')
  )
);

create unique index email_notifications_dedupe_idx
  on public.email_notifications (dedupe_key);
create index email_notifications_dispatch_idx
  on public.email_notifications (status, attempts, created_at)
  where status in ('pending', 'failed');
create index email_notifications_recipient_idx
  on public.email_notifications (recipient_id, created_at desc);

create table public.email_delivery_settings (
  setting_key text primary key default 'primary',
  delivery_mode text not null default 'off',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint email_delivery_settings_singleton check (setting_key = 'primary'),
  constraint email_delivery_settings_mode_valid check (
    delivery_mode in ('off', 'test', 'live')
  )
);

insert into public.email_delivery_settings (setting_key, delivery_mode)
values ('primary', 'off');

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
for each row execute function private.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms
for each row execute function private.set_updated_at();
create trigger class_schedules_set_updated_at before update on public.class_schedules
for each row execute function private.set_updated_at();
create trigger class_schedules_prevent_lecturer_overlap
before insert or update of lecturer_id, lecturer_2_id, schedule_date, start_time, end_time, schedule_status
on public.class_schedules
for each row execute function private.prevent_class_lecturer_overlap();
create trigger shift_templates_set_updated_at before update on public.shift_templates
for each row execute function private.set_updated_at();
create trigger staff_shift_patterns_set_updated_at before update on public.staff_shift_patterns
for each row execute function private.set_updated_at();
create trigger staff_shifts_set_updated_at before update on public.staff_shifts
for each row execute function private.set_updated_at();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
  );
$$;

create or replace function private.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user())
    and exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role = required_role
    );
$$;

create or replace function private.can_create_schedule_entries()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_user())
    and exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role in ('admin', 'staff', 'importer')
    );
$$;

create or replace function private.write_audit(
  action_name text,
  target_type text,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  extra_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, old_data, new_data, metadata
  ) values (
    (select auth.uid()), action_name, target_type, target_id,
    before_data, after_data, coalesce(extra_metadata, '{}'::jsonb)
  );
$$;

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

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger class_schedules_audit
after insert or update or delete on public.class_schedules
for each row execute function private.audit_business_change();
create trigger staff_shifts_audit
after insert or update on public.staff_shifts
for each row execute function private.audit_business_change();
create trigger staff_shift_patterns_audit
after insert or update on public.staff_shift_patterns
for each row execute function private.audit_business_change();
create trigger import_batches_audit
after insert or update on public.import_batches
for each row execute function private.audit_business_change();
create trigger user_roles_audit
after insert or delete on public.user_roles
for each row execute function private.audit_business_change();
create trigger profiles_audit
after update on public.profiles
for each row
when (old.is_active is distinct from new.is_active)
execute function private.audit_business_change();

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

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name
  from public.profiles as profiles
  where profiles.id in (new.lecturer_id, new.lecturer_2_id);

  select profiles.full_name
  into creator_name
  from public.profiles as profiles
  where profiles.id = new.created_by;

  insert into public.email_notifications (
    notification_type,
    recipient_id,
    recipient_email,
    dedupe_key,
    subject,
    payload
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
      select 1
      from public.user_roles as roles
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

  select profiles.full_name
  into creator_name
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
        'lecturer', coalesce(
          nullif(concat_ws(' · ', lecturers.full_name, lecturers_2.full_name), ''),
          'Chưa có giảng viên'
        )
      )
      order by schedules.schedule_date, schedules.start_time, schedules.id
    ),
    '[]'::jsonb
  )
  into schedule_rows
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  left join public.profiles as lecturers on lecturers.id = schedules.lecturer_id
  left join public.profiles as lecturers_2 on lecturers_2.id = schedules.lecturer_2_id
  where schedules.import_batch_id = new.id
    and schedules.schedule_status <> 'cancelled';

  insert into public.email_notifications (
    notification_type,
    recipient_id,
    recipient_email,
    dedupe_key,
    subject,
    payload
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
      select 1
      from public.user_roles as roles
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
    where (
        notifications.status = 'pending'
        or (
          notifications.status = 'processing'
          and notifications.processing_started_at < now() - interval '10 minutes'
        )
      )
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
    set lecturer_id = (select auth.uid()),
        updated_at = now()
    where id = target_schedule_id
    returning * into claimed;
  elsif before_row.lecturer_2_id is null then
    update public.class_schedules
    set lecturer_2_id = (select auth.uid()),
        updated_at = now()
    where id = target_schedule_id
    returning * into claimed;
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

create or replace function public.register_own_shift(
  target_date date,
  target_start time,
  target_end time,
  target_shift_type text,
  target_template_id uuid default null,
  target_note text default null
)
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_shift public.staff_shifts;
begin
  if not (select private.has_role('staff')) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_end <= target_start then
    raise exception 'INVALID_SHIFT_TIME' using errcode = '22007';
  end if;
  if (target_date + target_start) <= (now() at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'SHIFT_REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.staff_shifts (
    staff_id, shift_date, start_time, end_time, shift_type,
    shift_template_id, note, registration_source, created_by
  ) values (
    (select auth.uid()), target_date, target_start, target_end,
    btrim(target_shift_type), target_template_id, nullif(btrim(target_note), ''),
    'self_registered', (select auth.uid())
  )
  returning * into created_shift;

  return created_shift;
exception
  when exclusion_violation then
    raise exception 'STAFF_SHIFT_CONFLICT' using errcode = '23P01';
end;
$$;

create or replace function public.cancel_own_shift(target_shift_id uuid)
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.staff_shifts;
  cancelled_shift public.staff_shifts;
begin
  if not (select private.has_role('staff')) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.staff_shifts
  where id = target_shift_id
    and staff_id = (select auth.uid())
  for update;

  if before_row.id is null then
    raise exception 'NOT_SHIFT_OWNER' using errcode = '42501';
  end if;
  if before_row.status <> 'scheduled'
     or (before_row.shift_date + before_row.start_time) <=
        (now() at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'SHIFT_CANCELLATION_CLOSED' using errcode = 'P0001';
  end if;

  update public.staff_shifts
  set status = 'cancelled',
      cancelled_by = (select auth.uid()),
      cancelled_at = now(),
      updated_at = now()
  where id = target_shift_id
  returning * into cancelled_shift;

  return cancelled_shift;
end;
$$;

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
    pattern.effective_to,
    coalesce(
      target_horizon_end,
      pattern.effective_to
    )
  );

  delete from public.staff_shifts
  where shift_pattern_id = pattern.id;

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

create or replace function private.refresh_open_shift_patterns()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pattern_id uuid;
  business_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  for pattern_id in
    select patterns.id
    from public.staff_shift_patterns as patterns
    where patterns.is_active
      and patterns.effective_from <= business_today + 365
      and patterns.effective_to >= business_today
    order by patterns.id
  loop
    perform private.materialize_shift_pattern(pattern_id);
  end loop;
end;
$$;

select cron.schedule(
  'medlabs-refresh-open-shift-patterns',
  '15 17 * * *',
  'select private.refresh_open_shift_patterns();'
);

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
  resolved_effective_to date;
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
  resolved_effective_to := coalesce(
    target_effective_to,
    (target_effective_from + interval '3 months')::date - 1
  );
  if resolved_effective_to < target_effective_from then
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
          resolved_effective_to + 1,
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
      target_effective_from, resolved_effective_to,
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
    where b.id = target_batch_id
      and b.created_by = caller_id
      and b.status = 'importing'
  ) then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;

  lecturer_id_value := case
    when (select private.has_role('admin')) then target_lecturer_id
    else null
  end;

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

create or replace function public.hook_only_precreated_personnel(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce((event -> 'user' -> 'app_metadata' ->> 'preapproved')::boolean, false) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Email chưa được tạo trong danh sách Nhân sự.'
    )
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    case
      when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
        then lower(coalesce(new.email, '')) like '%@eiu.edu.vn'
      else true
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.hook_only_precreated_personnel(jsonb) from public, anon, authenticated;
grant execute on function public.hook_only_precreated_personnel(jsonb) to supabase_auth_admin;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.can_create_schedule_entries() to authenticated;

revoke execute on function public.claim_class(uuid) from public, anon;
revoke execute on function public.withdraw_class(uuid) from public, anon;
revoke execute on function public.register_own_shift(date, time, time, text, uuid, text) from public, anon;
revoke execute on function public.cancel_own_shift(uuid) from public, anon;
revoke execute on function public.register_own_shift_pattern(smallint, text, date, date, text) from public, anon;
revoke execute on function public.cancel_own_shift_pattern(uuid) from public, anon;
revoke execute on function public.claim_email_notifications(integer) from public, anon, authenticated;

create or replace function public.list_active_people()
returns table (id uuid, full_name text, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_user()) then
    raise exception 'Tài khoản không hoạt động hoặc không có quyền truy cập.'
      using errcode = '42501';
  end if;

  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles as profiles
  where profiles.is_active = true
  order by profiles.full_name;
end;
$$;

revoke all on function public.list_active_people() from public, anon;
grant execute on function public.list_active_people() to authenticated;

grant execute on function public.claim_class(uuid) to authenticated;
grant execute on function public.withdraw_class(uuid) to authenticated;
grant execute on function public.register_own_shift(date, time, time, text, uuid, text) to authenticated;
grant execute on function public.cancel_own_shift(uuid) to authenticated;
grant execute on function public.register_own_shift_pattern(smallint, text, date, date, text) to authenticated;
grant execute on function public.cancel_own_shift_pattern(uuid) to authenticated;
grant execute on function public.claim_email_notifications(integer) to service_role;
revoke execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) from public, anon;
grant execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.courses enable row level security;
alter table public.rooms enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.class_schedules enable row level security;
alter table public.shift_templates enable row level security;
alter table public.staff_shift_patterns enable row level security;
alter table public.staff_shifts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.email_notifications enable row level security;
alter table public.email_delivery_settings enable row level security;

create policy profiles_select_active_users on public.profiles
for select to authenticated
using ((select private.is_active_user()));

create policy profiles_admin_all on public.profiles
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy user_roles_select_active on public.user_roles
for select to authenticated
using ((select private.is_active_user()));

create policy user_roles_admin_all on public.user_roles
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy courses_select_active_users on public.courses
for select to authenticated
using ((select private.is_active_user()));

create policy courses_admin_all on public.courses
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy rooms_select_active_users on public.rooms
for select to authenticated
using ((select private.is_active_user()));

create policy rooms_admin_all on public.rooms
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

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

create policy class_schedules_authorized_delete on public.class_schedules
for delete to authenticated
using ((select private.can_create_schedule_entries()));

create policy class_schedules_admin_update on public.class_schedules
for update to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy import_batches_select on public.import_batches
for select to authenticated
using (
  (select private.has_role('admin'))
  or created_by = (select auth.uid())
);

create policy import_batches_insert on public.import_batches
for insert to authenticated
with check (
  (select private.can_create_schedule_entries())
  and created_by = (select auth.uid())
);

create policy import_batches_owner_update on public.import_batches
for update to authenticated
using (
  (select private.has_role('admin'))
  or (created_by = (select auth.uid()) and status not in ('completed', 'failed'))
)
with check (
  (select private.has_role('admin'))
  or created_by = (select auth.uid())
);

create policy import_rows_select on public.import_rows
for select to authenticated
using (
  exists (
    select 1 from public.import_batches b
    where b.id = import_batch_id
      and (b.created_by = (select auth.uid()) or (select private.has_role('admin')))
  )
);

create policy import_rows_insert on public.import_rows
for insert to authenticated
with check (
  exists (
    select 1 from public.import_batches b
    where b.id = import_batch_id
      and b.created_by = (select auth.uid())
      and (select private.can_create_schedule_entries())
  )
);

create policy shift_templates_select_active on public.shift_templates
for select to authenticated
using ((select private.is_active_user()));

create policy shift_templates_admin_all on public.shift_templates
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy shift_patterns_select on public.staff_shift_patterns
for select to authenticated
using ((select private.is_active_user()));

create policy shift_patterns_admin_all on public.staff_shift_patterns
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy staff_shifts_select on public.staff_shifts
for select to authenticated
using ((select private.is_active_user()));

create policy staff_shifts_admin_all on public.staff_shifts
for all to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));

create policy audit_logs_admin_select on public.audit_logs
for select to authenticated
using ((select private.has_role('admin')));

create policy email_notifications_admin_select on public.email_notifications
for select to authenticated
using ((select private.has_role('admin')));

grant select on public.profiles, public.user_roles, public.courses, public.rooms,
  public.class_schedules, public.shift_templates, public.staff_shift_patterns,
  public.staff_shifts to authenticated;
grant select, insert, update on public.import_batches, public.import_rows to authenticated;
grant insert, update on public.class_schedules to authenticated;
grant all on public.profiles, public.user_roles, public.courses, public.rooms,
  public.class_schedules, public.shift_templates, public.staff_shift_patterns,
  public.staff_shifts to authenticated;
grant select on public.audit_logs, public.email_notifications to authenticated;

-- Server-side directory imports use the secret/service role. Keep this grant
-- intentionally limited to the three tables the import workflow reads/writes.
grant select, insert, update on public.profiles, public.user_roles, public.courses
  to service_role;
grant select, insert, update, delete on public.email_notifications to service_role;
grant select, update on public.email_delivery_settings to service_role;
