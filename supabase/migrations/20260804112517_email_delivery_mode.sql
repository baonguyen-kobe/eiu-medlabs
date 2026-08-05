create table public.email_delivery_settings (
  setting_key text primary key default 'primary',
  delivery_mode text not null default 'live',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint email_delivery_settings_singleton check (setting_key = 'primary'),
  constraint email_delivery_settings_mode_valid check (
    delivery_mode in ('live', 'test')
  )
);

insert into public.email_delivery_settings (setting_key, delivery_mode)
values ('primary', 'live');

alter table public.email_delivery_settings enable row level security;

revoke all on public.email_delivery_settings from anon, authenticated;
grant select, update on public.email_delivery_settings to service_role;
