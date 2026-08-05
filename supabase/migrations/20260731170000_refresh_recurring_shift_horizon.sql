create extension if not exists pg_cron with schema pg_catalog;

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
    coalesce(
      pattern.effective_to,
      greatest(
        pattern.effective_from,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date + 365
      )
    ),
    coalesce(
      target_horizon_end,
      greatest(
        pattern.effective_from,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date + 365
      )
    )
  );

  delete from public.staff_shifts
  where shift_pattern_id = pattern.id
    and shift_date between pattern.effective_from and materialize_to;

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
      and (patterns.effective_to is null or patterns.effective_to >= business_today)
    order by patterns.id
  loop
    perform private.materialize_shift_pattern(pattern_id, business_today + 365);
  end loop;
end;
$$;

select cron.schedule(
  'medlabs-refresh-open-shift-patterns',
  '15 17 * * *',
  'select private.refresh_open_shift_patterns();'
);
