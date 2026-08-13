begin;

select plan(14);

create temporary table feature_context as
select
  gen_random_uuid() as root_id,
  gen_random_uuid() as manager_id,
  (select id from public.room_types where is_active order by name limit 1) as first_type_id,
  (select id from public.room_types where is_active order by name offset 1 limit 1) as second_type_id,
  gen_random_uuid() as room_one_id,
  gen_random_uuid() as room_two_id,
  gen_random_uuid() as course_id;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid, root_id, 'authenticated', 'authenticated',
  'pwb-root@campus.local', crypt('PwbRootPassword123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"PWB Root"}'::jsonb, now(), now()
from feature_context
union all
select
  '00000000-0000-0000-0000-000000000000'::uuid, manager_id, 'authenticated', 'authenticated',
  'pwb-manager@campus.local', crypt('PwbManagerPassword123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"PWB Manager"}'::jsonb, now(), now()
from feature_context;

insert into public.user_roles (user_id, role)
select root_id, 'admin'::public.app_role from feature_context
union all
select manager_id, 'admin'::public.app_role from feature_context;

insert into public.system_security_principals (
  singleton, root_admin_id, personnel_manager_id, configured_by
)
select true, root_id, manager_id, root_id from feature_context
on conflict (singleton) do update set
  root_admin_id = excluded.root_admin_id,
  personnel_manager_id = excluded.personnel_manager_id,
  configured_by = excluded.configured_by;

select ok((select root_id is not null from feature_context), 'seeded Root Administrator is available');
select ok((select first_type_id is not null and second_type_id is not null from feature_context), 'two active room types are available for guarded catalog tests');

insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity)
select room_one_id, 'PWB-101', 'PWB', 'Password batch room one', first_type_id, 10 from feature_context
union all
select room_two_id, 'PWB-102', 'PWB', 'Password batch room two', first_type_id, 20 from feature_context;

insert into public.courses (id, course_code, course_name, room_type_id)
select course_id, 'PWB-COURSE', 'Password batch course', first_type_id from feature_context;

grant select on feature_context to authenticated;

select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select root_id from feature_context), 'role', 'authenticated')::text, true);

select is(
  public.set_catalog_rooms_active(array[(select room_one_id from feature_context)], false),
  1,
  'Root can deactivate a selected room through the canonical batch RPC'
);

select is(
  (select is_active from public.rooms where id = (select room_one_id from feature_context)),
  false,
  'batch room activation change is persisted'
);

select throws_ok(
  $$select public.update_catalog_rooms_batch(jsonb_build_array(
      jsonb_build_object('id', (select room_one_id from feature_context), 'room_code', 'PWB-101-CHANGED', 'building_code', 'PWB', 'room_name', 'Changed room', 'capacity', 11, 'room_type_id', (select second_type_id from feature_context)),
      jsonb_build_object('id', (select room_two_id from feature_context), 'room_code', 'PWB-102-CHANGED', 'building_code', 'PWB', 'room_name', 'Bad room', 'capacity', 22, 'room_type_id', '00000000-0000-0000-0000-000000000000')
    ))$$,
  '22023',
  'INVALID_CATALOG_BATCH',
  'an invalid record rejects the entire room batch'
);

select is(
  (select room_code from public.rooms where id = (select room_one_id from feature_context)),
  'PWB-101',
  'failed room batch leaves earlier selected rows unchanged'
);

select is(
  public.update_catalog_courses_batch(jsonb_build_array(
    jsonb_build_object('id', (select course_id from feature_context), 'course_code', 'PWB-COURSE-EDIT', 'course_name', 'Password batch course edited', 'room_type_id', (select second_type_id from feature_context))
  )),
  1,
  'Root can atomically edit every supported course field through the batch RPC'
);

select is(
  (select course_code || ':' || course_name from public.courses where id = (select course_id from feature_context)),
  'PWB-COURSE-EDIT:Password batch course edited',
  'course batch edit persists code and name together'
);

select lives_ok(
  $$select public.clear_own_must_change_password('password_recovered')$$,
  'ordinary password recovery completion is a safe no-op when no forced flag exists'
);

select lives_ok(
  $$select public.begin_personnel_password_reset((select root_id from feature_context))$$,
  'Root can begin a password reset only for a password-capable account'
);

select throws_ok(
  $$select public.clear_own_must_change_password('password_changed')$$,
  '22023',
  'PASSWORD_CHANGE_NOT_COMPLETED',
  'a forced user cannot clear the flag without an Auth password change'
);

select ok(
  (select must_change_password from public.profiles where id = (select root_id from feature_context)),
  'failed direct clear preserves the forced-password state'
);

select set_config('role', 'postgres', true);

select ok(
  exists (select 1 from pg_trigger where tgname = 'rooms_protect_type_history' and tgenabled = 'O')
  and exists (select 1 from pg_trigger where tgname = 'courses_protect_type_history' and tgenabled = 'O'),
  'direct Admin table writes cannot bypass the database type-history trigger'
);

select ok(
  not has_function_privilege('anon', 'public.begin_personnel_password_reset(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_catalog_rooms_batch(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.update_catalog_rooms_batch(jsonb)', 'EXECUTE'),
  'sensitive personnel and catalog batch RPCs are authenticated-only'
);

select * from finish();
rollback;
