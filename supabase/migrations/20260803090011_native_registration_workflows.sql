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

alter table public.class_schedules
  add column basic_medical_registration_id uuid references public.basic_medical_registrations(id) on delete cascade;

create table public.basic_medical_registration_sessions (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.basic_medical_registrations(id) on delete cascade,
  class_schedule_id uuid not null unique references public.class_schedules(id) on delete cascade,
  lesson_title text not null check (btrim(lesson_title) <> ''),
  teaching_lecturer_id uuid not null references public.profiles(id) on delete restrict,
  session_number integer not null check (session_number > 0),
  unique (registration_id, session_number)
);

create table public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  item_name text not null check (btrim(item_name) <> ''),
  commercial_name text,
  item_type text,
  country_of_origin text,
  manufacturer text,
  model text,
  unit text not null check (btrim(unit) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (item_name, commercial_name, model)
);

create table public.equipment_requests (
  id uuid primary key default gen_random_uuid(),
  class_schedule_id uuid not null references public.class_schedules(id) on delete cascade,
  registrant_id uuid not null references public.profiles(id) on delete restrict,
  responsible_lecturer_id uuid not null references public.profiles(id) on delete restrict,
  phone_snapshot text not null check (phone_snapshot ~ '^[0-9]{10}$'),
  email_snapshot text not null,
  receive_at timestamptz not null,
  return_at timestamptz not null check (return_at >= receive_at),
  status text not null default 'new' check (status in ('new','preparing','ready','handed_over','returned','cancelled')),
  handover_file_url text,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_schedule_id)
);

create table public.equipment_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.equipment_requests(id) on delete cascade,
  skill_name text not null check (btrim(skill_name) <> ''),
  catalog_item_id uuid not null references public.equipment_catalog(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  note text,
  created_at timestamptz not null default now()
);

create index basic_medical_registrations_created_by_idx on public.basic_medical_registrations(created_by, created_at desc);
create index equipment_requests_registrant_idx on public.equipment_requests(registrant_id, created_at desc);
create index equipment_request_items_request_idx on public.equipment_request_items(request_id);

create trigger basic_medical_registrations_set_updated_at before update on public.basic_medical_registrations
for each row execute function private.set_updated_at();
create trigger equipment_catalog_set_updated_at before update on public.equipment_catalog
for each row execute function private.set_updated_at();
create trigger equipment_requests_set_updated_at before update on public.equipment_requests
for each row execute function private.set_updated_at();

alter table public.basic_medical_registrations enable row level security;
alter table public.basic_medical_registration_sessions enable row level security;
alter table public.equipment_catalog enable row level security;
alter table public.equipment_requests enable row level security;
alter table public.equipment_request_items enable row level security;

create policy basic_medical_registrations_select on public.basic_medical_registrations for select to authenticated
using ((select private.is_active_user()) and ((select private.has_role('admin')) or (select private.has_role('staff')) or created_by = (select auth.uid()) or registrant_id = (select auth.uid()) or responsible_lecturer_id = (select auth.uid())));
create policy basic_medical_registrations_manage on public.basic_medical_registrations for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')) or created_by = (select auth.uid()))
with check (((select private.has_role('admin')) or (select private.has_role('staff')) or (select private.has_role('importer'))) and created_by = (select auth.uid()));

create policy basic_medical_sessions_select on public.basic_medical_registration_sessions for select to authenticated
using (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id));
create policy basic_medical_sessions_manage on public.basic_medical_registration_sessions for all to authenticated
using (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff')))))
with check (exists (select 1 from public.basic_medical_registrations r where r.id = registration_id and (r.created_by = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff')))));

create policy equipment_catalog_select on public.equipment_catalog for select to authenticated using ((select private.is_active_user()));
create policy equipment_catalog_admin on public.equipment_catalog for all to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')))
with check ((select private.has_role('admin')) or (select private.has_role('staff')));

create policy equipment_requests_select on public.equipment_requests for select to authenticated
using ((select private.is_active_user()) and ((select private.has_role('admin')) or (select private.has_role('staff')) or registrant_id = (select auth.uid()) or responsible_lecturer_id = (select auth.uid())));
create policy equipment_requests_insert on public.equipment_requests for insert to authenticated
with check ((select private.is_active_user()) and registrant_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy equipment_requests_update on public.equipment_requests for update to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')) or registrant_id = (select auth.uid()))
with check ((select private.has_role('admin')) or (select private.has_role('staff')) or registrant_id = (select auth.uid()));

create policy equipment_items_select on public.equipment_request_items for select to authenticated
using (exists (select 1 from public.equipment_requests r where r.id = request_id));
create policy equipment_items_manage on public.equipment_request_items for all to authenticated
using (exists (select 1 from public.equipment_requests r where r.id = request_id and (r.registrant_id = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff')))))
with check (exists (select 1 from public.equipment_requests r where r.id = request_id and (r.registrant_id = (select auth.uid()) or (select private.has_role('admin')) or (select private.has_role('staff')))));

grant select, insert, update, delete on public.basic_medical_registrations, public.basic_medical_registration_sessions,
  public.equipment_catalog, public.equipment_requests, public.equipment_request_items to authenticated;
