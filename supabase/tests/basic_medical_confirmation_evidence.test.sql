begin;
select plan(26);

create temp table y06_context (
  admin_id uuid,
  viewer_id uuid,
  lecturer_id uuid,
  outsider_id uuid,
  inactive_id uuid,
  registration_id uuid,
  confirmation_id uuid,
  legacy_confirmation_id uuid
);
grant select on table y06_context to authenticated, anon;

do $$
declare
  admin_id uuid := gen_random_uuid();
  viewer_id uuid := gen_random_uuid();
  lecturer_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  inactive_id uuid := gen_random_uuid();
  course_id uuid := gen_random_uuid();
  room_id uuid := gen_random_uuid();
  schedule_id uuid := gen_random_uuid();
  registration_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  catalog_id uuid := gen_random_uuid();
  inventory_id uuid := gen_random_uuid();
  confirmation_id uuid := gen_random_uuid();
  legacy_confirmation_id uuid := gen_random_uuid();
  basic_medical_room_type_id uuid;
  skills_room_type_id uuid;
begin
  select id into basic_medical_room_type_id
  from public.room_types where code = 'basic_medical';
  select id into skills_room_type_id
  from public.room_types where code = 'nursing_skills';

  insert into auth.users (id, email) values
    (admin_id, 'y06-admin@example.test'),
    (viewer_id, 'y06-viewer@example.test'),
    (lecturer_id, 'y06-lecturer@example.test'),
    (outsider_id, 'y06-outsider@example.test'),
    (inactive_id, 'y06-inactive@example.test');
  insert into public.profiles (id, email, full_name, is_active) values
    (admin_id, 'y06-admin@example.test', 'Y06 Admin', true),
    (viewer_id, 'y06-viewer@example.test', 'Y06 Viewer', true),
    (lecturer_id, 'y06-lecturer@example.test', 'Y06 Lecturer', true),
    (outsider_id, 'y06-outsider@example.test', 'Y06 Outsider', true),
    (inactive_id, 'y06-inactive@example.test', 'Y06 Inactive', false)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    is_active = excluded.is_active;
  insert into public.user_roles (user_id, role) values
    (admin_id, 'admin'),
    (viewer_id, 'viewer'),
    (lecturer_id, 'lecturer'),
    (outsider_id, 'staff'),
    (inactive_id, 'viewer');
  insert into public.profile_room_types (profile_id, room_type_id) values
    (viewer_id, basic_medical_room_type_id),
    (lecturer_id, basic_medical_room_type_id),
    (outsider_id, skills_room_type_id),
    (inactive_id, basic_medical_room_type_id)
  on conflict do nothing;

  insert into public.courses (
    id, course_code, course_name, room_type_id, is_active
  ) values (
    course_id, 'Y06-COURSE', 'Y06 Evidence Course',
    basic_medical_room_type_id, true
  );
  insert into public.rooms (
    id, room_code, building_code, room_name, room_type_id, capacity, is_active
  ) values (
    room_id, 'Y06-R', 'Y06-B', 'Y06 Evidence Room',
    basic_medical_room_type_id, 20, true
  );
  insert into public.basic_medical_registrations (
    id, academic_year, semester, start_date, end_date, course_id, room_id,
    student_count, registrant_id, responsible_lecturer_id, created_by
  ) values (
    registration_id, '2041-2042', 'HK1', date '2041-01-01', date '2041-01-01',
    course_id, room_id, 10, lecturer_id, lecturer_id, admin_id
  );
  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  insert into public.class_schedules (
    id, course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, schedule_date, start_time, end_time, source,
    basic_medical_registration_id, schedule_status, created_by,
    published_by, published_at
  ) values (
    schedule_id, course_id, 'Y06-SNAPSHOT-CODE', 'Y06 Snapshot Course', room_id,
    lecturer_id, date '2041-01-01', time '08:00', time '10:00', 'manual',
    registration_id, 'published', admin_id, admin_id, clock_timestamp()
  );
  insert into public.basic_medical_registration_sessions (
    id, registration_id, class_schedule_id, lesson_title,
    teaching_lecturer_id, session_number
  ) values (
    session_id, registration_id, schedule_id, 'Y06 Evidence Session',
    lecturer_id, 1
  );
  insert into public.basic_medical_equipment_catalog (
    id, item_name, commercial_name, unit, is_active
  ) values (
    catalog_id, 'Current catalog item', 'Current commercial name', 'piece', true
  );
  insert into public.basic_medical_room_inventory (
    id, room_id, catalog_item_id, total_quantity, good_quantity,
    damaged_quantity, is_active
  ) values (
    inventory_id, room_id, catalog_id, 7, 4, 3, true
  );
  insert into public.basic_medical_session_confirmations (
    id, session_id, registration_id_snapshot, class_schedule_id_snapshot,
    signer_id, signature_data, schedule_date_snapshot, start_time_snapshot,
    end_time_snapshot, room_id_snapshot, teaching_lecturer_id_snapshot,
    signed_at, invalidated_at, invalidated_reason
  ) values (
    confirmation_id, session_id, registration_id, schedule_id, lecturer_id,
    'data:image/png;base64,' || repeat('A', 128), date '2040-12-31',
    time '07:45', time '09:45', room_id, lecturer_id,
    timestamptz '2040-12-31 02:15:00+00',
    timestamptz '2041-01-02 03:00:00+00', 'Y06 historical invalidation'
  );
  insert into public.basic_medical_session_equipment_checks (
    confirmation_id, inventory_id, item_name_snapshot,
    commercial_name_snapshot, unit_snapshot, total_before, good_before,
    damaged_before, newly_damaged_quantity, good_after, damaged_after
  ) values (
    confirmation_id, inventory_id, 'Historical snapshot item',
    'Historical commercial name', 'snapshot-unit', 7, 5, 2, 1, 4, 3
  );

  -- A legacy-shaped row is intentionally not backfilled or reconstructed.
  insert into public.basic_medical_session_confirmations (
    id, registration_id_snapshot, class_schedule_id_snapshot, signer_id,
    signature_data, schedule_date_snapshot, start_time_snapshot,
    end_time_snapshot, room_id_snapshot, teaching_lecturer_id_snapshot
  ) values (
    legacy_confirmation_id, registration_id, schedule_id, lecturer_id,
    'data:image/png;base64,' || repeat('A', 128), date '2040-12-30',
    time '07:45', time '09:45', room_id, lecturer_id
  );

  update public.basic_medical_equipment_catalog
  set item_name = 'Renamed current catalog item',
      commercial_name = 'Renamed current commercial name'
  where id = catalog_id;
  update public.courses set course_name = 'Renamed current course'
  where id = course_id;
  update public.rooms
  set building_code = 'CURRENT-BUILDING', room_code = 'CURRENT-ROOM',
      room_name = 'Renamed current room'
  where id = room_id;
  update public.profiles set full_name = 'Renamed current lecturer'
  where id = lecturer_id;

  insert into y06_context values (
    admin_id, viewer_id, lecturer_id, outsider_id, inactive_id,
    registration_id, confirmation_id, legacy_confirmation_id
  );
