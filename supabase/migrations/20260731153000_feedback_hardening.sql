-- Harden data visibility and enforce the campus operating windows requested by product.

drop policy if exists profiles_select_active_users on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_role('admin'))
);

create or replace view public.active_people
with (security_barrier = true)
as
select id, full_name, title
from public.profiles
where is_active = true;

revoke all on public.active_people from public, anon;
grant select on public.active_people to authenticated;

create or replace function public.list_import_lecturers()
returns table (id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.email
  from public.profiles p
  where p.is_active = true
    and exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.id
        and ur.role = 'lecturer'
    )
  order by p.full_name;
end;
$$;

create or replace function public.import_hash_exists(target_hash text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_create_schedule_entries()) then
    raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501';
  end if;

  return exists (
    select 1
    from public.import_rows ir
    where ir.normalized_row_hash = target_hash
  );
end;
$$;

revoke execute on function public.list_import_lecturers() from public, anon;
revoke execute on function public.import_hash_exists(text) from public, anon;
grant execute on function public.list_import_lecturers() to authenticated;
grant execute on function public.import_hash_exists(text) to authenticated;

alter table public.class_schedules
  add constraint class_schedules_operating_hours check (
    (start_time >= time '07:30' and end_time <= time '11:30')
    or
    (start_time >= time '12:30' and end_time <= time '16:30')
  );

drop policy if exists class_schedules_select on public.class_schedules;
create policy class_schedules_select on public.class_schedules
for select to authenticated
using (
  (select private.is_active_user())
  and (
    schedule_status = 'published'
    or (select private.has_role('admin'))
    or created_by = (select auth.uid())
    or lecturer_id = (select auth.uid())
  )
);
