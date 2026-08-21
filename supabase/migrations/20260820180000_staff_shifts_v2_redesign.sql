-- Staff Shift V2 Redesign Migration
-- 1. Capability: Add can_manage_shift_history to public.profiles
alter table public.profiles
  add column if not exists can_manage_shift_history boolean not null default false;

update public.profiles
set can_manage_shift_history = true
where email = 'bao.nguyen@eiu.edu.vn';

-- 2. Unschedule pg_cron job if present
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'medlabs-refresh-open-shift-patterns') then
      perform cron.unschedule('medlabs-refresh-open-shift-patterns');
    end if;
  end if;
end $$;

-- 3. Fail-closed assertion before dropping legacy data structures
-- In migration execution on a clean production state, staff_shift_patterns and shift_templates must be safe to drop.
-- If any rows remain with active references in a production environment, raise error.
do $$
declare
  pattern_count integer;
  template_count integer;
  shift_with_pattern_count integer;
  shift_with_template_count integer;
begin
  select count(*) into pattern_count from public.staff_shift_patterns;
  select count(*) into template_count from public.shift_templates;
  select count(*) into shift_with_pattern_count from public.staff_shifts where shift_pattern_id is not null;
  select count(*) into shift_with_template_count from public.staff_shifts where shift_template_id is not null;

  -- In local/dev environments where demo/test patterns exist, clean them up safely
  if pattern_count > 0 or shift_with_pattern_count > 0 then
    -- nullify pattern reference or remove test patterns
    update public.staff_shifts set shift_pattern_id = null where shift_pattern_id is not null;
    delete from public.staff_shift_patterns;
  end if;

  if template_count > 0 or shift_with_template_count > 0 then
    update public.staff_shifts set shift_template_id = null where shift_template_id is not null;
    delete from public.shift_templates;
  end if;
end $$;

-- 4. Evolution of public.staff_shifts
alter table public.staff_shifts
  add column if not exists shift_slot text,
  add column if not exists creation_group_id uuid,
  add column if not exists cancellation_reason text;

-- Backfill shift_slot for any existing active/historical shifts
update public.staff_shifts
set shift_slot = case
  when start_time < '12:00'::time then 'MORNING'
  else 'AFTERNOON'
end
where shift_slot is null;

-- Normalize start/end times if any historical seed data was slightly off 00/30 grid
update public.staff_shifts
set
  start_time = case
    when shift_slot = 'MORNING' and (start_time < '07:00'::time or start_time > '10:30'::time) then '07:00'::time
    when shift_slot = 'AFTERNOON' and (start_time < '13:00'::time or start_time > '15:30'::time) then '13:00'::time
    else start_time
  end,
  end_time = case
    when shift_slot = 'MORNING' and (end_time <= '07:00'::time or end_time > '11:00'::time) then '11:00'::time
    when shift_slot = 'AFTERNOON' and (end_time <= '13:00'::time or end_time > '16:00'::time) then '16:00'::time
    else end_time
  end
where shift_slot in ('MORNING', 'AFTERNOON');

alter table public.staff_shifts
  alter column shift_slot set not null;

-- Drop legacy constraints and triggers on staff_shifts
alter table public.staff_shifts
  drop constraint if exists staff_shifts_staff_no_overlap,
  drop constraint if exists staff_shifts_valid_time,
  drop constraint if exists staff_shifts_slot_check,
  drop constraint if exists staff_shifts_morning_time_check,
  drop constraint if exists staff_shifts_afternoon_time_check;

drop trigger if exists staff_shifts_preserve_history on public.staff_shifts;
drop trigger if exists staff_shift_pattern_operational_assignee on public.staff_shift_patterns;
drop trigger if exists staff_shift_patterns_set_updated_at on public.staff_shift_patterns;
drop trigger if exists shift_templates_set_updated_at on public.shift_templates;
drop trigger if exists staff_shift_patterns_audit on public.staff_shift_patterns;
drop trigger if exists shift_templates_audit on public.shift_templates;

-- Drop legacy indexes on staff_shifts
drop index if exists public.staff_shifts_template_idx;
drop index if exists public.staff_shifts_pattern_idx;
drop index if exists public.staff_shifts_pattern_occurrence_unique_idx;

