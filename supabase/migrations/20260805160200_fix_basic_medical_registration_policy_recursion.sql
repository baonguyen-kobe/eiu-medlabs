create or replace function private.is_basic_medical_teaching_lecturer(
  target_registration_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.basic_medical_registration_sessions as sessions
    where sessions.registration_id = target_registration_id
      and sessions.teaching_lecturer_id = target_user_id
  );
$$;

revoke all on function private.is_basic_medical_teaching_lecturer(uuid, uuid)
from public, anon;
grant execute on function private.is_basic_medical_teaching_lecturer(uuid, uuid)
to authenticated, service_role;

drop policy if exists basic_medical_registrations_select
on public.basic_medical_registrations;

create policy basic_medical_registrations_select
on public.basic_medical_registrations for select to authenticated
using (
  (select private.is_active_user())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      (
        select private.has_room_type(
          '40000000-0000-0000-0000-000000000002'::uuid
        )
      )
      and (
        created_by = (select auth.uid())
        or registrant_id = (select auth.uid())
        or responsible_lecturer_id = (select auth.uid())
        or (select private.has_role('viewer'))
        or (
          select private.is_basic_medical_teaching_lecturer(
            basic_medical_registrations.id,
            (select auth.uid())
          )
        )
      )
    )
  )
);
