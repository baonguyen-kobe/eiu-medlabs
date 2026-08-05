create or replace function public.create_import_schedule_row(
  target_batch_id uuid,
  target_row_number integer,
  target_hash text,
  target_raw jsonb,
  target_normalized jsonb,
  target_status public.import_row_status,
  target_errors jsonb,
  target_warnings jsonb,
  target_course_id uuid,
  target_course_code text,
  target_course_name text,
  target_room_id uuid,
  target_lecturer_id uuid,
  target_date date,
  target_start time,
  target_end time,
  target_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  lecturer_id_value uuid;
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('imported', 'warning') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.import_batches b
    where b.id = target_batch_id
      and b.created_by = caller_id
      and b.status = 'importing'
  ) then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;

  lecturer_id_value := case
    when (select private.has_role('admin')) then target_lecturer_id
    else null
  end;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, class_code, schedule_date, start_time, end_time,
    source, source_row_id, import_batch_id, schedule_status, note, created_by
  ) values (
    target_course_id, target_course_code, target_course_name, target_room_id,
    lecturer_id_value, null, target_date, target_start, target_end,
    'import', null, target_batch_id, 'draft', target_note, caller_id
  )
  returning id into schedule_id;

  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings,
    class_schedule_id
  ) values (
    target_batch_id, target_row_number, null, target_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb),
    coalesce(target_warnings, '[]'::jsonb), schedule_id
  );

  return schedule_id;
end;
$$;

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
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('error', 'duplicate') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.import_batches b
    where b.id = target_batch_id
      and b.created_by = caller_id
      and b.status = 'importing'
  ) then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
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

revoke execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) from public, anon;
revoke execute on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) from public, anon;

grant execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text
) to authenticated;
grant execute on function public.record_import_validation_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb
) to authenticated;
