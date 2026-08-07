-- Schema: equipment_transactional_outbox
-- Description: Transactional Outbox for Non-Destructive Equipment Request Mutations (EMAIL-MEDIUM-02)

create table if not exists public.email_outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  domain text not null,
  event_type text not null,
  aggregate_id uuid,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null,
  recipients jsonb not null,
  delivery_mode_at_event text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  last_error text,
  constraint email_outbox_events_delivery_mode_check check (delivery_mode_at_event in ('off', 'test', 'live')),
  constraint email_outbox_events_status_check check (status in ('pending', 'processing', 'processed', 'failed', 'suppressed'))
);

create index if not exists idx_email_outbox_events_pending
  on public.email_outbox_events(created_at, id)
  where status = 'pending';

alter table public.email_outbox_events enable row level security;
revoke all on public.email_outbox_events from public, anon, authenticated;
grant select, insert, update, delete on public.email_outbox_events to service_role;
