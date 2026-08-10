begin;

select plan(15);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipment_requests'
      and column_name = 'handover_recipient_signature'
  ),
  'handover recipient signature column exists'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipment_requests'
      and column_name = 'return_recipient_signature'
  ),
  'return recipient signature column exists'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipment_requests'
      and column_name = 'handover_signature_path'
  ),
  'ambiguous handover signature path column is absent'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'equipment_requests'
      and column_name = 'return_signature_path'
  ),
  'ambiguous return signature path column is absent'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipment_requests'::regclass
      and conname = 'equipment_requests_handover_signature_valid'
  ),
  'handover Base64 constraint exists'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipment_requests'::regclass
      and conname = 'equipment_requests_return_signature_valid'
  ),
  'return Base64 constraint exists'
);

select ok(
  position('handover_signature_path' in pg_get_functiondef(
    'public.registrant_confirm_equipment_handoff(uuid,text,text)'::regprocedure
  )) = 0,
  'recipient RPC does not reference the legacy handover path'
);

select ok(
  position('return_signature_path' in pg_get_functiondef(
    'public.registrant_confirm_equipment_handoff(uuid,text,text)'::regprocedure
  )) = 0,
  'recipient RPC does not reference the legacy return path'
);

select ok(
  position('handover_recipient_signature' in pg_get_functiondef(
    'public.registrant_confirm_equipment_handoff(uuid,text,text)'::regprocedure
  )) > 0,
  'recipient RPC writes the canonical handover signature'
);

select ok(
  position('return_recipient_signature' in pg_get_functiondef(
    'public.registrant_confirm_equipment_handoff(uuid,text,text)'::regprocedure
  )) > 0,
  'recipient RPC writes the canonical return signature'
);

select ok(
  position('handover_signature_path' in pg_get_functiondef(
    'public.manager_confirm_equipment_status(uuid,text)'::regprocedure
  )) = 0
  and position('return_signature_path' in pg_get_functiondef(
    'public.manager_confirm_equipment_status(uuid,text)'::regprocedure
  )) = 0,
  'manager RPC does not reference legacy signature paths'
);

select ok(
  position('handover_recipient_signature' in pg_get_functiondef(
    'public.manager_confirm_equipment_status(uuid,text)'::regprocedure
  )) > 0
  and position('return_recipient_signature' in pg_get_functiondef(
    'public.manager_confirm_equipment_status(uuid,text)'::regprocedure
  )) > 0,
  'manager RPC uses canonical signatures for transitions and rewinds'
);

select ok(
  position('handover_signature_path' in pg_get_functiondef(
    'private.guard_equipment_request_update()'::regprocedure
  )) = 0
  and position('return_signature_path' in pg_get_functiondef(
    'private.guard_equipment_request_update()'::regprocedure
  )) = 0,
  'equipment request update guard does not reference legacy signature paths'
);

select ok(
  position('handover_recipient_signature' in pg_get_functiondef(
    'private.guard_equipment_request_update()'::regprocedure
  )) > 0
  and position('return_recipient_signature' in pg_get_functiondef(
    'private.guard_equipment_request_update()'::regprocedure
  )) > 0,
  'equipment request update guard uses canonical signatures'
);

select ok(
  not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname in ('public', 'private')
      and procedures.prokind = 'f'
      and (
        position('handover_signature_path' in pg_get_functiondef(procedures.oid)) > 0
        or position('return_signature_path' in pg_get_functiondef(procedures.oid)) > 0
      )
  ),
  'no final public or private function definition references legacy signature paths'
);

select * from finish();
rollback;
