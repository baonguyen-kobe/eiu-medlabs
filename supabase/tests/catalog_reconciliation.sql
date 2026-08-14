begin;

select plan(18);

create temporary table reconciliation_context as
select
  gen_random_uuid() as admin_id,
  gen_random_uuid() as skill_orphan_id,
  gen_random_uuid() as basic_referenced_id,
  gen_random_uuid() as basic_orphan_id,
  gen_random_uuid() as basic_inactive_id,
  gen_random_uuid() as room_id,
  (select id from public.room_types where code = 'basic_medical') as basic_room_type_id;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, admin_id,
  'authenticated', 'authenticated', 'catalog-reconciliation-admin@campus.local',
  crypt('CatalogReconciliation123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Catalog Reconciliation Admin"}'::jsonb, now(), now()
from reconciliation_context;

insert into public.user_roles (user_id, role)
select admin_id, 'admin'::public.app_role from reconciliation_context;

grant select on reconciliation_context to authenticated;
select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select admin_id from reconciliation_context), 'role', 'authenticated')::text,
  true
);

select is(
  (public.preview_catalog_reconciliation(
    'skills',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Skills preview row', 'commercial_name', 'SCR-SKILLS-NEW', 'unit', 'piece'
    ))
  )->>'inserted')::integer,
  1,
  'skills reconciliation preview computes insert count'
);

select is(
  (select count(*) from public.equipment_catalog where commercial_name = 'SCR-SKILLS-NEW'),
  0::bigint,
  'skills preview is read-only'
);

select lives_ok(
  $$select public.apply_catalog_reconciliation(
    'skills',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Skills applied row', 'commercial_name', 'SCR-SKILLS-NEW', 'unit', 'piece'
    )),
    public.preview_catalog_reconciliation(
      'skills',
      jsonb_build_array(jsonb_build_object(
        'item_name', 'Skills applied row', 'commercial_name', 'SCR-SKILLS-NEW', 'unit', 'piece'
      ))
    )->>'fingerprint'
  )$$,
  'skills reconciliation apply accepts its server preview'
);

select ok(
  exists (select 1 from public.equipment_catalog where commercial_name = 'SCR-SKILLS-NEW' and is_active),
  'skills reconciliation activates its inserted row'
);

create temporary table reconciliation_external_context as
select public.preview_catalog_reconciliation(
  'skills', jsonb_build_array(jsonb_build_object(
    'item_name', 'Skills applied row', 'commercial_name', 'SCR-SKILLS-NEW', 'unit', 'piece'
  ))
)->>'fingerprint' as fingerprint;
grant select on reconciliation_external_context to authenticated;
select set_config('role', 'postgres', true);
update public.equipment_catalog set item_name = 'Externally changed skills item'
where commercial_name = 'SCR-SKILLS-NEW';
select set_config('role', 'authenticated', true);
select throws_ok(
  $$select public.apply_catalog_reconciliation('skills', jsonb_build_array(jsonb_build_object('item_name', 'Skills applied row', 'commercial_name', 'SCR-SKILLS-NEW', 'unit', 'piece')), (select fingerprint from reconciliation_external_context))$$,
  'P0001',
  'CATALOG_RECONCILIATION_STALE_PREVIEW',
  'external authoritative catalog metadata change invalidates a previously previewed reconciliation'
);
select set_config('role', 'postgres', true);
select is(
  (select item_name from public.equipment_catalog where commercial_name = 'SCR-SKILLS-NEW'),
  'Externally changed skills item',
  'stale reconciliation cannot overwrite externally changed catalog metadata'
);
select set_config('role', 'authenticated', true);

select throws_ok(
  $$select public.apply_catalog_reconciliation(
    'skills',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Skills stale row', 'commercial_name', 'SCR-SKILLS-STALE', 'unit', 'piece'
    )),
    'not-a-server-fingerprint'
  )$$,
  'P0001',
  'CATALOG_RECONCILIATION_STALE_PREVIEW',
  'skills apply rejects a stale preview fingerprint'
);

