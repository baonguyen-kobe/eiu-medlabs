begin;
select plan(16);

create temp table condition_notification_context (
  actor_id uuid,
  admin_recipient_id uuid,
  staff_recipient_id uuid,
  skills_staff_id uuid,
  viewer_id uuid,
  room_id uuid,
  catalog_item_id uuid,
  inventory_id uuid,
  first_log_id uuid,
  second_log_id uuid,
  damage_outbox_count integer
);
grant select on table condition_notification_context to authenticated;

do $$
declare
  basic_medical_type_id uuid;
  nursing_skills_type_id uuid;
  context_row condition_notification_context%rowtype;
begin
  context_row.actor_id := gen_random_uuid();
  context_row.admin_recipient_id := gen_random_uuid();
  context_row.staff_recipient_id := gen_random_uuid();
  context_row.skills_staff_id := gen_random_uuid();
  context_row.viewer_id := gen_random_uuid();

  select id into basic_medical_type_id
  from public.room_types where code = 'basic_medical';
  select id into nursing_skills_type_id
  from public.room_types where code = 'nursing_skills';

  insert into auth.users (id, email)
  values
    (context_row.actor_id, 'condition-adjustment-actor@eiu.local'),
    (context_row.admin_recipient_id, 'condition-adjustment-admin@eiu.local'),
    (context_row.staff_recipient_id, 'condition-adjustment-staff@eiu.local'),
    (context_row.skills_staff_id, 'condition-adjustment-skills@eiu.local'),
    (context_row.viewer_id, 'condition-adjustment-viewer@eiu.local');

  insert into public.profiles (id, email, full_name, is_active)
  values
    (context_row.actor_id, 'condition-adjustment-actor@eiu.local', 'Condition actor', true),
    (context_row.admin_recipient_id, 'condition-adjustment-admin@eiu.local', 'Condition admin recipient', true),
    (context_row.staff_recipient_id, 'condition-adjustment-staff@eiu.local', 'Condition Basic Medical staff', true),
    (context_row.skills_staff_id, 'condition-adjustment-skills@eiu.local', 'Condition Skills staff', true),
    (context_row.viewer_id, 'condition-adjustment-viewer@eiu.local', 'Condition viewer', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active;

  insert into public.user_roles (user_id, role)
  values
    (context_row.actor_id, 'admin'),
    (context_row.admin_recipient_id, 'admin'),
    (context_row.admin_recipient_id, 'staff'),
    (context_row.staff_recipient_id, 'staff'),
    (context_row.skills_staff_id, 'staff'),
    (context_row.viewer_id, 'viewer');

  insert into public.profile_room_types (profile_id, room_type_id)
  values
    (context_row.admin_recipient_id, basic_medical_type_id),
    (context_row.staff_recipient_id, basic_medical_type_id),
    (context_row.skills_staff_id, nursing_skills_type_id),
    (context_row.viewer_id, basic_medical_type_id)
  on conflict do nothing;

  insert into public.rooms (room_code, building_code, room_name, room_type_id, capacity, is_active)
  values ('COND-01', 'Y', 'Phòng điều chỉnh điều kiện', basic_medical_type_id, 20, true)
  returning id into context_row.room_id;

  insert into public.basic_medical_equipment_catalog (item_name, commercial_name, unit, is_active)
  values ('Thiết bị điều chỉnh điều kiện', 'Condition adjustment equipment', 'cái', true)
  returning id into context_row.catalog_item_id;

  insert into public.basic_medical_room_inventory (
    room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity, is_active
  )
  values (context_row.room_id, context_row.catalog_item_id, 10, 8, 2, true)
  returning id into context_row.inventory_id;

  select count(*)::integer into context_row.damage_outbox_count
  from public.email_outbox_events
  where domain = 'basic_medical_damage';

  insert into condition_notification_context select (context_row).*;
end;
$$;

create or replace function pg_temp.set_condition_actor(target_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', target_user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.basic_medical_equipment_condition_logs'::regclass
      and tgname = 'basic_medical_condition_adjustment_notification'
      and not tgisinternal
  ),
  'condition adjustments have a dedicated committed-log notification observer'
);

select pg_temp.set_condition_actor((select actor_id from condition_notification_context));
select lives_ok(
  $$ select public.adjust_basic_medical_inventory_condition(
    (select inventory_id from condition_notification_context), 7, 3, 'Điều chỉnh thực tế lần một'
  ) $$,
  'a real manager condition adjustment succeeds through the authoritative RPC'
);

update condition_notification_context
set first_log_id = (
  select id from public.basic_medical_equipment_condition_logs
  where inventory_id = (select inventory_id from condition_notification_context)
    and event_type = 'condition_adjustment'
  order by created_at desc, id desc limit 1
);

