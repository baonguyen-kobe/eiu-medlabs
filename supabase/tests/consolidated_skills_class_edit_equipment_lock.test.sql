begin;
select plan(13);

-- 1. Helper function existence & security
select has_function(
  'private', 'class_schedule_has_equipment_request', ARRAY['uuid'],
  'private.class_schedule_has_equipment_request(uuid) helper exists'
);

-- 2. Batch lock query RPC existence
select has_function(
  'public', 'get_class_schedules_equipment_lock_status', ARRAY['uuid[]'],
  'public.get_class_schedules_equipment_lock_status(uuid[]) exists'
);

-- 3. Dedicated atomic Skills class mutation RPC existence
select has_function(
  'public', 'update_skills_lab_class_schedule',
  ARRAY['uuid', 'date', 'time without time zone', 'time without time zone', 'uuid', 'uuid', 'integer', 'uuid[]'],
  'public.update_skills_lab_class_schedule exists with authoritative signature'
);

-- 4. Skills Lab mutation RPC enforces equipment lock and domain boundaries
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.update_skills_lab_class_schedule(uuid,date,time,time,uuid,uuid,integer,uuid[])'::regprocedure)) > 0
  and position('SKILLS_LAB_SCHEDULE_REQUIRED' in pg_get_functiondef('public.update_skills_lab_class_schedule(uuid,date,time,time,uuid,uuid,integer,uuid[])'::regprocedure)) > 0
  and position('BASIC_MEDICAL_SCHEDULE_MUTATION_FORBIDDEN' in pg_get_functiondef('public.update_skills_lab_class_schedule(uuid,date,time,time,uuid,uuid,integer,uuid[])'::regprocedure)) > 0,
  'update_skills_lab_class_schedule enforces equipment lock and domain boundaries'
);

-- 5. withdraw_class enforces equipment lock
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.withdraw_class(uuid)'::regprocedure)) > 0,
  'withdraw_class enforces equipment lock'
);

-- 6. delete_skills_lab_class_schedule enforces equipment lock
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.delete_skills_lab_class_schedule(uuid)'::regprocedure)) > 0,
  'delete_skills_lab_class_schedule enforces equipment lock'
);

-- 7. reschedule_class enforces equipment lock
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.reschedule_class(uuid,date)'::regprocedure)) > 0,
  'reschedule_class enforces equipment lock'
);

-- 8. assign_class_lecturers enforces equipment lock
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.assign_class_lecturers(uuid,uuid[])'::regprocedure)) > 0,
  'assign_class_lecturers enforces equipment lock'
);

-- 9. update_class_schedule_details_core enforces equipment lock
select ok(
  position('CLASS_EQUIPMENT_REQUEST_EXISTS' in pg_get_functiondef('public.update_class_schedule_details_core(uuid,date,time,time,uuid,integer,uuid[])'::regprocedure)) > 0,
  'update_class_schedule_details_core enforces equipment lock'
);

-- 10. Check that update_class_schedule_details_core is revoked from anon/public/authenticated
select ok(
  has_function_privilege('anon', 'public.update_class_schedule_details_core(uuid,date,time,time,uuid,integer,uuid[])', 'execute') = false
  and has_function_privilege('authenticated', 'public.update_class_schedule_details_core(uuid,date,time,time,uuid,integer,uuid[])', 'execute') = false,
  'update_class_schedule_details_core is strictly private to internal wrapper'
);

-- 11. Check that private.class_schedule_has_equipment_request(uuid) has NO execute privilege for authenticated
select ok(
  has_function_privilege('authenticated', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE') = false,
  'private.class_schedule_has_equipment_request(uuid) is denied to authenticated'
);

-- 12. Check that private.class_schedule_has_equipment_request(uuid) has NO execute privilege for anon
select ok(
  has_function_privilege('anon', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE') = false,
  'private.class_schedule_has_equipment_request(uuid) is denied to anon'
);

-- 13. Check that private.class_schedule_has_equipment_request(uuid) has NO execute privilege for public
select ok(
  has_function_privilege('public', 'private.class_schedule_has_equipment_request(uuid)', 'EXECUTE') = false,
  'private.class_schedule_has_equipment_request(uuid) is denied to public'
);

select * from finish();
rollback;
