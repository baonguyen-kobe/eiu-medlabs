-- Scope every import-only RPC and direct row insert to the explicit capability.
grant insert, update, delete on public.class_schedules to service_role;
grant insert, update, delete on public.import_batches to service_role;
grant insert, update, delete on public.import_rows to service_role;

drop function if exists public.find_existing_import_hashes(text[]);

create or replace function public.find_existing_import_hashes(
  target_hashes text[],
  target_room_type_id uuid
)
returns table(normalized_row_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_import_schedules(target_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  return query
  select distinct rows.normalized_row_hash
  from public.import_rows rows
  join public.class_schedules schedules on schedules.id = rows.class_schedule_id
  join public.rooms rooms on rooms.id = schedules.room_id
  where rows.normalized_row_hash = any(coalesce(target_hashes, array[]::text[]))
    and rows.validation_status in ('imported', 'warning')
    and schedules.schedule_status <> 'cancelled'
    and rooms.room_type_id = target_room_type_id;
end;
$$;

drop function if exists public.update_class_schedule_details_authorized_impl(
  uuid, date, time, time, uuid, integer, uuid[]
);

revoke all on function public.find_existing_import_hashes(text[], uuid) from public, anon;
grant execute on function public.find_existing_import_hashes(text[], uuid) to authenticated;

revoke all on function public.import_hash_exists(text) from authenticated;

create or replace function public.record_import_validation_row(
  target_batch_id uuid,
  target_row_number integer,
  target_hash text,
  target_raw jsonb,
  target_normalized jsonb,
  target_status public.import_row_status,
  target_errors jsonb,
  target_warnings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  row_id uuid;
  batch_room_type_id uuid;
begin
  if target_status not in ('error', 'duplicate') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;

  select batches.room_type_id
  into batch_room_type_id
  from public.import_batches batches
  where batches.id = target_batch_id
    and batches.created_by = caller_id
    and batches.status = 'importing';

  if batch_room_type_id is null then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;
  if not (select private.can_import_schedules(batch_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings
  ) values (
    target_batch_id, target_row_number, null, target_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb),
    coalesce(target_warnings, '[]'::jsonb)
  )
  returning id into row_id;

  return row_id;
end;
$$;

revoke all on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) from public, anon;
grant execute on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) to authenticated;

drop policy if exists import_rows_insert on public.import_rows;
create policy import_rows_insert on public.import_rows
for insert to authenticated
with check (
  exists (
    select 1
    from public.import_batches batches
    where batches.id = import_rows.import_batch_id
      and batches.created_by = (select auth.uid())
      and batches.status = 'importing'
      and (select private.can_import_schedules(batches.room_type_id))
  )
);

-- Legacy helper bodies remain non-executable to clients, but the authorized wrapper
-- delegates to reschedule_class_authorized_impl. Remove the deprecated role check
-- so the wrapper's ownership decision remains authoritative.
do $$
declare
  function_oid oid;
  function_sql text;
begin
  function_oid := to_regprocedure('public.reschedule_class_authorized_impl(uuid,date)');
  if function_oid is not null then
    function_sql := pg_get_functiondef(function_oid);
    function_sql := replace(
      function_sql,
      '(select private.has_role(''importer''))',
      '((select private.has_role(''teaching_assistant'')) or exists (select 1 from public.profiles capability_profile where capability_profile.id = (select auth.uid()) and capability_profile.can_import_schedules))'
    );
    execute function_sql;
  end if;

  foreach function_oid in array array[
    to_regprocedure('public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'),
    to_regprocedure('public.create_equipment_request_with_items(uuid,text,uuid,timestamp with time zone,timestamp with time zone,text,text,jsonb)')
  ]
  loop
    if function_oid is not null then
      function_sql := pg_get_functiondef(function_oid);
      function_sql := replace(
        function_sql,
        '(select private.has_role(''importer''))',
        '(select private.has_role(''teaching_assistant''))'
      );
      execute function_sql;
    end if;
  end loop;
end;
$$;
