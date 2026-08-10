create or replace function public.find_existing_import_hashes(target_hashes text[])
returns table(normalized_row_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_hashes is null or cardinality(target_hashes) > 500 then
    raise exception 'INVALID_IMPORT_HASHES' using errcode = '22023';
  end if;
  return query
  select distinct rows.normalized_row_hash
  from public.import_rows as rows
  where rows.normalized_row_hash = any(target_hashes)
    and rows.class_schedule_id is not null
    and rows.validation_status in ('imported', 'warning');
end;
$$;

revoke all on function public.find_existing_import_hashes(text[]) from public, anon;
grant execute on function public.find_existing_import_hashes(text[]) to authenticated;

create or replace function public.create_import_schedule_row(
  target_batch_id uuid, target_row_number integer, target_hash text,
  target_raw jsonb, target_normalized jsonb, target_status public.import_row_status,
  target_errors jsonb, target_warnings jsonb, target_course_id uuid,
  target_course_code text, target_course_name text, target_room_id uuid,
  target_lecturer_id uuid, target_date date, target_start time, target_end time,
  target_note text, target_student_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  batch_room_type_id uuid;
  selected_room_type_id uuid;
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_status not in ('imported', 'warning') then
    raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023';
  end if;
  if target_student_count is null or target_student_count < 1 then
    raise exception 'INVALID_STUDENT_COUNT' using errcode = '22023';
  end if;
  if target_hash is null or btrim(target_hash) = '' then
    raise exception 'INVALID_IMPORT_HASH' using errcode = '22023';
  end if;
  select batches.room_type_id into batch_room_type_id
  from public.import_batches as batches
  where batches.id = target_batch_id and batches.created_by = caller_id and batches.status = 'importing';
  if batch_room_type_id is null then
    raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501';
  end if;
  select rooms.room_type_id into selected_room_type_id from public.rooms as rooms where rooms.id = target_room_id;
  if selected_room_type_id is null or selected_room_type_id <> batch_room_type_id
     or not (select private.has_room_type(selected_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if target_lecturer_id is not null and not (
    (select private.profile_has_room_type(target_lecturer_id, selected_room_type_id))
    and exists (select 1 from public.user_roles as roles where roles.user_id = target_lecturer_id and roles.role = 'lecturer')
  ) then
    raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_hash, 0));
  if exists (
    select 1 from public.import_rows as existing_rows
    where existing_rows.normalized_row_hash = target_hash
      and existing_rows.class_schedule_id is not null
      and existing_rows.validation_status in ('imported', 'warning')
  ) then
    raise exception 'IMPORT_ROW_DUPLICATE' using errcode = '23505';
  end if;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, class_code, schedule_date, start_time, end_time,
    source, source_row_id, import_batch_id, schedule_status, note, student_count,
    created_by, published_by, published_at
  ) values (
    target_course_id, target_course_code, target_course_name, target_room_id,
    target_lecturer_id, null, target_date, target_start, target_end,
    'import', null, target_batch_id, 'published', target_note, target_student_count,
    caller_id, caller_id, now()
  ) returning id into schedule_id;

  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash,
    raw_data, normalized_data, validation_status, errors, warnings, class_schedule_id
  ) values (
    target_batch_id, target_row_number, null, target_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb),
    coalesce(target_warnings, '[]'::jsonb), schedule_id
  );
  return schedule_id;
end;
$$;

revoke all on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text, integer
) from public, anon;
grant execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text, integer
) to authenticated;

create or replace function private.materialize_shift_pattern(
  target_pattern_id uuid,
  target_horizon_end date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pattern public.staff_shift_patterns;
  materialize_to date;
  occurrence_date date;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('medlabs:shift-pattern:' || target_pattern_id::text, 0)
  );
  select * into pattern
  from public.staff_shift_patterns
  where id = target_pattern_id
  for update;

  if pattern.id is null or not pattern.is_active then return; end if;
  materialize_to := least(pattern.effective_to, coalesce(target_horizon_end, pattern.effective_to));

  delete from public.staff_shifts where shift_pattern_id = pattern.id;
  for occurrence_date in
    select generated.day_value::date
    from generate_series(pattern.effective_from::timestamp, materialize_to::timestamp, interval '1 day') as generated(day_value)
    where extract(isodow from generated.day_value)::smallint = pattern.weekday
    order by generated.day_value
  loop
    insert into public.staff_shifts (
      staff_id, shift_date, start_time, end_time, shift_type,
      shift_template_id, shift_pattern_id, note, status,
      registration_source, created_by
    ) values (
      pattern.staff_id, occurrence_date, pattern.start_time, pattern.end_time,
      pattern.shift_type, null, pattern.id, pattern.note, 'scheduled',
      'generated', pattern.created_by
    );
  end loop;
end;
$$;

create or replace function private.refresh_open_shift_patterns()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pattern_id uuid;
  business_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('medlabs:refresh-open-shift-patterns', 0)
  ) then
    return;
  end if;
  for pattern_id in
    select patterns.id
    from public.staff_shift_patterns as patterns
    where patterns.is_active
      and patterns.effective_from <= business_today + 365
      and patterns.effective_to >= business_today
    order by patterns.id
  loop
    perform private.materialize_shift_pattern(pattern_id);
  end loop;
end;
$$;
