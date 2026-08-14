begin;

select plan(6);

create temporary table inventory_reason_context as
select
  gen_random_uuid() as admin_id,
  gen_random_uuid() as room_id,
  gen_random_uuid() as catalog_id,
  gen_random_uuid() as inventory_id,
  (select id from public.room_types where code = 'basic_medical') as room_type_id;
grant select on inventory_reason_context to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid, admin_id, 'authenticated', 'authenticated',
  'inventory-reason-admin@campus.local', crypt('InventoryReason123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Inventory Reason Admin"}'::jsonb, now(), now()
from inventory_reason_context;
insert into public.user_roles (user_id, role)
select admin_id, 'admin'::public.app_role from inventory_reason_context;
insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity)
select room_id, 'IR-ROOM', 'IR', 'Inventory reason fixture', room_type_id, 10 from inventory_reason_context;
insert into public.basic_medical_equipment_catalog (id, item_name, commercial_name, unit, is_active)
select catalog_id, 'Inventory reason item', 'IR-COMMERCIAL', 'piece', true from inventory_reason_context;
insert into public.basic_medical_room_inventory (id, room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity)
select inventory_id, room_id, catalog_id, 5, 5, 0 from inventory_reason_context;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from inventory_reason_context), 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.adjust_basic_medical_inventory_condition((select inventory_id from inventory_reason_context), 4, 1, '   ')$$,
  '22023',
  'BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED',
  'direct inventory condition adjustment rejects a blank reason'
);

select is(
  (select good_quantity || ':' || damaged_quantity from public.basic_medical_room_inventory where id = (select inventory_id from inventory_reason_context)),
  '5:0',
  'blank-reason rejection leaves inventory untouched'
);

select lives_ok(
  $$select public.adjust_basic_medical_inventory_condition((select inventory_id from inventory_reason_context), 4, 1, 'verified condition adjustment')$$,
  'direct inventory condition adjustment accepts a non-blank reason'
);

select throws_ok(
  $$select public.set_basic_medical_room_inventory((select inventory_id from inventory_reason_context), (select room_id from inventory_reason_context), (select catalog_id from inventory_reason_context), 5, 1, true, '   ')$$,
  '22023',
  'BASIC_MEDICAL_INVENTORY_ADJUSTMENT_REASON_REQUIRED',
  'direct room-inventory mutation rejects a blank reason'
);

select lives_ok(
  $$select public.set_basic_medical_room_inventory((select inventory_id from inventory_reason_context), (select room_id from inventory_reason_context), (select catalog_id from inventory_reason_context), 5, 1, true, 'verified inventory adjustment')$$,
  'direct room-inventory mutation accepts an accountable reason'
);

select set_config('role', 'postgres', true);
select is(
  (select note from public.basic_medical_equipment_condition_logs where inventory_id = (select inventory_id from inventory_reason_context) order by created_at desc limit 1),
  'verified condition adjustment',
  'condition log retains the accountable adjustment reason'
);

select * from finish();
rollback;