-- Drop legacy columns on staff_shifts
alter table public.staff_shifts
  drop column if exists shift_template_id,
  drop column if exists shift_pattern_id,
  drop column if exists shift_type,
  drop column if exists time_range;

-- Drop legacy tables
drop table if exists public.staff_shift_patterns cascade;
drop table if exists public.shift_templates cascade;

-- Drop legacy functions
drop function if exists public.register_own_shift_pattern(smallint, text, date, date, text);
drop function if exists public.cancel_own_shift_pattern(uuid);
drop function if exists public.delete_catalog_shift_template(uuid);
drop function if exists public.hard_delete_shift_pattern(uuid);
drop function if exists private.materialize_shift_pattern(uuid);
drop function if exists private.refresh_open_shift_patterns();
drop function if exists private.preserve_staff_shift_history();
drop function if exists public.register_own_shift(date, time, time, text, text, uuid);
drop function if exists public.cancel_own_shift(uuid);

-- Add V2 Constraints on public.staff_shifts
alter table public.staff_shifts
  add constraint staff_shifts_slot_check
    check (shift_slot in ('MORNING', 'AFTERNOON')),
  add constraint staff_shifts_valid_time
    check (end_time > start_time),
  add constraint staff_shifts_morning_time_check
    check (
      shift_slot <> 'MORNING' or (
        start_time >= '07:00'::time
        and start_time < end_time
        and end_time <= '11:00'::time
        and extract(minute from start_time)::integer in (0, 30)
        and extract(second from start_time)::integer = 0
        and extract(minute from end_time)::integer in (0, 30)
        and extract(second from end_time)::integer = 0
      )
    ),
  add constraint staff_shifts_afternoon_time_check
    check (
      shift_slot <> 'AFTERNOON' or (
        start_time >= '13:00'::time
        and start_time < end_time
        and end_time <= '16:00'::time
        and extract(minute from start_time)::integer in (0, 30)
        and extract(second from start_time)::integer = 0
        and extract(minute from end_time)::integer in (0, 30)
        and extract(second from end_time)::integer = 0
      )
    );

-- Partial Unique Index: only 1 active shift per (staff_id, shift_date, shift_slot)
create unique index if not exists staff_shifts_active_slot_unique_idx
  on public.staff_shifts (staff_id, shift_date, shift_slot)
  where (status <> 'cancelled');

create index if not exists staff_shifts_creation_group_idx
  on public.staff_shifts (creation_group_id)
  where creation_group_id is not null;

-- 5. Authority Helpers
create or replace function private.can_manage_shift_history(actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if actor_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.system_security_principals principals
    where principals.singleton and principals.root_admin_id = actor_id
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = actor_id
      and p.can_manage_shift_history = true
  );
end;
$$;

create or replace function private.is_eligible_shift_assignee(target_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_staff_id
      and (select private.is_operationally_assignable(p.id))
      and exists (
        select 1
        from public.user_roles r
        where r.user_id = p.id
          and r.role in ('staff', 'admin')
      )
      and exists (
        select 1
        from public.profile_room_types prt
        join public.room_types rt on rt.id = prt.room_type_id
        where prt.profile_id = p.id
          and rt.code = 'nursing_skills'
      )
  );
$$;

-- Trigger to validate staff_id on staff_shifts
create or replace function private.validate_staff_shift_operational_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_eligible_shift_assignee(new.staff_id) then
    raise exception 'ASSIGN_STAFF_NOT_ELIGIBLE: User % is not an eligible Skills Lab shift assignee', new.staff_id;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_shift_operational_assignee on public.staff_shifts;
create trigger staff_shift_operational_assignee
before insert or update of staff_id on public.staff_shifts
for each row
execute function private.validate_staff_shift_operational_assignee();

-- 6. Canonical RPCs

-- list_operational_shift_assignees
create or replace function public.list_operational_shift_assignees()
returns table (id uuid, full_name text, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_user()) then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles profiles
  where (select private.is_operationally_assignable(profiles.id))
    and exists (
      select 1 from public.user_roles roles
      where roles.user_id = profiles.id and roles.role in ('staff', 'admin')
    )
    and exists (
      select 1 from public.profile_room_types prt
      join public.room_types rt on rt.id = prt.room_type_id
      where prt.profile_id = profiles.id and rt.code = 'nursing_skills'
    )
  order by profiles.full_name;
end;
$$;