end;
$$;

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_basic_medical_confirmation_evidence(uuid)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.get_basic_medical_confirmation_evidence(uuid)', 'EXECUTE'
  ),
  'evidence RPC is executable only by authenticated application users'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.basic_medical_session_confirmations',
    'signature_data', 'SELECT'
  ),
  'signature remains unavailable through direct table selection'
);

select ok(
  position('security definer' in lower(pg_get_functiondef(
    'public.get_basic_medical_confirmation_evidence(uuid)'::regprocedure
  ))) > 0
  and position('set search_path to ''''' in lower(pg_get_functiondef(
    'public.get_basic_medical_confirmation_evidence(uuid)'::regprocedure
  ))) > 0,
  'evidence RPC is security definer with an empty search path'
);

select ok(
  position('basic_medical_equipment_catalog' in pg_get_functiondef(
    'public.get_basic_medical_confirmation_evidence(uuid)'::regprocedure
  )) = 0
  and position('profiles' in pg_get_functiondef(
    'public.get_basic_medical_confirmation_evidence(uuid)'::regprocedure
  )) = 0
  and position('rooms' in pg_get_functiondef(
    'public.get_basic_medical_confirmation_evidence(uuid)'::regprocedure
  )) = 0,
  'evidence payload has no current catalog, profile, or room-name dependency'
);

select set_config('role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select admin_id from y06_context))::text, true
);
select lives_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  'Admin can read authorized evidence'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select viewer_id from y06_context))::text, true
);
select lives_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  'Basic-Medical-scoped Viewer can read a visible registration evidence record'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select lecturer_id from y06_context))::text, true
);
select lives_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  'registration lecturer can read evidence under the existing ownership contract'
);

select lives_ok(
  $$select public.list_basic_medical_registration_confirmation_states(
    array[(select registration_id from y06_context)]
  )$$,
  'registration lecturer can read the narrow confirmation-state list contract'
);

select is(
  (
    select confirmation_id
    from public.list_basic_medical_registration_confirmation_states(
      array[(select registration_id from y06_context)]
    )
  ),
  (select confirmation_id from y06_context),
  'confirmation-state list returns the matching visible confirmation'
);

select is(
  (
    select signer_name_snapshot
    from public.list_basic_medical_registration_confirmation_states(
      array[(select registration_id from y06_context)]
    )
  ),
  'Y06 Lecturer',
  'confirmation-state list returns the immutable signer-name snapshot only'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_basic_medical_registration_confirmation_states(uuid[])',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.list_basic_medical_registration_confirmation_states(uuid[])',
    'EXECUTE'
  ),
  'confirmation-state list is executable only by authenticated application users'
);

select is(
  (public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )->>'signature_data')::text,
  'data:image/png;base64,' || repeat('A', 128),
  'authorized payload returns the exact stored signature'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )#>>'{equipment_checks,0,item_name_snapshot}',
  'Historical snapshot item',
  'equipment name remains the stored snapshot after current catalog rename'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )#>>'{equipment_checks,0,commercial_name_snapshot}',
  'Historical commercial name',
  'commercial name remains the stored snapshot after current catalog rename'
);

select is(
  (
    public.get_basic_medical_confirmation_evidence(
      (select confirmation_id from y06_context)
    ) #> '{equipment_checks,0}'
  ) - array[
    'inventory_id','item_name_snapshot','commercial_name_snapshot','unit_snapshot'
  ],
  jsonb_build_object(
    'total_before', 7, 'good_before', 5, 'damaged_before', 2,
    'newly_damaged_quantity', 1,
    'total_after', 7, 'good_after', 4, 'damaged_after', 3
  ),
  'equipment evidence returns the exact before, newly damaged, and after snapshot'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )->>'schedule_date_snapshot',
  '2040-12-31',
  'schedule evidence uses the stored schedule date snapshot'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )->>'course_code_snapshot',
  'Y06-SNAPSHOT-CODE',
  'course code is the immutable class-schedule snapshot after current course mutation'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )->>'course_name_snapshot',
  'Y06 Snapshot Course',
  'course name is the immutable class-schedule snapshot after current course mutation'
);

select ok(
  (
    public.get_basic_medical_confirmation_evidence(
      (select confirmation_id from y06_context)
    ) - 'equipment_checks' - 'signature_data' - 'confirmation_id'
      - 'registration_id_snapshot' - 'class_schedule_id_snapshot' - 'signer_id'
      - 'schedule_date_snapshot' - 'start_time_snapshot' - 'end_time_snapshot'
      - 'room_id_snapshot' - 'teaching_lecturer_id_snapshot' - 'signed_at'
      - 'invalidated_at' - 'invalidated_reason'
  ) @> jsonb_build_object(
    'room_code_snapshot', 'Y06-R',
    'building_code_snapshot', 'Y06-B',
    'room_name_snapshot', 'Y06 Evidence Room',
    'teaching_lecturer_name_snapshot', 'Y06 Lecturer',
    'signer_name_snapshot', 'Y06 Lecturer',
    'display_snapshots_available', true
  ),
  'room and people display values remain signing-time snapshots after current mutations'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select legacy_confirmation_id from y06_context)
  )->>'display_snapshots_available',
  'false',
  'legacy evidence states honestly that display snapshots are unavailable'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select legacy_confirmation_id from y06_context)
  )->>'course_name_snapshot',
  null,
  'legacy evidence does not reconstruct a course display name from current data'
);

select is(
  public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )->>'invalidated_reason',
  'Y06 historical invalidation',
  'invalidated historical confirmation remains addressable with its reason'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select outsider_id from y06_context))::text, true
);
select throws_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  'P0002', 'CONFIRMATION_EVIDENCE_NOT_FOUND',
  'unscoped Staff receives the same not-found response as a missing record'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select inactive_id from y06_context))::text, true
);
select throws_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  'P0002', 'CONFIRMATION_EVIDENCE_NOT_FOUND',
  'inactive scoped Viewer cannot read evidence'
);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select admin_id from y06_context))::text, true
);
select throws_ok(
  $$select public.get_basic_medical_confirmation_evidence(gen_random_uuid())$$,
  'P0002', 'CONFIRMATION_EVIDENCE_NOT_FOUND',
  'missing evidence uses the same response as unauthorized evidence'
);

select set_config('role', 'anon', true);
select throws_ok(
  $$select public.get_basic_medical_confirmation_evidence(
    (select confirmation_id from y06_context)
  )$$,
  '42501', 'permission denied for function get_basic_medical_confirmation_evidence',
  'anonymous clients cannot invoke the evidence RPC'
);

select set_config('role', 'postgres', true);
select * from finish();
rollback;
