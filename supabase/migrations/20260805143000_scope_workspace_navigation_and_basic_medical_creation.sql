do $migration$
declare
  function_definition text;
  old_permission_check constant text := $old$
  if actor_id is null
    or not (select private.is_active_user())
    or not exists (
      select 1 from public.user_roles as roles
      where roles.user_id = actor_id
        and roles.role in ('admin', 'staff', 'importer')
    )
    or not (select private.has_room_type(basic_medical_room_type_id)) then
$old$;
  new_permission_check constant text := $new$
  if actor_id is null
    or not (select private.is_active_user())
    or not (
      (select private.has_role('admin'))
      or (select private.has_role('staff'))
      or (
        (select private.has_room_type(basic_medical_room_type_id))
        and (
          (select private.has_role('lecturer'))
          or (select private.has_role('importer'))
        )
        and exists (
          select 1
          from public.profiles as profiles
          where profiles.id = actor_id
            and profiles.allow_basic_medical_access
        )
      )
    ) then
$new$;
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  if position(old_permission_check in function_definition) = 0 then
    raise exception 'Không tìm thấy điều kiện quyền cũ của save_basic_medical_registration.';
  end if;

  execute replace(
    function_definition,
    old_permission_check,
    new_permission_check
  );
end;
$migration$;

drop policy if exists basic_medical_registrations_manage
on public.basic_medical_registrations;

create policy basic_medical_registrations_manage
on public.basic_medical_registrations
for all
to authenticated
using (
  (select private.has_role('admin'))
  or (select private.has_role('staff'))
  or created_by = (select auth.uid())
)
with check (
  created_by = (select auth.uid())
  and (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (
      (
        (select private.has_role('lecturer'))
        or (select private.has_role('importer'))
      )
      and (
        select private.has_room_type(
          '40000000-0000-0000-0000-000000000002'::uuid
        )
      )
      and exists (
        select 1
        from public.profiles
        where profiles.id = (select auth.uid())
          and profiles.allow_basic_medical_access
      )
    )
  )
);