select isnt(
  (select first_log_id from condition_notification_context), null,
  'a real condition adjustment writes its persisted condition log'
);
select is(
  (select count(*)::integer from public.user_notifications
   where entity_id = (select first_log_id from condition_notification_context)
     and notification_type = 'basic_medical_inventory_condition_adjusted'),
  (
    select count(*)::integer
    from (
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      where profiles.is_active and roles.role = 'admin'
      union
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      join public.profile_room_types as scopes on scopes.profile_id = profiles.id
      join public.rooms on rooms.id = (select room_id from condition_notification_context)
      where profiles.is_active
        and roles.role = 'staff'
        and scopes.room_type_id = rooms.room_type_id
    ) as management_recipients
    where id is distinct from (select actor_id from condition_notification_context)
  ),
  'one real adjustment creates one deduplicated management bell per intended recipient'
);
select ok(
  (select array_agg(recipient_id order by recipient_id) from public.user_notifications
   where entity_id = (select first_log_id from condition_notification_context))
  =
  (
    select array_agg(id order by id)
    from (
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      where profiles.is_active and roles.role = 'admin'
      union
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      join public.profile_room_types as scopes on scopes.profile_id = profiles.id
      join public.rooms on rooms.id = (select room_id from condition_notification_context)
      where profiles.is_active
        and roles.role = 'staff'
        and scopes.room_type_id = rooms.room_type_id
    ) as management_recipients
    where id is distinct from (select actor_id from condition_notification_context)
  ),
  'only authorized Admin and Basic Medical-scoped Staff recipients receive the management bell'
);
select is_empty(
  $$ select recipient_id from public.user_notifications
     where entity_id = (select first_log_id from condition_notification_context)
       and recipient_id in (
         (select actor_id from condition_notification_context),
         (select skills_staff_id from condition_notification_context),
         (select viewer_id from condition_notification_context)
       ) $$,
  'actor, Skills-only Staff, and Viewer are excluded from generic condition adjustment bells'
);
select is(
  (select count(*)::integer from public.user_notifications
   where entity_id = (select first_log_id from condition_notification_context)
     and recipient_id = (select admin_recipient_id from condition_notification_context)),
  1,
  'a dual-role Admin and Staff recipient is deduplicated for one condition-log event'
);
select is(
  (select count(*)::integer from public.email_outbox_events where domain = 'basic_medical_damage'),
  (select damage_outbox_count from condition_notification_context),
  'condition adjustment does not enqueue a repeated Basic Medical damage email'
);

select lives_ok(
  $$ select public.adjust_basic_medical_inventory_condition(
    (select inventory_id from condition_notification_context), 7, 3, 'Không có thay đổi thực tế'
  ) $$,
  'an unchanged condition submission remains an inventory no-op'
);
select is(
  (select count(*)::integer from public.basic_medical_equipment_condition_logs
   where inventory_id = (select inventory_id from condition_notification_context)
     and event_type = 'condition_adjustment'),
  1,
  'no-op adjustment writes no additional condition-adjustment log'
);
select is(
  (select count(*)::integer from public.user_notifications
   where notification_type = 'basic_medical_inventory_condition_adjusted'
     and entity_id = (select first_log_id from condition_notification_context)),
  (
    select count(*)::integer
    from (
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      where profiles.is_active and roles.role = 'admin'
      union
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      join public.profile_room_types as scopes on scopes.profile_id = profiles.id
      join public.rooms on rooms.id = (select room_id from condition_notification_context)
      where profiles.is_active
        and roles.role = 'staff'
        and scopes.room_type_id = rooms.room_type_id
    ) as management_recipients
    where id is distinct from (select actor_id from condition_notification_context)
  ),
  'no-op adjustment writes no additional bell'
);

select lives_ok(
  $$ select public.adjust_basic_medical_inventory_condition(
    (select inventory_id from condition_notification_context), 8, 2, 'Điều chỉnh thực tế lần hai'
  ) $$,
  'a second distinct condition adjustment succeeds'
);
update condition_notification_context
set second_log_id = (
  select id from public.basic_medical_equipment_condition_logs
  where inventory_id = (select inventory_id from condition_notification_context)
    and event_type = 'condition_adjustment'
    and id is distinct from (select first_log_id from condition_notification_context)
  order by created_at desc, id desc limit 1
);
select isnt(
  (select second_log_id from condition_notification_context),
  (select first_log_id from condition_notification_context),
  'each real adjustment has a distinct persisted event identity'
);
select is(
  (select count(*)::integer from public.user_notifications
   where notification_type = 'basic_medical_inventory_condition_adjusted'
     and entity_id in (
       (select first_log_id from condition_notification_context),
       (select second_log_id from condition_notification_context)
     )),
  (
    select 2 * count(*)::integer
    from (
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      where profiles.is_active and roles.role = 'admin'
      union
      select profiles.id
      from public.profiles
      join public.user_roles as roles on roles.user_id = profiles.id
      join public.profile_room_types as scopes on scopes.profile_id = profiles.id
      join public.rooms on rooms.id = (select room_id from condition_notification_context)
      where profiles.is_active
        and roles.role = 'staff'
        and scopes.room_type_id = rooms.room_type_id
    ) as management_recipients
    where id is distinct from (select actor_id from condition_notification_context)
  ),
  'a second real adjustment creates a new set of management bells'
);

set local role authenticated;
select pg_temp.set_condition_actor((select staff_recipient_id from condition_notification_context));
select is(
  (select count(*)::integer from public.user_notifications
   where entity_id = (select first_log_id from condition_notification_context)),
  1,
  'a recipient can read only its own condition-adjustment notification'
);
select pg_temp.set_condition_actor((select viewer_id from condition_notification_context));
select is(
  (select count(*)::integer from public.user_notifications
   where entity_id = (select first_log_id from condition_notification_context)),
  0,
  'an unrelated authenticated user cannot read a manager condition-adjustment notification'
);
reset role;

select * from finish();
rollback;
