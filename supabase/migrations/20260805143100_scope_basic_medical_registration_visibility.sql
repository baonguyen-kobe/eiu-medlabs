drop policy if exists basic_medical_registrations_select
on public.basic_medical_registrations;

create policy basic_medical_registrations_select
on public.basic_medical_registrations
for select
to authenticated
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
      )
    )
  )
);
