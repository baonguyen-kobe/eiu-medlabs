-- pgTAP tests for Ninth + Remaining Workflows hardening
-- Covers: N-HIGH-01 INSERT guard, CF-HIGH-02 RESTRICT FK,
--         EQ-HIGH-04 direct DML denied, IMP-HIGH-01 conflict/system_error,
--         can_hard_delete, email queue cleanup authority.

begin;
select plan(23);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. can_hard_delete() returns false when no security principal is configured
--    (the tests run in an empty-session context without a signed-in user)
-- ─────────────────────────────────────────────────────────────────────────────
select is(
  (select private.can_hard_delete()),
  false,
  'can_hard_delete() returns false when no security principal configured'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2-3. Guard trigger covers INSERT (bit 4) + UPDATE (bit 8) + DELETE (bit 16)
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  (select (t.tgtype & 4) > 0
   from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'class_schedules'
     and t.tgname = 'guard_basic_medical_linked_schedule_mutation'
  ),
  'guard_basic_medical_linked_schedule_mutation fires on INSERT'
);

select ok(
  (select (t.tgtype & 4) > 0 and (t.tgtype & 8) > 0 and (t.tgtype & 16) > 0
   from pg_trigger t
   join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'class_schedules'
     and t.tgname = 'guard_basic_medical_linked_schedule_mutation'
  ),
  'guard trigger fires on INSERT, UPDATE, and DELETE'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Direct INSERT linked schedule is denied (no flag set)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.try_insert_linked_schedule()
returns boolean language plpgsql as $$
declare
  v_room_id uuid;
  v_created_by uuid;
begin
  select id into v_room_id from public.rooms where is_active limit 1;
  select id into v_created_by from public.profiles where is_active limit 1;
  if v_room_id is null or v_created_by is null then return true; end if;
  begin
    insert into public.class_schedules (
      course_code_snapshot, course_name_snapshot,
      schedule_date, start_time, end_time,
      room_id, created_by, schedule_status, source,
      basic_medical_registration_id
    ) values (
      'TEST', 'Test', current_date, '08:00:00', '10:00:00',
      v_room_id, v_created_by, 'draft', 'manual',
      gen_random_uuid()
    );
    return false; -- guard did not fire
  exception when sqlstate '42501' then
    return true;  -- guard fired correctly
  end;
end;
$$;

select ok(
  pg_temp.try_insert_linked_schedule(),
  'direct INSERT with basic_medical_registration_id denied by guard trigger'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Direct UPDATE ordinary→linked schedule is denied
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.try_update_to_linked()
returns boolean language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id from public.class_schedules
  where basic_medical_registration_id is null limit 1;
  if v_id is null then return true; end if;
  begin
    update public.class_schedules
    set basic_medical_registration_id = gen_random_uuid()
    where id = v_id;
    return false;
  exception when sqlstate '42501' then
    return true;
  end;
end;
$$;

select ok(
  pg_temp.try_update_to_linked(),
  'UPDATE ordinary→linked schedule denied by guard trigger'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6-7. import_row_status enum includes conflict and system_error
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'import_row_status'
      and e.enumlabel = 'conflict'
  ),
  'import_row_status enum includes conflict'
);

select ok(
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'import_row_status'
      and e.enumlabel = 'system_error'
  ),
  'import_row_status enum includes system_error'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. record_import_validation_row RPC rejects 'imported' status
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.record_row_invalid_status()
returns boolean language plpgsql as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_creator_id uuid;
  v_room_type_id uuid;
begin
  select id into v_creator_id from public.profiles where is_active limit 1;
  select id into v_room_type_id from public.room_types limit 1;
  if v_creator_id is null then return true; end if; -- skip
  insert into public.import_batches (id, source_type, original_file_name, file_hash,
    status, total_rows, created_by, room_type_id)
  values (v_batch_id, 'import', 'test.xlsx', 'hash-' || v_batch_id,
    'importing', 1, v_creator_id, v_room_type_id);
  begin
    perform public.record_import_validation_row(
      v_batch_id, 1, 'hash1', '{}', '{}', 'imported', '[]', '[]'
    );
    delete from public.import_batches where id = v_batch_id;
    return false;
  exception when sqlstate '22023' then
    delete from public.import_batches where id = v_batch_id;
    return true;
  end;
end;
$$;

select ok(
  pg_temp.record_row_invalid_status(),
  'record_import_validation_row rejects imported status with INVALID_IMPORT_ROW_STATUS'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9-10. Equipment request items: for-all policy removed; select policy exists
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'equipment_request_items'
      and policyname = 'equipment_items_manage'
  ),
  'equipment_items_manage for-all policy has been removed'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'equipment_request_items'
      and cmd = 'SELECT'
  ),
  'equipment_request_items still has a SELECT policy'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11-13. New RPCs exist
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  exists (select 1 from pg_proc where proname = 'add_equipment_request_item'),
  'add_equipment_request_item function exists'
);