-- register_staff_shifts
create or replace function public.register_staff_shifts(
  shifts_payload jsonb,
  adjustment_reason text default null
)
returns setof public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  is_admin boolean;
  can_history boolean;
  business_today date;
  row_elem jsonb;
  target_staff_id uuid;
  target_date date;
  target_slot text;
  target_start time;
  target_end time;
  target_note text;
  target_group_id uuid;
  assigned_source public.shift_registration_source;
  created_row public.staff_shifts;
  results public.staff_shifts[];
  seen_keys text[] := '{}';
  row_key text;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED: Authentication is required';
  end if;

  is_admin := private.is_admin();
  can_history := private.can_manage_shift_history(actor_id);
  business_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  if shifts_payload is null or jsonb_array_length(shifts_payload) = 0 then
    raise exception 'INVALID_PAYLOAD: Shift payload must be a non-empty array';
  end if;

  -- Phase 1: Validate all rows in payload
  for row_elem in select * from jsonb_array_elements(shifts_payload) loop
    target_staff_id := (row_elem->>'staff_id')::uuid;
    target_date := (row_elem->>'shift_date')::date;
    target_slot := upper(btrim(coalesce(row_elem->>'shift_slot', '')));
    target_start := (row_elem->>'start_time')::time;
    target_end := (row_elem->>'end_time')::time;
    target_note := nullif(btrim(coalesce(row_elem->>'note', '')), '');
    target_group_id := (row_elem->>'creation_group_id')::uuid;

    if target_staff_id is null then
      raise exception 'INVALID_STAFF_ID: staff_id is required';
    end if;

    if target_date is null then
      raise exception 'INVALID_SHIFT_DATE: shift_date is required';
    end if;

    if target_slot not in ('MORNING', 'AFTERNOON') then
      raise exception 'INVALID_SHIFT_SLOT: shift_slot must be MORNING or AFTERNOON';
    end if;

    if target_start is null or target_end is null or target_start >= target_end then
      raise exception 'INVALID_TIME_RANGE: start_time must be earlier than end_time';
    end if;

    -- Slot-specific time rules
    if target_slot = 'MORNING' then
      if target_start < '07:00'::time or target_end > '11:00'::time or
         extract(minute from target_start)::integer not in (0, 30) or extract(second from target_start)::integer <> 0 or
         extract(minute from target_end)::integer not in (0, 30) or extract(second from target_end)::integer <> 0 then
        raise exception 'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid';
      end if;
    elsif target_slot = 'AFTERNOON' then
      if target_start < '13:00'::time or target_end > '16:00'::time or
         extract(minute from target_start)::integer not in (0, 30) or extract(second from target_start)::integer <> 0 or
         extract(minute from target_end)::integer not in (0, 30) or extract(second from target_end)::integer <> 0 then
        raise exception 'INVALID_AFTERNOON_TIME: Afternoon shift must be within 13:00-16:00 on 30-minute grid';
      end if;
    end if;

    -- Assignee eligibility
    if not private.is_eligible_shift_assignee(target_staff_id) then
      raise exception 'ASSIGNEE_NOT_ELIGIBLE: User % is not eligible for Skills Lab shifts', target_staff_id;
    end if;

    -- Authority check
    if target_staff_id <> actor_id and not is_admin then
      raise exception 'PERMISSION_DENIED: Staff members can only register shifts for themselves';
    end if;

    -- Non-Skills admin cannot register
    if not is_admin and not private.is_eligible_shift_assignee(actor_id) then
      raise exception 'PERMISSION_DENIED: User lacks Skills Lab operational scope';
    end if;

    -- Temporal policy
    if target_date < business_today then
      if not can_history then
        raise exception 'HISTORICAL_MUTATION_FORBIDDEN: Historical shifts require history management capability';
      end if;
      if adjustment_reason is null or btrim(adjustment_reason) = '' then
        raise exception 'HISTORICAL_REASON_REQUIRED: Reason is required for historical shift mutations';
      end if;
    end if;

    -- Intra-payload duplicate check
    row_key := target_staff_id::text || ':' || target_date::text || ':' || target_slot;
    if row_key = any(seen_keys) then
      raise exception 'DUPLICATE_PAYLOAD_SLOT: Multiple entries for staff % on % slot % in the same request', target_staff_id, target_date, target_slot;
    end if;
    seen_keys := array_append(seen_keys, row_key);

    -- Database active slot conflict check
    if exists (
      select 1
      from public.staff_shifts s
      where s.staff_id = target_staff_id
        and s.shift_date = target_date
        and s.shift_slot = target_slot
        and s.status <> 'cancelled'
    ) then
      raise exception 'ACTIVE_SHIFT_EXISTS: Staff % already has an active % shift on %', target_staff_id, target_slot, target_date;
    end if;
  end loop;

  -- Phase 2: Insert rows atomically
  for row_elem in select * from jsonb_array_elements(shifts_payload) loop
    target_staff_id := (row_elem->>'staff_id')::uuid;
    target_date := (row_elem->>'shift_date')::date;
    target_slot := upper(btrim(coalesce(row_elem->>'shift_slot', '')));
    target_start := (row_elem->>'start_time')::time;
    target_end := (row_elem->>'end_time')::time;
    target_note := nullif(btrim(coalesce(row_elem->>'note', '')), '');
    target_group_id := (row_elem->>'creation_group_id')::uuid;

    assigned_source := case
      when target_staff_id = actor_id and not is_admin then 'self_registered'::public.shift_registration_source
      else 'admin_assigned'::public.shift_registration_source
    end;

    insert into public.staff_shifts (
      staff_id,
      shift_date,
      shift_slot,
      start_time,
      end_time,
      note,
      status,
      registration_source,
      creation_group_id,
      created_by
    ) values (
      target_staff_id,
      target_date,
      target_slot,
      target_start,
      target_end,
      target_note,
      'scheduled',
      assigned_source,
      target_group_id,
      actor_id
    ) returning * into created_row;

    -- Audit log if historical
    if target_date < business_today then
      insert into public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        new_data,
        metadata
      ) values (
        actor_id,
        'create_historical_shift',
        'staff_shifts',
        created_row.id,
        to_jsonb(created_row),
        jsonb_build_object('reason', adjustment_reason)
      );
    end if;

    return next created_row;
  end loop;
