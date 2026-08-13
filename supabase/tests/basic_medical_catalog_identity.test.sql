begin;
select plan(14);

create temp table y13_context (
  catalog_id uuid,
  room_id uuid,
  inventory_id uuid
);
grant select on y13_context to authenticated;

do $$
declare
  room_type_id uuid;
  catalog_id uuid := gen_random_uuid();
  room_id uuid := gen_random_uuid();
  inventory_id uuid := gen_random_uuid();
begin
  select id into room_type_id
  from public.room_types
  where code = 'basic_medical';

  insert into public.rooms (
    id, room_code, building_code, room_name, room_type_id, capacity, is_active
  ) values (
    room_id, 'Y13-R', 'Y13-B', 'Y13 Identity Room', room_type_id, 20, true
  );
  insert into public.basic_medical_equipment_catalog (
    id, item_name, commercial_name, unit, is_active
  ) values (
    catalog_id, 'Y13 Equipment', 'Y13 Durable Commercial Name', 'piece', true
  );
  insert into public.basic_medical_room_inventory (
    id, room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity,
    is_active
  ) values (
    inventory_id, room_id, catalog_id, 10, 10, 0, true
  );
  insert into y13_context values (catalog_id, room_id, inventory_id);
end;
$$;

select ok(
  to_regclass('public.basic_medical_catalog_commercial_name_normalized_key') is not null,
  'normalized commercial-name identity has a durable unique index'
);

select throws_ok(
  $$insert into public.basic_medical_equipment_catalog (item_name, commercial_name, unit)
    values ('Y13 Duplicate', ' y13 durable commercial name ', 'piece')$$,
  '23505', null,
  'case and whitespace normalized commercial-name duplicates are rejected'
);

select throws_ok(
  $$insert into public.basic_medical_equipment_catalog (item_name, commercial_name, unit)
    values ('Y13 Blank', '   ', 'piece')$$,
  '23514', null,
  'blank commercial name is rejected by the database'
);

select lives_ok(
  $$insert into public.basic_medical_equipment_catalog (item_name, commercial_name, unit)
    values ('Y13 Same Item Name', 'Y13 Different Commercial Name', 'piece')$$,
  'different commercial identities may share an item name'
);

select lives_ok(
  $$update public.basic_medical_equipment_catalog
    set item_name = 'Y13 Renamed Equipment', commercial_name = 'Y13 Durable Commercial Name'
    where id = (select catalog_id from y13_context)$$,
  'metadata edit preserves the durable catalog row'
);

select is(
  (select catalog_item_id from public.basic_medical_room_inventory
   where id = (select inventory_id from y13_context)),
  (select catalog_id from y13_context),
  'metadata edit does not re-key existing room inventory'
);

select lives_ok(
  $$update public.basic_medical_equipment_catalog
    set is_active = false
    where id = (select catalog_id from y13_context)$$,
  'catalog deactivation remains allowed without deleting inventory'
);

select is(
  (select is_active from public.basic_medical_room_inventory
   where id = (select inventory_id from y13_context)),
  true,
  'catalog deactivation keeps an active room allocation historically allocated'
);

select lives_ok(
  $$update public.basic_medical_equipment_catalog
    set is_active = true
    where id = (select catalog_id from y13_context)$$,
  'catalog reactivation remains allowed'
);

select is(
  (select count(*) from public.basic_medical_room_inventory inventory
   join public.basic_medical_equipment_catalog catalog on catalog.id = inventory.catalog_item_id
   where inventory.id = (select inventory_id from y13_context)
     and inventory.is_active and catalog.is_active),
  1::bigint,
  'reactivation restores canonical active catalog plus active allocation eligibility'
);

select is(
  (select catalog_item_id from public.basic_medical_room_inventory
   where id = (select inventory_id from y13_context)),
  (select catalog_id from y13_context),
  'reactivation never changes the historical allocation identity'
);

do $$
declare
  actor_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (actor_id, 'y13-catalog-manager@example.test');
  insert into public.profiles (id, email, full_name, is_active)
  values (actor_id, 'y13-catalog-manager@example.test', 'Y13 Catalog Manager', true)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active;
  insert into public.user_roles (user_id, role)
  values (actor_id, 'admin')
  on conflict do nothing;
  create temp table y13_actor (id uuid) on commit drop;
  insert into y13_actor values (actor_id);
  grant select on y13_actor to authenticated;
end;
$$;

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select id from y13_actor))::text,
  true
);

select throws_ok(
  $$select public.apply_basic_medical_catalog_import('new', jsonb_build_array(
    jsonb_build_object('item_name', 'Y13 Import A', 'commercial_name', 'Y13 duplicate import', 'unit', 'piece'),
    jsonb_build_object('item_name', 'Y13 Import B', 'commercial_name', ' y13 duplicate import ', 'unit', 'piece')
  ))$$,
  '22023', 'DUPLICATE_BASIC_MEDICAL_CATALOG_IMPORT_COMMERCIAL_NAME',
  'one import cannot contain duplicate normalized commercial identities'
);

select lives_ok(
  $$select public.apply_basic_medical_catalog_import('all', jsonb_build_array(
    jsonb_build_object(
      'item_name', 'Y13 Imported Metadata',
      'commercial_name', 'Y13 Durable Commercial Name',
      'unit', 'piece'
    )
  ))$$,
  'import matches an inactive catalog row by commercial identity'
);

select is(
  (select catalog_item_id from public.basic_medical_room_inventory
   where id = (select inventory_id from y13_context)),
  (select catalog_id from y13_context),
  'identity-based import updates metadata without replacing historical allocation IDs'
);

select * from finish();
select * from finish();
rollback;