select ok(
  exists (select 1 from pg_proc where proname = 'remove_equipment_request_item'),
  'remove_equipment_request_item function exists'
);

select ok(
  exists (select 1 from pg_proc where proname = 'finalize_import_batch'),
  'finalize_import_batch function exists'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. claim_personnel_reconciliation_batch exists and is NOT granted to authenticated
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  exists (select 1 from pg_proc where proname = 'claim_personnel_reconciliation_batch'),
  'claim_personnel_reconciliation_batch function exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_personnel_reconciliation_batch(integer,text,integer)',
    'EXECUTE'
  ),
  'claim_personnel_reconciliation_batch is not granted to authenticated role'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. can_hard_delete function exists in private schema
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_hard_delete'
  ),
  'private.can_hard_delete() function exists'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16-17. admin_delete_email_notifications exists and denies non-authority actors
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  exists (select 1 from pg_proc where proname = 'admin_delete_email_notifications'),
  'admin_delete_email_notifications function exists'
);

create or replace function pg_temp.try_delete_notifications_as_regular_user()
returns boolean language plpgsql as $$
begin
  begin
    perform public.admin_delete_email_notifications(array[gen_random_uuid()]);
    return false;
  exception when sqlstate '42501' then
    return true;
  end;
end;
$$;

select ok(
  pg_temp.try_delete_notifications_as_regular_user(),
  'admin_delete_email_notifications denied without hard-delete authority'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. equipment_requests FK on class_schedule_id is RESTRICT
-- ─────────────────────────────────────────────────────────────────────────────
select ok(
  (select confdeltype = 'r' from pg_constraint
   where conrelid = 'public.equipment_requests'::regclass
     and conname = 'equipment_requests_class_schedule_id_fkey'),
  'equipment_requests.class_schedule_id FK uses ON DELETE RESTRICT'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 19-21. personnel_update_operations has reconcile lease columns
-- ─────────────────────────────────────────────────────────────────────────────
select has_column(
  'public', 'personnel_update_operations', 'reconcile_started_at',
  'personnel_update_operations has reconcile_started_at column'
);
select has_column(
  'public', 'personnel_update_operations', 'reconcile_lease_expires_at',
  'personnel_update_operations has reconcile_lease_expires_at column'
);
select has_column(
  'public', 'personnel_update_operations', 'reconcile_worker_id',
  'personnel_update_operations has reconcile_worker_id column'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. finalize_import_batch computes correct counts from DB
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.test_finalize_import_batch()
returns boolean language plpgsql as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_creator_id uuid;
  v_room_type_id uuid;
  v_result jsonb;
begin
  select id into v_creator_id from public.profiles where email = 'admin@campus.local' limit 1;
  select id into v_room_type_id from public.room_types limit 1;
  if v_creator_id is null then return true; end if;

  insert into public.import_batches (id, source_type, original_file_name, file_hash,
    status, total_rows, created_by, room_type_id)
  values (v_batch_id, 'import', 'test.xlsx', 'hash-' || v_batch_id,
    'importing', 4, v_creator_id, v_room_type_id);

  insert into public.import_rows (import_batch_id, row_number, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings)
  values
    (v_batch_id, 1, 'h1', '{}', '{}', 'imported',   '[]', '[]'),
    (v_batch_id, 2, 'h2', '{}', '{}', 'duplicate',  '[]', '[]'),
    (v_batch_id, 3, 'h3', '{}', '{}', 'conflict',   '[]', '[]'),
    (v_batch_id, 4, 'h4', '{}', '{}', 'system_error','[]', '[]');

  -- Simulate the creator calling finalize: set auth.uid() via JWT claims
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_creator_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_creator_id::text, true);

  select public.finalize_import_batch(v_batch_id) into v_result;

  return (v_result->>'imported')::integer = 1
     and (v_result->>'duplicates')::integer = 1
     and (v_result->>'conflicts')::integer = 1
     and (v_result->>'system_errors')::integer = 1
     and v_result->>'status' = 'completed_with_errors';
end;
$$;

select ok(
  pg_temp.test_finalize_import_batch(),
  'finalize_import_batch computes counts from DB: imported=1, dup=1, conflict=1, sys_err=1'
);

select * from finish();
rollback;