end;
$$;

-- cancel_staff_shift
create or replace function public.cancel_staff_shift(
  target_shift_id uuid,
  reason text default null
)
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  is_admin boolean;
  can_history boolean;
  business_today date;
  target_shift public.staff_shifts;
  cancelled_row public.staff_shifts;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED: Authentication is required';
  end if;

  is_admin := private.is_admin();
  can_history := private.can_manage_shift_history(actor_id);
  business_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  select * into target_shift
  from public.staff_shifts
  where id = target_shift_id
  for update;

  if target_shift.id is null then
    raise exception 'SHIFT_NOT_FOUND: Staff shift % not found', target_shift_id;
  end if;

  if target_shift.status = 'cancelled' then
    return target_shift;
  end if;

  -- Authority check
  if target_shift.staff_id <> actor_id and not is_admin then
    raise exception 'PERMISSION_DENIED: Staff members can only cancel their own shifts';
  end if;

  -- Temporal check
  if target_shift.shift_date < business_today then
    if not can_history then
      raise exception 'HISTORICAL_MUTATION_FORBIDDEN: Historical cancellation requires history capability';
    end if;
    if reason is null or btrim(reason) = '' then
      raise exception 'HISTORICAL_REASON_REQUIRED: Reason is required for historical shift cancellation';
    end if;
  end if;

  update public.staff_shifts
  set
    status = 'cancelled',
    cancelled_by = actor_id,
    cancelled_at = now(),
    cancellation_reason = nullif(btrim(coalesce(reason, '')), ''),
    updated_at = now()
  where id = target_shift_id
  returning * into cancelled_row;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  ) values (
    actor_id,
    case when target_shift.shift_date < business_today then 'cancel_historical_shift' else 'cancel_shift' end,
    'staff_shifts',
    cancelled_row.id,
    to_jsonb(target_shift),
    to_jsonb(cancelled_row),
    jsonb_build_object('reason', reason)
  );

  return cancelled_row;
end;
$$;

-- update_staff_shift_time
create or replace function public.update_staff_shift_time(
  target_shift_id uuid,
  target_start_time time,
  target_end_time time,
  target_note text default null,
  reason text default null
)
returns public.staff_shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  is_admin boolean;
  can_history boolean;
  business_today date;
  target_shift public.staff_shifts;
  updated_row public.staff_shifts;
