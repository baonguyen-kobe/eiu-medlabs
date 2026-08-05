create extension if not exists btree_gist with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;

create type public.app_role as enum ('admin', 'lecturer', 'staff', 'importer');
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
  schedule_status public.schedule_status not null default 'draft',
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedules_course_code_not_blank check (btrim(course_code_snapshot) <> ''),
  constraint class_schedules_course_name_not_blank check (btrim(course_name_snapshot) <> ''),
  constraint class_schedules_valid_time check (end_time > start_time),
  constraint class_schedules_publish_metadata check (
    (schedule_status <> 'published') or (published_at is not null and published_by is not null)
  ),
  constraint class_schedules_cancel_metadata check (
    (schedule_status <> 'cancelled') or (cancelled_at is not null and cancelled_by is not null)
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
create index class_schedules_created_by_idx on public.class_schedules (created_by, created_at desc);
create index class_schedules_import_batch_idx on public.class_schedules (import_batch_id);
create index class_schedules_open_idx
  on public.class_schedules (schedule_date, start_time)
  where schedule_status = 'published' and lecturer_id is null;

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
  shift_type text not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_patterns_weekday_valid check (weekday between 1 and 7),
  constraint shift_patterns_time_valid check (end_time > start_time),
  constraint shift_patterns_dates_valid check (effective_to is null or effective_to >= effective_from)
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
create index staff_shifts_created_by_idx on public.staff_shifts (created_by);

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

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
for each row execute function private.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms
for each row execute function private.set_updated_at();
create trigger class_schedules_set_updated_at before update on public.class_schedules
for each row execute function private.set_updated_at();
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
after insert or update on public.class_schedules
for each row execute function private.audit_business_change();
create trigger staff_shifts_audit
after insert or update on public.staff_shifts
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

create or replace function public.claim_class(target_schedule_id uuid)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.class_schedules;
begin
  if not (select private.has_role('lecturer')) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  update public.class_schedules
  set lecturer_id = (select auth.uid()),
      updated_at = now()
  where id = target_schedule_id
    and schedule_status = 'published'
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
  if not (select private.has_role('lecturer')) then
    raise exception 'LECTURER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.class_schedules
  where id = target_schedule_id
    and lecturer_id = (select auth.uid())
  for update;

  if before_row.id is null then
    raise exception 'NOT_CLASS_OWNER' using errcode = '42501';
  end if;

  if before_row.schedule_status <> 'published'
     or (before_row.schedule_date + before_row.start_time) <=
        (now() at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'CLASS_WITHDRAWAL_CLOSED' using errcode = 'P0001';
  end if;

  update public.class_schedules
  set lecturer_id = null,
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1))
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
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.can_create_schedule_entries() to authenticated;

revoke execute on function public.claim_class(uuid) from public, anon;
revoke execute on function public.withdraw_class(uuid) from public, anon;
revoke execute on function public.register_own_shift(date, time, time, text, uuid, text) from public, anon;
revoke execute on function public.cancel_own_shift(uuid) from public, anon;
grant execute on function public.claim_class(uuid) to authenticated;
grant execute on function public.withdraw_class(uuid) to authenticated;
grant execute on function public.register_own_shift(date, time, time, text, uuid, text) to authenticated;
grant execute on function public.cancel_own_shift(uuid) to authenticated;

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
    schedule_status = 'published'
    or (select private.has_role('admin'))
    or created_by = (select auth.uid())
  )
);

create policy class_schedules_creator_insert on public.class_schedules
for insert to authenticated
with check (
  (select private.can_create_schedule_entries())
  and created_by = (select auth.uid())
  and (
    (select private.has_role('admin'))
    or (
      schedule_status = 'draft'
      and lecturer_id is null
      and published_at is null
      and published_by is null
      and cancelled_at is null
      and cancelled_by is null
    )
  )
);

create policy class_schedules_creator_update_draft on public.class_schedules
for update to authenticated
using (
  created_by = (select auth.uid())
  and schedule_status = 'draft'
  and (select private.can_create_schedule_entries())
)
with check (
  created_by = (select auth.uid())
  and schedule_status = 'draft'
  and lecturer_id is null
  and published_at is null
  and published_by is null
  and cancelled_at is null
  and cancelled_by is null
);

create policy class_schedules_admin_all on public.class_schedules
for all to authenticated
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

grant select on public.profiles, public.user_roles, public.courses, public.rooms,
  public.class_schedules, public.shift_templates, public.staff_shift_patterns,
  public.staff_shifts to authenticated;
grant select, insert, update on public.import_batches, public.import_rows to authenticated;
grant insert, update on public.class_schedules to authenticated;
grant all on public.profiles, public.user_roles, public.courses, public.rooms,
  public.class_schedules, public.shift_templates, public.staff_shift_patterns,
  public.staff_shifts to authenticated;
grant select on public.audit_logs to authenticated;
