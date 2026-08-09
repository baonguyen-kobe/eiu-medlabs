-- pgTAP Test Suite: equipment_signature_storage_activation.test.sql
-- SIGNATURE-C2+D R1A: effective equipment signature storage contract

begin;
select plan(25);

select has_column('public', 'equipment_requests', 'handover_recipient_signature_storage_path', 'Test 1. handover Storage path column exists');
select has_column('public', 'equipment_requests', 'return_recipient_signature_storage_path', 'Test 2. return Storage path column exists');
select has_table('public', 'equipment_signature_operations', 'Test 3. signature operation table exists');

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipment_signature_operations'::regclass
      and contype = 'u'
      and conkey = array[(select attnum from pg_attribute where attrelid = 'public.equipment_signature_operations'::regclass and attname = 'object_path' and not attisdropped)]::smallint[]
  ),
  'Test 4. operation object_path is unique'
);

select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.equipment_signature_operations'::regclass
    and conname = 'equipment_signature_operations_phase_check' and contype = 'c'
), 'Test 5. operation phase constraint exists');

select ok(exists (
  select 1 from pg_constraint
  where conrelid = 'public.equipment_signature_operations'::regclass
    and conname = 'equipment_signature_operations_state_check' and contype = 'c'
), 'Test 6. operation state constraint exists');

select ok(not has_table_privilege('authenticated', 'public.equipment_signature_operations', 'SELECT'), 'Test 7. authenticated has no generic operation SELECT');
select ok(not has_table_privilege('authenticated', 'public.equipment_signature_operations', 'INSERT'), 'Test 8. authenticated has no generic operation INSERT');
select ok(not has_table_privilege('authenticated', 'public.equipment_signature_operations', 'UPDATE'), 'Test 9. authenticated has no generic operation UPDATE');
select ok(not has_table_privilege('authenticated', 'public.equipment_signature_operations', 'DELETE'), 'Test 10. authenticated has no generic operation DELETE');

select ok(to_regprocedure('public.reserve_equipment_signature(uuid,text)') is not null, 'Test 11. reserve RPC exists');
select is((select pronargs from pg_proc where oid = 'public.reserve_equipment_signature(uuid,text)'::regprocedure), 2::smallint, 'Test 12. reserve RPC accepts request plus phase only');

select is((
  select count(*)::integer
  from pg_proc procedures join pg_namespace namespaces on namespaces.oid = procedures.pronamespace
  where namespaces.nspname = 'public' and procedures.proname = 'reserve_equipment_signature' and procedures.pronargs <> 2
), 0, 'Test 13. no reserve overload accepts an object path');

select ok(to_regprocedure('public.finalize_equipment_signature(uuid)') is not null, 'Test 14. finalize RPC exists');
select is((select pronargs from pg_proc where oid = 'public.finalize_equipment_signature(uuid)'::regprocedure), 1::smallint, 'Test 15. finalize RPC accepts operation ID only');
select ok(to_regprocedure('public.get_equipment_signature_operation_status(uuid)') is not null, 'Test 16. actor-scoped operation status RPC exists');

select ok(
  not has_function_privilege('authenticated', 'public.registrant_confirm_equipment_handoff(uuid,text,text)', 'EXECUTE'),
  'Test 17. legacy registrant Base64 RPC is not executable by authenticated'
);

select ok(
  coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%handover_recipient_signature%',
  'Test 18. manager RPC references handover Base64 signatures'
);
select ok(
  coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%handover_recipient_signature_storage_path%',
  'Test 19. manager RPC references handover Storage paths'
);
select ok(
  coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%return_recipient_signature%',
  'Test 20. manager RPC references return Base64 signatures'
);
select ok(
  coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%return_recipient_signature_storage_path%',
  'Test 21. manager RPC references return Storage paths'
);
select ok(
  coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%handover_recipient_signature_storage_path = case when target_rank >= 2%'
  and coalesce((select pg_get_functiondef('public.manager_confirm_equipment_status(uuid,text)'::regprocedure)), '') like '%return_recipient_signature_storage_path = null%',
  'Test 22. manager rewind clears both Storage paths'
);
select ok(
  coalesce((select pg_get_functiondef('private.guard_equipment_request_update()'::regprocedure)), '') like '%new.handover_recipient_signature_storage_path is distinct from old.handover_recipient_signature_storage_path%',
  'Test 23. update guard protects handover Storage paths'
);
select ok(
  coalesce((select pg_get_functiondef('private.guard_equipment_request_update()'::regprocedure)), '') like '%new.return_recipient_signature_storage_path is distinct from old.return_recipient_signature_storage_path%',
  'Test 24. update guard protects return Storage paths'
);
select is((
  select count(*)::integer
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (coalesce(qual, '') ilike '%equipment_signatures%' or coalesce(with_check, '') ilike '%equipment_signatures%')
), 0, 'Test 25. no equipment_signatures Storage mutation policy exists');

select * from finish();
rollback;
