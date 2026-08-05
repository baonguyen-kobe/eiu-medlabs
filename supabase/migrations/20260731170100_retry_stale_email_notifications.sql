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
        notifications.status in ('pending', 'failed')
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

revoke all on function public.claim_email_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_email_notifications(integer)
  to service_role;
