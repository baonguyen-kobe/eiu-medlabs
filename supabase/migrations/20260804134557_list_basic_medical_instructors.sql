create or replace function public.list_basic_medical_instructors()
returns table (id uuid, full_name text, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if not (select private.has_room_type(basic_medical_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select profiles.id, profiles.full_name, profiles.title
  from public.profiles as profiles
  where profiles.is_active
    and lower(btrim(coalesce(profiles.title, ''))) = 'giảng viên'
    and exists (
      select 1 from public.profile_room_types as assignments
      where assignments.profile_id = profiles.id
        and assignments.room_type_id = basic_medical_room_type_id
    )
  order by profiles.full_name;
end;
$$;

revoke all on function public.list_basic_medical_instructors() from public, anon;
grant execute on function public.list_basic_medical_instructors() to authenticated;
