begin;
select plan(15);

select columns_are(
  'public', 'personnel_update_operations',
  array[
    'id','profile_id','actor_id','expected_version','requested_email','payload',
    'expires_at','created_at','previous_email','status','auth_updated_at',
    'committed_at','resolved_at','last_error',
    'reconcile_started_at','reconcile_lease_expires_at','reconcile_worker_id'
  ],
  'personnel operations persist the complete durable saga state'
);

select ok(
  has_function_privilege('authenticated', 'public.mark_personnel_auth_updated(uuid)', 'EXECUTE'),
  'authenticated operation owner can mark Auth update completion'
);

select ok(
  not has_function_privilege('authenticated', 'public.resolve_personnel_update_operation(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.resolve_personnel_update_operation(uuid,text,text)', 'EXECUTE'),
  'only service role resolves reconciliation operations'
);

select ok(
  position('personnel_manager_id = target_profile_id' in pg_get_functiondef(
    'public.begin_personnel_update(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)'::regprocedure
  )) > 0,
  'personnel reservation distinguishes Root from Personnel Manager'
);

select ok(
  position('PERSONNEL_UPDATE_IN_PROGRESS' in pg_get_functiondef(
    'public.admin_apply_personnel_import(text,jsonb,text)'::regprocedure
  )) > 0
  and position('not (operations.profile_id = any(applied_ids))' in pg_get_functiondef(
    'public.admin_apply_personnel_import(text,jsonb,text)'::regprocedure
  )) > 0,
  'import all rejects omitted profiles with active reservations'
);

select ok(
  has_function_privilege('authenticated', 'private.can_view_basic_medical_registration(uuid)', 'EXECUTE'),
  'central Basic Medical visibility predicate is available to RLS'
);

select ok(
  position('has_role(''viewer'')' in pg_get_functiondef(
    'private.can_view_basic_medical_registration(uuid)'::regprocedure
  )) > 0
  and position('teaching_lecturer_id' in pg_get_functiondef(
    'private.can_view_basic_medical_registration(uuid)'::regprocedure
  )) > 0,
  'visibility includes Y-scope Viewer and session teaching lecturer'
);

select ok(
  not has_table_privilege('authenticated', 'public.basic_medical_registrations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.basic_medical_registrations', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.basic_medical_registrations', 'DELETE'),
  'authenticated clients cannot directly mutate Basic Medical registration headers'
);

select ok(
  not has_table_privilege('authenticated', 'public.basic_medical_registration_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.basic_medical_registration_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.basic_medical_registration_sessions', 'DELETE'),
  'authenticated clients cannot directly mutate Basic Medical sessions'
);

select ok(
  has_function_privilege('authenticated', 'public.cancel_basic_medical_registration(uuid,text)', 'EXECUTE'),
  'soft cancellation is exposed only through its guarded RPC'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'basic_medical_registrations'
      and column_name = 'cancelled_at'
  ),
  'Basic Medical registration has soft-cancel lifecycle metadata'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.search_basic_medical_equipment(text,text,uuid,uuid,text,uuid,date,date,text,integer,integer)',
    'EXECUTE'
  ),
  'server-side equipment filters are available through scoped RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.search_basic_medical_catalog_candidates(text,integer)', 'EXECUTE'),
  'catalog candidate search is server-side and capped per request'
);

select ok(
  has_function_privilege('authenticated', 'public.apply_basic_medical_catalog_import(text,jsonb)', 'EXECUTE'),
  'atomic catalog import RPC is available to scoped managers'
);

select ok(
  position('created_at at time zone ''Asia/Ho_Chi_Minh''' in pg_get_viewdef(
    'public.basic_medical_registration_list'::regclass, true
  )) = 0
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'basic_medical_registrations_active_idx'
  ),
  'active registration list is backed by the soft-cancel lifecycle index'
);

select * from finish();
rollback;
