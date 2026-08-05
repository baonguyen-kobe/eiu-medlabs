-- Expose the limited people directory through an explicitly authorized RPC.
-- A SECURITY DEFINER view bypasses callers' RLS and is flagged by the database advisor.

drop view if exists public.active_people;

create or replace function public.list_active_people()
returns table (id uuid, full_name text, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_active_user()) then
    raise exception 'Tài khoản không hoạt động hoặc không có quyền truy cập.'
      using errcode = '42501';
  end if;

  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles as profiles
  where profiles.is_active = true
  order by profiles.full_name;
end;
$$;

revoke all on function public.list_active_people() from public, anon;
grant execute on function public.list_active_people() to authenticated;

-- The broad admin policy overlapped every operation with the specialized policies.
-- Keep the same admin update authority while allowing select/insert/delete to use
-- their existing role-aware policies.
drop policy if exists class_schedules_admin_all on public.class_schedules;
drop policy if exists class_schedules_admin_update on public.class_schedules;
create policy class_schedules_admin_update on public.class_schedules
for update to authenticated
using ((select private.has_role('admin')))
with check ((select private.has_role('admin')));
