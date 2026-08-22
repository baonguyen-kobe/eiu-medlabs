begin;
select plan(18);

select is(
  (select count(*)::integer from public.system_security_principals where singleton),
  1,
  'local seed configures exactly one security-principal row'
);

select is(
  (select profiles.is_active
   from public.profiles profiles
   join public.system_security_principals principals
     on principals.root_admin_id = profiles.id
   where principals.singleton),
  true,
  'Root Administrator is active'
);

select ok(
  exists (
    select 1
    from public.user_roles roles
    join public.system_security_principals principals
      on principals.root_admin_id = roles.user_id
    where principals.singleton and roles.role = 'admin'
  ),
  'Root Administrator has the Admin role'
);

select throws_ok(
  $$update public.profiles
    set is_active = false
    where id = (select root_admin_id from public.system_security_principals where singleton)$$,
  '42501',
  'ROOT_ADMIN_SECURITY_IMMUTABLE',
  'database trigger rejects deactivating Root even for table owner'
);

select throws_ok(
  $$delete from public.user_roles
    where user_id = (select root_admin_id from public.system_security_principals where singleton)
      and role = 'admin'$$,
  '42501',
  'ROOT_ADMIN_SECURITY_IMMUTABLE',
  'database trigger rejects deleting the Root Admin role'
);

select ok(
  has_function_privilege('authenticated', 'private.can_manage_personnel()', 'EXECUTE'),
  'authenticated policies can execute the safe personnel authority predicate'
);

select ok(
  has_function_privilege('authenticated', 'public.begin_personnel_update(uuid,text,text,text,text,public.app_role[],boolean,uuid[],uuid[],boolean,boolean,integer)', 'EXECUTE'),
  'personnel update reservation is exposed only as an authenticated RPC'
);

select ok(
  has_function_privilege('authenticated', 'public.commit_personnel_update(uuid)', 'EXECUTE'),
  'personnel update commit RPC is available to authenticated managers'
);

select ok(
  position('PERSONNEL_UPDATE_IN_PROGRESS' in pg_get_functiondef(
    'public.admin_apply_personnel_import(text,jsonb,text)'::regprocedure
  )) > 0,
  'bulk personnel import rejects a target with an active update reservation'
);

select ok(
  position('has_role(''teaching_assistant'')' in pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  )) > 0
  and position('has_role(''importer'')' in pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  )) = 0,
  'Basic Medical registration uses Teaching Assistant and never deprecated Importer'
);

select ok(
  position('can_manage_basic_medical' in pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  )) > 0,
  'Basic Medical registration uses the centralized scoped manager predicate'
);

select ok(
  position('existing_session.cancelled_at is not null' in lower(pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ))) > 0
  and position('schedule_status=''cancelled''' in regexp_replace(lower(pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  )), '\s+', '', 'g')) > 0
  and position('basic_medical_session_cancelled' in lower(pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ))) > 0,
  'cancelled Basic Medical sessions and schedules are explicitly rejected during edit'
);

select ok(
  position('roles.role = ''lecturer''' in pg_get_functiondef(
    'public.list_basic_medical_instructors()'::regprocedure
  )) > 0,
  'Basic Medical instructors are authorized by Lecturer role rather than title'
);

select ok(
  not has_table_privilege('authenticated', 'public.basic_medical_room_inventory', 'INSERT')
  and not has_table_privilege('authenticated', 'public.basic_medical_room_inventory', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.basic_medical_room_inventory', 'DELETE'),
  'authenticated clients cannot mutate Basic Medical inventory directly'
);

select ok(
  not has_column_privilege('authenticated', 'public.basic_medical_session_confirmations', 'signature_data', 'SELECT'),
  'authenticated clients cannot select signature base64 directly'
);

select ok(
  has_column_privilege('authenticated', 'public.basic_medical_session_confirmations', 'signed_at', 'SELECT'),
  'authorized confirmation metadata remains selectable under RLS'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'basic_medical_registrations'
      and indexname = 'basic_medical_registrations_code_key'
  ),
  'Basic Medical registration code has a database unique index'
);

delete from public.system_security_principals where singleton;
select throws_ok(
  $$select * from public.admin_list_personnel(
    null, null, 'all', 'all', 1, 50
  )$$,
  '42501',
  'PERSONNEL_SECURITY_NOT_CONFIGURED',
  'Personnel RPCs deny by default when the singleton is not configured'
);

select * from finish();
rollback;
