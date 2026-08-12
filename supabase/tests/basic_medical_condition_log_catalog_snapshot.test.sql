begin;

select plan(30);

create temp table y09_context (
  manager_id uuid,
  viewer_id uuid,
  room_id uuid,
  catalog_id uuid,
  inventory_id uuid,
  snapshot_log_id uuid,
  legacy_log_id uuid
);

grant select, update on table y09_context to authenticated;

do $$
declare
  basic_medical_room_type_id uuid;
begin
  select id into strict basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical';

  insert into auth.users (id, email) values
    ('99000000-0000-4000-8000-000000000001', 'y09-manager@example.test'),
    ('99000000-0000-4000-8000-000000000002', 'y09-viewer@example.test');

  insert into public.profiles (id, email, full_name, is_active) values
    ('99000000-0000-4000-8000-000000000001', 'y09-manager@example.test', 'Y09 Manager', true),
    ('99000000-0000-4000-8000-000000000002', 'y09-viewer@example.test', 'Y09 Viewer', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active;

  insert into public.user_roles (user_id, role) values
    ('99000000-0000-4000-8000-000000000001', 'admin'),
    ('99000000-0000-4000-8000-000000000002', 'viewer');

  insert into public.profile_room_types (profile_id, room_type_id) values
    ('99000000-0000-4000-8000-000000000002', basic_medical_room_type_id)
  on conflict do nothing;

  insert into public.rooms (
    id, room_code, building_code, room_name, room_type_id, capacity, is_active
  ) values (
    '99000000-0000-4000-8000-000000000003', 'Y09-R', 'Y09-B',
    'Y09 Snapshot Room', basic_medical_room_type_id, 20, true
  );

  insert into public.basic_medical_equipment_catalog (
    id, item_name, commercial_name, unit, is_active
  ) values (
    '99000000-0000-4000-8000-000000000004',
    'Y09 Original Name', 'Y09 Original Commercial', 'piece', true
  );

  insert into public.basic_medical_room_inventory (
    id, room_id, catalog_item_id, total_quantity, good_quantity,
    damaged_quantity, is_active
  ) values (
    '99000000-0000-4000-8000-000000000005',
    '99000000-0000-4000-8000-000000000003',
    '99000000-0000-4000-8000-000000000004',
    5, 5, 0, true
  );

  insert into y09_context (
    manager_id, viewer_id, room_id, catalog_id, inventory_id
  ) values (
    '99000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000002',
    '99000000-0000-4000-8000-000000000003',
    '99000000-0000-4000-8000-000000000004',
    '99000000-0000-4000-8000-000000000005'
  );
end;
$$;

select has_column(
  'public', 'basic_medical_equipment_condition_logs', 'catalog_item_id_snapshot',
  'condition logs store a catalog identity snapshot'
);
select has_column(
  'public', 'basic_medical_equipment_condition_logs', 'item_name_snapshot',
  'condition logs store an item-name snapshot'
);
select has_column(
  'public', 'basic_medical_equipment_condition_logs', 'commercial_name_snapshot',
  'condition logs store an optional commercial-name snapshot'
);
select has_column(
  'public', 'basic_medical_equipment_condition_logs', 'unit_snapshot',
  'condition logs store a unit snapshot'
);
select has_trigger(
  'public', 'basic_medical_equipment_condition_logs',
  'basic_medical_condition_log_catalog_snapshot',
  'every new condition log passes through snapshot capture'
);

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select manager_id from y09_context))::text,
  true
);

select public.adjust_basic_medical_inventory_condition(
  (select inventory_id from y09_context), 4, 1, 'Y09 snapshotted event'
);

update y09_context
set snapshot_log_id = (
  select id
  from public.basic_medical_equipment_condition_logs
  where inventory_id = (select inventory_id from y09_context)
    and note = 'Y09 snapshotted event'
);

select set_config('role', 'postgres', true);

select is(
  (select catalog_item_id_snapshot
   from public.basic_medical_equipment_condition_logs
   where id = (select snapshot_log_id from y09_context)),
  (select catalog_id from y09_context),
  'new log captures the stable catalog identity'
);
select is(
  (select item_name_snapshot
   from public.basic_medical_equipment_condition_logs
   where id = (select snapshot_log_id from y09_context)),
  'Y09 Original Name',
  'new log captures the item name at event time'
);
select is(
  (select commercial_name_snapshot
   from public.basic_medical_equipment_condition_logs
   where id = (select snapshot_log_id from y09_context)),
  'Y09 Original Commercial',
  'new log captures the commercial name at event time'
);
select is(
  (select unit_snapshot
   from public.basic_medical_equipment_condition_logs
   where id = (select snapshot_log_id from y09_context)),
  'piece',
  'new log captures the unit at event time'
);

