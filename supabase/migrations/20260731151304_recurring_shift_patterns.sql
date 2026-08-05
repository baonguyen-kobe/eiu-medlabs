alter table public.staff_shift_patterns
  add column time_range tsrange generated always as (
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)')
  ) stored;

alter table public.staff_shift_patterns
  add constraint staff_shift_patterns_no_overlap exclude using gist (
    staff_id with =,
    weekday with =,
    time_range with &&
  ) where (is_active);

create or replace function private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_name text;
  target_id uuid;
  before_data jsonb;
  after_data jsonb;
begin
  before_data := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_data := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_id := coalesce((after_data ->> 'id')::uuid, (before_data ->> 'id')::uuid);

  if tg_table_name = 'class_schedules' then
    action_name := case
      when tg_op = 'INSERT' then 'class_schedule.created'
      when tg_op = 'DELETE' then 'class_schedule.deleted'
      when old.schedule_status is distinct from new.schedule_status then 'class_schedule.status_changed'
      when old.lecturer_id is distinct from new.lecturer_id then 'class_schedule.lecturer_changed'
      else 'class_schedule.updated'
    end;
  elsif tg_table_name = 'staff_shifts' then
    action_name := case
      when tg_op = 'INSERT' then 'staff_shift.created'
      when old.status is distinct from new.status then 'staff_shift.status_changed'
      else 'staff_shift.updated'
    end;
  elsif tg_table_name = 'staff_shift_patterns' then
    action_name := case
      when tg_op = 'INSERT' then 'staff_shift_pattern.created'
      when old.is_active is distinct from new.is_active then 'staff_shift_pattern.status_changed'
      else 'staff_shift_pattern.updated'
    end;
  elsif tg_table_name = 'import_batches' then
    action_name := case when tg_op = 'INSERT' then 'import.started' else 'import.status_changed' end;
  elsif tg_table_name = 'user_roles' then
    action_name := case when tg_op = 'INSERT' then 'role.assigned' else 'role.removed' end;
    target_id := coalesce((after_data ->> 'user_id')::uuid, (before_data ->> 'user_id')::uuid);
  else
    action_name := 'profile.updated';
  end if;

  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, old_data, new_data
  ) values (
    (select auth.uid()), action_name, tg_table_name, target_id, before_data, after_data
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger staff_shift_patterns_audit
after insert or update on public.staff_shift_patterns
for each row execute function private.audit_business_change();

create function public.register_own_shift_pattern(
  target_weekday smallint,
  target_shift_type text,
  target_note text default null
)
returns public.staff_shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_type text := upper(btrim(target_shift_type));
  target_start time;
  target_end time;
  created_pattern public.staff_shift_patterns;
begin
  if not (select private.has_role('staff')) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if target_weekday not between 1 and 7 then
    raise exception 'INVALID_SHIFT_WEEKDAY' using errcode = '22023';
  end if;

  case normalized_type
    when 'MORNING' then target_start := time '08:30'; target_end := time '11:30';
    when 'AFTERNOON' then target_start := time '13:30'; target_end := time '16:30';
    when 'ALL_DAY' then target_start := time '08:30'; target_end := time '16:30';
    else raise exception 'INVALID_SHIFT_TYPE' using errcode = '22023';
  end case;

  insert into public.staff_shift_patterns (
    staff_id, weekday, start_time, end_time, shift_type,
    effective_from, effective_to, note, created_by
  ) values (
    (select auth.uid()), target_weekday, target_start, target_end, normalized_type,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date, null,
    nullif(btrim(target_note), ''), (select auth.uid())
  ) returning * into created_pattern;

  return created_pattern;
exception
  when exclusion_violation then
    raise exception 'STAFF_SHIFT_PATTERN_CONFLICT' using errcode = '23P01';
end;
$$;

create function public.cancel_own_shift_pattern(target_pattern_id uuid)
returns public.staff_shift_patterns
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.staff_shift_patterns;
  cancelled_pattern public.staff_shift_patterns;
begin
  if not (select private.has_role('staff')) then
    raise exception 'STAFF_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row
  from public.staff_shift_patterns
  where id = target_pattern_id
    and staff_id = (select auth.uid())
    and is_active
  for update;

  if before_row.id is null then
    raise exception 'NOT_SHIFT_PATTERN_OWNER' using errcode = '42501';
  end if;

  update public.staff_shift_patterns
  set is_active = false,
      effective_to = least(
        coalesce(effective_to, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
        (now() at time zone 'Asia/Ho_Chi_Minh')::date
      ),
      updated_at = now()
  where id = target_pattern_id
  returning * into cancelled_pattern;

  return cancelled_pattern;
end;
$$;

revoke execute on function public.register_own_shift_pattern(smallint, text, text) from public, anon;
revoke execute on function public.cancel_own_shift_pattern(uuid) from public, anon;
grant execute on function public.register_own_shift_pattern(smallint, text, text) to authenticated;
grant execute on function public.cancel_own_shift_pattern(uuid) to authenticated;
