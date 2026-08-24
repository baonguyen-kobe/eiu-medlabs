begin;
select plan(13);

select has_table(
  'public',
  'user_notifications',
  'Phase 3B provides one shared user notification table'
);
select has_column('public', 'user_notifications', 'recipient_id', 'notification recipient is stored');
select has_column('public', 'user_notifications', 'read_at', 'read state is stored');
select has_column('public', 'user_notifications', 'dedupe_key', 'notification dedupe key is stored');
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'user_notifications_recipient_created_idx'
  ),
  'notification lookup index exists'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'user_notifications_recipient_unread_idx'
  ),
  'notification unread lookup index exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_notifications'::regclass),
  'notification rows have RLS enabled'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_notifications'
      and policyname = 'user_notifications_recipient_select'
  ),
  'recipient-only select policy exists'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_notifications'
      and policyname = 'user_notifications_recipient_mark_read'
  ),
  'recipient-only read update policy exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_notifications', 'INSERT'),
  'authenticated clients cannot create arbitrary bell notifications'
);
select has_function(
  'public',
  'list_equipment_request_lifecycle_audit',
  array['uuid'],
  'scoped lifecycle audit read RPC exists'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.equipment_requests'::regclass
      and tgname = 'equipment_requests_lifecycle_observer'
      and not tgisinternal
  ),
  'equipment lifecycle observer trigger exists'
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notifications'
  ),
  'notifications are published through Supabase Realtime'
);

select * from finish();
rollback;
