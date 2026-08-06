begin;
select plan(7);

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
