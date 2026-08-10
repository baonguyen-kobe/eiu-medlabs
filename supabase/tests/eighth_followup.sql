begin;
select plan(6);

select ok(
  position('''reserved''' in pg_get_indexdef('public.personnel_update_operations_reconcile_idx'::regclass)) > 0,
  'expired reserved personnel operations are eligible for reconciliation'
);

select ok(
  position('Operation expired before a new reservation was requested' in pg_get_functiondef(
    'public.begin_personnel_update(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)'::regprocedure
  )) = 0,
  'new personnel updates do not auto-expire reserved operations without reconciliation'
);

select has_trigger(
  'public', 'class_schedules', 'guard_basic_medical_linked_schedule_mutation',
  'linked Basic Medical schedules have a direct-mutation guard'
);

select ok(
  position('BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED' in pg_get_functiondef(
    'private.guard_basic_medical_linked_schedule_mutation()'::regprocedure
  )) > 0,
  'linked schedule guard rejects direct mutations'
);

select ok(
  position('app.basic_medical_registration_mutation' in pg_get_functiondef(
    'public.cancel_basic_medical_registration(uuid,text)'::regprocedure
  )) > 0,
  'cancel RPC enables the linked schedule mutation guard'
);

select ok(
  position('schedules.schedule_status = ''cancelled''' in pg_get_functiondef(
    'public.cancel_basic_medical_registration(uuid,text)'::regprocedure
  )) > 0,
  'cancellation invalidates confirmations only for cancelled sessions'
);

select * from finish();
rollback;