create or replace function public.hook_only_precreated_personnel(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce((event -> 'user' -> 'app_metadata' ->> 'preapproved')::boolean, false) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Email chưa được tạo trong danh sách Nhân sự.'
    )
  );
end;
$$;

revoke execute on function public.hook_only_precreated_personnel(jsonb)
from public, anon, authenticated;
grant execute on function public.hook_only_precreated_personnel(jsonb)
to supabase_auth_admin;
