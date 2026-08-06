-- Fourth follow-up foundation. Keep the deprecated importer enum value for
-- migration compatibility, but add the real Teaching Assistant role in its own
-- migration transaction before any function references it.
alter type public.app_role add value if not exists 'teaching_assistant' after 'staff';

alter table public.profiles
  add column if not exists can_import_schedules boolean not null default false,
  add column if not exists access_version integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_access_version_positive;
alter table public.profiles
  add constraint profiles_access_version_positive check (access_version >= 1);

create table if not exists public.personnel_auth_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  previous_email text not null,
  requested_email text not null,
  failure_stage text not null,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint personnel_auth_reconciliation_stage_not_blank check (btrim(failure_stage) <> '')
);

create index if not exists personnel_auth_reconciliation_open_idx
  on public.personnel_auth_reconciliation_logs (created_at desc)
  where resolved_at is null;

alter table public.personnel_auth_reconciliation_logs enable row level security;

drop policy if exists personnel_auth_reconciliation_admin_select
  on public.personnel_auth_reconciliation_logs;
create policy personnel_auth_reconciliation_admin_select
on public.personnel_auth_reconciliation_logs
for select to authenticated
using ((select private.has_role('admin')));

grant select on public.personnel_auth_reconciliation_logs to authenticated;
grant all on public.personnel_auth_reconciliation_logs to service_role;