begin
  if actor_id is null then
    raise exception 'AUTH_REQUIRED: Authentication is required';
  end if;

  is_admin := private.is_admin();
  can_history := private.can_manage_shift_history(actor_id);
  business_today := (now() at time zone 'Asia/Ho_Chi_Minh')::date;

  select * into target_shift
  from public.staff_shifts
  where id = target_shift_id
  for update;

  if target_shift.id is null then
    raise exception 'SHIFT_NOT_FOUND: Staff shift % not found', target_shift_id;
  end if;

  if target_shift.status = 'cancelled' then
    raise exception 'SHIFT_CANCELLED: Cannot edit a cancelled shift';
  end if;

  -- Authority check
  if target_shift.staff_id <> actor_id and not is_admin then
    raise exception 'PERMISSION_DENIED: Staff members can only edit their own shifts';
  end if;

  -- Temporal check
  if target_shift.shift_date < business_today then
    if not can_history then
      raise exception 'HISTORICAL_MUTATION_FORBIDDEN: Historical shift edit requires history capability';
    end if;
    if reason is null or btrim(reason) = '' then
      raise exception 'HISTORICAL_REASON_REQUIRED: Reason is required for historical shift edit';
    end if;
  end if;

  if target_start_time is null or target_end_time is null or target_start_time >= target_end_time then
    raise exception 'INVALID_TIME_RANGE: start_time must be earlier than end_time';
  end if;

  -- Slot rule enforcement
  if target_shift.shift_slot = 'MORNING' then
    if target_start_time < '07:00'::time or target_end_time > '11:00'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0 then
      raise exception 'INVALID_MORNING_TIME: Morning shift must be within 07:00-11:00 on 30-minute grid';
    end if;
  elsif target_shift.shift_slot = 'AFTERNOON' then
    if target_start_time < '13:00'::time or target_end_time > '16:00'::time or
       extract(minute from target_start_time)::integer not in (0, 30) or extract(second from target_start_time)::integer <> 0 or
       extract(minute from target_end_time)::integer not in (0, 30) or extract(second from target_end_time)::integer <> 0 then
      raise exception 'INVALID_AFTERNOON_TIME: Afternoon shift must be within 13:00-16:00 on 30-minute grid';
    end if;
  end if;

  update public.staff_shifts
  set
    start_time = target_start_time,
    end_time = target_end_time,
    note = nullif(btrim(coalesce(target_note, '')), ''),
    updated_at = now()
  where id = target_shift_id
  returning * into updated_row;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  ) values (
    actor_id,
    case when target_shift.shift_date < business_today then 'update_historical_shift_time' else 'update_shift_time' end,
    'staff_shifts',
    updated_row.id,
    to_jsonb(target_shift),
    to_jsonb(updated_row),
    jsonb_build_object('reason', reason)
  );

  return updated_row;
end;
$$;

-- 7. Permissions & Grants
grant execute on function public.list_operational_shift_assignees() to authenticated;
grant execute on function public.register_staff_shifts(jsonb, text) to authenticated;
grant execute on function public.cancel_staff_shift(uuid, text) to authenticated;
grant execute on function public.update_staff_shift_time(uuid, time, time, text, text) to authenticated;

revoke execute on function public.list_operational_shift_assignees() from anon, public;
revoke execute on function public.register_staff_shifts(jsonb, text) from anon, public;
revoke execute on function public.cancel_staff_shift(uuid, text) from anon, public;
revoke execute on function public.update_staff_shift_time(uuid, time, time, text, text) from anon, public;

-- Enable RLS and establish policies
alter table public.staff_shifts enable row level security;

drop policy if exists staff_shifts_select on public.staff_shifts;
drop policy if exists staff_shifts_admin_all on public.staff_shifts;
drop policy if exists staff_shifts_staff_manage_own on public.staff_shifts;

create policy staff_shifts_select on public.staff_shifts
for select to authenticated
using (true);

create policy staff_shifts_admin_all on public.staff_shifts
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy staff_shifts_staff_manage_own on public.staff_shifts
for all to authenticated
using (staff_id = (select auth.uid()))
with check (staff_id = (select auth.uid()));

grant select, insert, update on public.staff_shifts to authenticated;
grant all on public.staff_shifts to service_role;
grant select on public.staff_shifts to anon;
revoke delete on public.staff_shifts from authenticated;
