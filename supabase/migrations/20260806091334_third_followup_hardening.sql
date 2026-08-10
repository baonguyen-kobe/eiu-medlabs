-- Third safe-review follow-up: additive schedule roles, timestamp-safe shift
-- materialization and cancelled-import hash handling.

create or replace function private.can_modify_class_schedule(
  target_schedule_id uuid,
  target_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  schedule_row public.class_schedules;
  room_type_value uuid;
  in_scope boolean := false;
  importer_owns boolean := false;
  lecturer_is_related boolean := false;
  can_admin boolean := false;
  can_staff boolean := false;
  can_importer boolean := false;
  can_lecturer boolean := false;
begin
  if actor_id is null or not (select private.is_active_user()) then
    return false;
  end if;
  if target_action not in ('assign_lecturers', 'reschedule', 'details', 'delete') then
    return false;
  end if;

  select schedules.* into schedule_row
  from public.class_schedules schedules
  where schedules.id = target_schedule_id;
  if schedule_row.id is null or schedule_row.schedule_status = 'cancelled' then
    return false;
  end if;

  select rooms.room_type_id into room_type_value
  from public.rooms rooms
  where rooms.id = schedule_row.room_id;
  in_scope := room_type_value is not null
    and (select private.has_room_type(room_type_value));
  importer_owns := schedule_row.created_by = actor_id or exists (
    select 1
    from public.import_batches batches
    where batches.id = schedule_row.import_batch_id
      and batches.created_by = actor_id
  );
  lecturer_is_related := schedule_row.created_by = actor_id
    or coalesce(actor_id in (schedule_row.lecturer_id, schedule_row.lecturer_2_id), false);

  can_admin := (select private.has_role('admin'));
  can_staff := (select private.has_role('staff')) and in_scope;
  can_importer := (select private.has_role('importer'))
    and in_scope
    and importer_owns;

  if (select private.has_role('lecturer')) then
    if target_action in ('reschedule', 'details') then
      can_lecturer := in_scope and lecturer_is_related;
    elsif target_action = 'delete' then
      can_lecturer := in_scope
        and schedule_row.created_by = actor_id
        and room_type_value = '40000000-0000-0000-0000-000000000001'::uuid;
    end if;
  end if;

  return coalesce(can_admin, false)
    or coalesce(can_staff, false)
    or coalesce(can_importer, false)
    or coalesce(can_lecturer, false);
end;
$$;

revoke all on function private.can_modify_class_schedule(uuid, text) from public, anon;
grant execute on function private.can_modify_class_schedule(uuid, text) to authenticated;

create or replace function private.preserve_staff_shift_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.registration_source <> 'generated'
    or old.status in ('completed', 'cancelled')
    or (old.shift_date + old.start_time)
      <= (now() at time zone 'Asia/Ho_Chi_Minh') then
    return null;
  end if;
  return old;
end;
$$;

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
  materialize_from date;
  materialize_to date;
  occurrence_date date;
  business_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('medlabs:shift-pattern:' || target_pattern_id::text, 0)
  );
  select * into pattern
  from public.staff_shift_patterns
  where id = target_pattern_id
  for update;

  if pattern.id is null or not pattern.is_active then return; end if;
  materialize_from := greatest(pattern.effective_from, business_now::date);
  materialize_to := least(pattern.effective_to, coalesce(target_horizon_end, pattern.effective_to));
  if materialize_from > materialize_to then return; end if;

  for occurrence_date in
    select generated.day_value::date
    from generate_series(materialize_from::timestamp, materialize_to::timestamp, interval '1 day') as generated(day_value)
    where extract(isodow from generated.day_value)::smallint = pattern.weekday
      and generated.day_value::date + pattern.start_time > business_now
    order by generated.day_value
  loop
    begin
      insert into public.staff_shifts (
        staff_id, shift_date, start_time, end_time, shift_type,
        shift_template_id, shift_pattern_id, note, status,
        registration_source, created_by
      ) values (
        pattern.staff_id, occurrence_date, pattern.start_time, pattern.end_time,
        pattern.shift_type, null, pattern.id, pattern.note, 'scheduled',
        'generated', pattern.created_by
      )
      on conflict (shift_pattern_id, shift_date) where shift_pattern_id is not null
      do update set staff_id = excluded.staff_id, start_time = excluded.start_time,
        end_time = excluded.end_time, shift_type = excluded.shift_type,
        note = excluded.note, updated_at = now()
      where staff_shifts.registration_source = 'generated'
        and staff_shifts.status = 'scheduled';
    exception when exclusion_violation then null;
    end;
  end loop;
end;
$$;

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
  join public.class_schedules schedules on schedules.id = rows.class_schedule_id
  where rows.normalized_row_hash = any(target_hashes)
    and rows.validation_status in ('imported', 'warning')
    and schedules.schedule_status <> 'cancelled';
end;
$$;

revoke all on function public.find_existing_import_hashes(text[]) from public, anon;
grant execute on function public.find_existing_import_hashes(text[]) to authenticated;

revoke all on function private.preserve_staff_shift_history() from public, anon, authenticated;
revoke all on function private.materialize_shift_pattern(uuid, date) from public, anon, authenticated;
