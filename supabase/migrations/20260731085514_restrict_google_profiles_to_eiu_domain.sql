create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case
      when coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
        then lower(coalesce(new.email, '')) like '%@eiu.edu.vn'
      else true
    end
  );
  return new;
end;
$$;

update public.profiles as profile
set is_active = false,
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id
  and coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'google'
  and lower(coalesce(auth_user.email, '')) not like '%@eiu.edu.vn';