select throws_ok(
  $$select public.apply_catalog_reconciliation(
    'skills',
    jsonb_build_array(jsonb_build_object('item_name', 'Metadata changed after preview', 'commercial_name', 'SCR-SKILLS-METADATA', 'unit', 'piece')),
    public.preview_catalog_reconciliation(
      'skills',
      jsonb_build_array(jsonb_build_object('item_name', 'Original metadata', 'commercial_name', 'SCR-SKILLS-METADATA', 'unit', 'piece'))
    )->>'fingerprint'
  )$$,
  'P0001',
  'CATALOG_RECONCILIATION_STALE_PREVIEW',
  'skills apply rejects a fingerprint when file metadata changes without changing identity'
);

select ok(
  not exists (select 1 from public.equipment_catalog where commercial_name = 'SCR-SKILLS-METADATA'),
  'stale skills metadata apply makes no catalog mutation'
);

select set_config('role', 'postgres', true);

insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity)
select room_id, 'SCR-Y-ROOM', 'SCR', 'Catalog reconciliation room', basic_room_type_id, 10
from reconciliation_context;

insert into public.basic_medical_equipment_catalog (id, item_name, commercial_name, unit, is_active)
select basic_referenced_id, 'Referenced Basic Medical item', 'SCR-Y-REFERENCED', 'piece', true from reconciliation_context
union all
select basic_orphan_id, 'Orphan Basic Medical item', 'SCR-Y-ORPHAN', 'piece', true from reconciliation_context
union all
select basic_inactive_id, 'Inactive Basic Medical item', 'SCR-Y-INACTIVE', 'piece', false from reconciliation_context;

insert into public.basic_medical_room_inventory (room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity)
select room_id, basic_referenced_id, 2, 2, 0 from reconciliation_context;

select set_config('role', 'authenticated', true);

select is(
  (public.preview_catalog_reconciliation(
    'basic_medical',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Reactivated Basic Medical item', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'
    ))
  )->>'reactivated')::integer,
  1,
  'basic-medical preview recognizes an inactive matched row'
);

select throws_ok(
  $$select public.apply_catalog_reconciliation(
    'basic_medical',
    jsonb_build_array(jsonb_build_object('item_name', 'Metadata changed after preview', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece')),
    public.preview_catalog_reconciliation(
      'basic_medical',
      jsonb_build_array(jsonb_build_object('item_name', 'Original metadata', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'))
    )->>'fingerprint'
  )$$,
  'P0001',
  'CATALOG_RECONCILIATION_STALE_PREVIEW',
  'basic-medical apply rejects a fingerprint when file metadata changes without changing identity'
);

select is(
  (select item_name from public.basic_medical_equipment_catalog where id = (select basic_inactive_id from reconciliation_context)),
  'Inactive Basic Medical item',
  'stale basic-medical metadata apply makes no catalog mutation'
);

select is(
  (public.preview_catalog_reconciliation(
    'basic_medical',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Reactivated Basic Medical item', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'
    ))
  )->>'deactivated')::integer,
  1,
  'basic-medical preview preserves referenced omitted catalog rows by deactivation'
);

select is(
  (public.preview_catalog_reconciliation(
    'basic_medical',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Reactivated Basic Medical item', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'
    ))
  )->>'deleted')::integer,
  1,
  'basic-medical preview identifies unreferenced omitted catalog rows for deletion'
);

select lives_ok(
  $$select public.apply_catalog_reconciliation(
    'basic_medical',
    jsonb_build_array(jsonb_build_object(
      'item_name', 'Reactivated Basic Medical item', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'
    )),
    public.preview_catalog_reconciliation(
      'basic_medical',
      jsonb_build_array(jsonb_build_object(
        'item_name', 'Reactivated Basic Medical item', 'commercial_name', 'SCR-Y-INACTIVE', 'unit', 'piece'
      ))
    )->>'fingerprint'
  )$$,
  'basic-medical reconciliation apply accepts its server preview'
);

select ok(
  (select is_active from public.basic_medical_equipment_catalog where id = (select basic_referenced_id from reconciliation_context)) = false,
  'referenced omitted basic-medical item is retained but deactivated'
);

select ok(
  not exists (select 1 from public.basic_medical_equipment_catalog where id = (select basic_orphan_id from reconciliation_context)),
  'unreferenced omitted basic-medical item is deleted'
);

select ok(
  (select is_active from public.basic_medical_equipment_catalog where id = (select basic_inactive_id from reconciliation_context)),
  'matched inactive basic-medical item is reactivated'
);

select * from finish();
rollback;
