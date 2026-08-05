do $$
declare
  old_pattern public.staff_shift_patterns;
  afternoon_pattern_id uuid;
begin
  for old_pattern in
    select *
    from public.staff_shift_patterns
    where is_active
      and upper(shift_type) = 'ALL_DAY'
    order by id
    for update
  loop
    update public.staff_shift_patterns
    set start_time = time '08:30',
        end_time = time '11:30',
        shift_type = 'MORNING',
        updated_at = now()
    where id = old_pattern.id;

    insert into public.staff_shift_patterns (
      staff_id, weekday, start_time, end_time, shift_type,
      effective_from, effective_to, is_active, note, created_by
    ) values (
      old_pattern.staff_id, old_pattern.weekday,
      time '13:30', time '16:30', 'AFTERNOON',
      old_pattern.effective_from, old_pattern.effective_to,
      true, old_pattern.note, old_pattern.created_by
    )
    returning id into afternoon_pattern_id;

    perform private.materialize_shift_pattern(old_pattern.id);
    perform private.materialize_shift_pattern(afternoon_pattern_id);
  end loop;
end;
$$;
