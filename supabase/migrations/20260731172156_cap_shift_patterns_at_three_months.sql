update public.staff_shift_patterns
set effective_to = (effective_from + interval '3 months')::date - 1,
    updated_at = now()
where effective_to is null;

alter table public.staff_shift_patterns
  alter column effective_to set not null;

alter table public.staff_shift_patterns
  drop constraint shift_patterns_dates_valid;

alter table public.staff_shift_patterns
  add constraint shift_patterns_dates_valid check (effective_to >= effective_from);

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
  select * into pattern
  from public.staff_shift_patterns
  where id = target_pattern_id
  for update;

  if pattern.id is null or not pattern.is_active then
    return;
  end if;

  materialize_to := least(
    pattern.effective_to,
    coalesce(target_horizon_end, pattern.effective_to)
  );

  delete from public.staff_shifts
  where shift_pattern_id = pattern.id;

  for occurrence_date in
    select generated.day_value::date
    from generate_series(
      pattern.effective_from::timestamp,
      materialize_to::timestamp,
      interval '1 day'
    ) as generated(day_value)
    where extract(isodow from generated.day_value)::smallint = pattern.weekday
    order by generated.day_value
  loop
    delete from public.staff_shifts
    where staff_id = pattern.staff_id
      and shift_date = occurrence_date
      and status <> 'cancelled'
      and time_range && tsrange(
        occurrence_date + pattern.start_time,
        occurrence_date + pattern.end_time,
        '[)'
      );

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

create or replace function public.register_own_shift_pattern(
  target_weekday smallint,
  target_shift_type text,
  target_effective_from date,
  target_effective_to date default null,
  target_note text default null
)
returns setof public.staff_shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_type text := upper(btrim(target_shift_type));
  resolved_effective_to date;
  slot record;
  replaced_pattern record;
  created_pattern public.staff_shift_patterns;
begin
  if not (
    (select private.has_role('staff'))
    or (select private.has_role('admin'))
  ) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_weekday not between 1 and 7 then
    raise exception 'INVALID_SHIFT_WEEKDAY' using errcode = '22023';
  end if;
  if target_effective_from is null then
    raise exception 'SHIFT_EFFECTIVE_FROM_REQUIRED' using errcode = '22004';
  end if;

  resolved_effective_to := coalesce(
    target_effective_to,
    (target_effective_from + interval '3 months')::date - 1
  );

  if resolved_effective_to < target_effective_from then
    raise exception 'INVALID_SHIFT_EFFECTIVE_RANGE' using errcode = '22007';
  end if;
  if normalized_type not in ('MORNING', 'AFTERNOON', 'ALL_DAY') then
    raise exception 'INVALID_SHIFT_TYPE' using errcode = '22023';
  end if;

  for slot in
    select * from (
      values
        ('MORNING'::text, time '08:30', time '11:30'),
        ('AFTERNOON'::text, time '13:30', time '16:30')
    ) as available_slots(shift_type, start_time, end_time)
    where normalized_type = 'ALL_DAY' or available_slots.shift_type = normalized_type
    order by available_slots.start_time
  loop
    for replaced_pattern in
      select id
      from public.staff_shift_patterns
      where staff_id = caller_id
        and weekday = target_weekday
        and is_active
        and time_range && tsrange(
          date '2000-01-01' + slot.start_time,
          date '2000-01-01' + slot.end_time,
          '[)'
        )
        and effective_range && daterange(
          target_effective_from,
          resolved_effective_to + 1,
          '[)'
        )
      order by id
      for update
    loop
      delete from public.staff_shifts
      where shift_pattern_id = replaced_pattern.id;

      update public.staff_shift_patterns
      set is_active = false,
          updated_at = now()
      where id = replaced_pattern.id;
    end loop;

    insert into public.staff_shift_patterns (
      staff_id, weekday, start_time, end_time, shift_type,
      effective_from, effective_to, note, created_by
    ) values (
      caller_id, target_weekday, slot.start_time, slot.end_time, slot.shift_type,
      target_effective_from, resolved_effective_to,
      nullif(btrim(target_note), ''), caller_id
    )
    returning * into created_pattern;

    perform private.materialize_shift_pattern(created_pattern.id);
    return next created_pattern;
  end loop;
  return;
exception
  when exclusion_violation then
    raise exception 'STAFF_SHIFT_PATTERN_CONFLICT' using errcode = '23P01';
end;
$$;

do $$
declare
  pattern_id uuid;
begin
  for pattern_id in
    select id
    from public.staff_shift_patterns
    where is_active
    order by id
  loop
    perform private.materialize_shift_pattern(pattern_id);
  end loop;
end;
$$;
