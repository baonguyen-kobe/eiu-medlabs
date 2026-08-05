alter table public.email_delivery_settings
  alter column delivery_mode set default 'off';

alter table public.email_delivery_settings
  drop constraint if exists email_delivery_settings_mode_valid;
alter table public.email_delivery_settings
  add constraint email_delivery_settings_mode_valid check (
    delivery_mode in ('off', 'test', 'live')
  );

alter table public.email_notifications
  drop constraint if exists email_notifications_status_valid;
alter table public.email_notifications
  add constraint email_notifications_status_valid check (
    status in ('pending', 'processing', 'sent', 'simulated', 'suppressed', 'failed')
  );

update public.email_delivery_settings
set delivery_mode = 'off', updated_at = now()
where setting_key = 'primary';

update public.email_notifications
set status = 'suppressed',
    processing_started_at = null,
    last_error = 'Đã bỏ qua vì hệ thống đang tắt gửi email.'
where status in ('pending', 'processing');

grant delete on public.email_notifications to service_role;
