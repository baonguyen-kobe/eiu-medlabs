-- Keep declarative profile visibility aligned with the hardened migration state.
drop policy if exists profiles_select_active_users on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_role('admin'))
);

-- Remove the obsolete overload which lacks student_count and room-type checks.
drop function if exists public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
);

-- Patch the current function without duplicating its email payload implementation.
-- The guarded replacement intentionally fails the migration if the expected function
-- body changed, forcing a fresh security review instead of silently doing nothing.
do $migration$
declare
  function_definition text;
  unsafe_fragment text := $unsafe$
  if before_row.lecturer_id is null and before_row.lecturer_2_id is null then
    if not (select private.is_active_user()) then
      raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;
  elsif not (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (select private.has_role('importer'))
    or (select auth.uid()) in (before_row.lecturer_id, before_row.lecturer_2_id)
  ) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
$unsafe$;
  hardened_fragment text := $hardened$
  if not (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (select private.has_role('importer'))
    or coalesce(
      (select auth.uid()) in (before_row.lecturer_id, before_row.lecturer_2_id),
      false
    )
  ) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
$hardened$;
begin
  select pg_get_functiondef(procedures.oid)
  into function_definition
  from pg_proc as procedures
  join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
  where namespaces.nspname = 'public'
    and procedures.proname = 'reschedule_class'
    and pg_get_function_identity_arguments(procedures.oid) =
      'target_schedule_id uuid, target_schedule_date date';

  if function_definition is null or position(unsafe_fragment in function_definition) = 0 then
    raise exception 'RESCHEDULE_CLASS_DEFINITION_CHANGED';
  end if;

  execute replace(function_definition, unsafe_fragment, hardened_fragment);
end;
$migration$;

-- SQL NOT IN returns NULL when both assignee columns are NULL. Normalize that
-- three-valued result so an unrelated active user cannot pass the details RPC.
do $migration$
declare
  function_definition text;
  unsafe_fragment text := $unsafe$
    if (select auth.uid()) not in (before_row.lecturer_id, before_row.lecturer_2_id) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
$unsafe$;
  hardened_fragment text := $hardened$
    if not coalesce(
      (select auth.uid()) in (before_row.lecturer_id, before_row.lecturer_2_id),
      false
    ) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
$hardened$;
begin
  select pg_get_functiondef(procedures.oid)
  into function_definition
  from pg_proc as procedures
  join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
  where namespaces.nspname = 'public'
    and procedures.proname = 'update_class_schedule_details'
    and pg_get_function_identity_arguments(procedures.oid) =
      'target_schedule_id uuid, target_schedule_date date, target_start_time time without time zone, target_end_time time without time zone, target_room_id uuid, target_student_count integer, target_lecturer_ids uuid[]';

  if function_definition is null or position(unsafe_fragment in function_definition) = 0 then
    raise exception 'UPDATE_CLASS_DETAILS_DEFINITION_CHANGED';
  end if;

  execute replace(function_definition, unsafe_fragment, hardened_fragment);
end;
$migration$;