update public.basic_medical_equipment_catalog
set item_name = 'Y09 Renamed Current Name',
    commercial_name = 'Y09 Renamed Commercial',
    unit = 'box',
    is_active = false
where id = (select catalog_id from y09_context);

-- Model a row that existed before this migration. The production migration
-- deliberately performs no UPDATE/backfill, so legacy snapshot columns remain
-- NULL instead of receiving today's mutable catalog name.
with inserted as (
  insert into public.basic_medical_equipment_condition_logs (
    inventory_id, event_type,
    total_before, good_before, damaged_before,
    total_after, good_after, damaged_after,
    quantity_delta, actor_id, note
  ) values (
    (select inventory_id from y09_context), 'stock_adjustment',
    5, 4, 1, 5, 4, 1, 0,
    (select manager_id from y09_context), 'Y09 legacy event'
  )
  returning id
)
update y09_context
set legacy_log_id = (select id from inserted);

update public.basic_medical_equipment_condition_logs
set catalog_item_id_snapshot = null,
    item_name_snapshot = null,
    commercial_name_snapshot = null,
    unit_snapshot = null
where id = (select legacy_log_id from y09_context);

select ok(
  (select is_active from public.basic_medical_room_inventory
   where id = (select inventory_id from y09_context)),
  'catalog deactivation preserves the historical allocation row and state'
);

select is(
  (select item_name_snapshot
   from public.basic_medical_equipment_condition_logs
   where id = (select snapshot_log_id from y09_context)),
  'Y09 Original Name',
  'catalog rename and deactivation cannot rewrite the stored event name'
);

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select manager_id from y09_context))::text,
  true
);

select is(
  (select count(*)::integer
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 snapshotted event'),
  1,
  'deactivated catalog item does not hide its historical log'
);
select is(
  (select row_data #>> '{inventory,catalog,item_name}'
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 snapshotted event'),
  'Y09 Original Name',
  'log presentation uses the event-time item name after current rename'
);
select is(
  (select row_data #>> '{inventory,catalog,commercial_name}'
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 snapshotted event'),
  'Y09 Original Commercial',
  'log presentation uses the event-time commercial name'
);
select is(
  (select row_data #>> '{inventory,catalog,unit}'
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 snapshotted event'),
  'piece',
  'log presentation uses the event-time unit'
);
select ok(
  (select row_data::text
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 snapshotted event')
    not like '%Y09 Renamed Current Name%',
  'current renamed catalog name cannot leak into old log presentation'
);
select is(
  (select count(*)::integer
   from public.search_basic_medical_equipment('logs', 'Y09 Original Name')),
  1,
  'log search uses the stored historical name'
);
select is(
  (select count(*)::integer
   from public.search_basic_medical_equipment('logs', 'Y09 Renamed Current Name')),
  0,
  'log search does not use the mutable current catalog name'
);

select ok(
  (select catalog_item_id_snapshot is null
      and item_name_snapshot is null
      and commercial_name_snapshot is null
      and unit_snapshot is null
   from public.basic_medical_equipment_condition_logs
   where id = (select legacy_log_id from y09_context)),
  'legacy rows remain explicitly unknown instead of being backfilled'
);
select is(
  (select row_data #>> '{inventory,catalog,item_name}'
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 legacy event'),
  'Tên lịch sử không được ghi nhận',
  'legacy log presentation uses a neutral missing-history marker'
);
select ok(
  (select row_data::text
   from public.search_basic_medical_equipment('logs')
   where row_data->>'note' = 'Y09 legacy event')
    not like '%Y09 Renamed Current Name%',
  'legacy presentation never fabricates the current name as historical evidence'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated keeps the established search RPC entry point'
);
select ok(
  not has_function_privilege(
    'public',
    'public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the search RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot execute the search RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.snapshot_basic_medical_condition_log_catalog()',
    'EXECUTE'
  ),
  'authenticated cannot invoke the private trigger function directly'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.basic_medical_equipment_condition_logs', 'INSERT'
  ),
  'authenticated cannot insert condition logs directly'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.basic_medical_equipment_condition_logs', 'UPDATE'
  ),
  'authenticated cannot rewrite condition logs directly'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.basic_medical_equipment_condition_logs', 'DELETE'
  ),
  'authenticated cannot delete condition logs directly'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select viewer_id from y09_context))::text,
  true
);
select throws_ok(
  $$ select * from public.search_basic_medical_equipment('logs'); $$,
  '42501',
  'BASIC_MEDICAL_MANAGER_REQUIRED',
  'scoped non-manager remains denied detailed condition logs'
);

select set_config('role', 'postgres', true);
select throws_ok(
  $$ delete from public.basic_medical_equipment_catalog
     where id = '99000000-0000-4000-8000-000000000004'; $$,
  '23503',
  null,
  'linked catalog history cannot be deleted'
);

select * from finish();
rollback;
