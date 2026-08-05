drop policy if exists class_schedules_scoped_delete on public.class_schedules;
create policy class_schedules_scoped_delete on public.class_schedules
for delete to authenticated
using (
  (select private.can_manage_class_room(room_id))
  or (
    (select private.has_role('lecturer'))
    and created_by = (select auth.uid())
    and schedule_status <> 'cancelled'
    and (select private.can_access_room(room_id))
    and exists (
      select 1
      from public.rooms as lecturer_room
      where lecturer_room.id = room_id
        and lecturer_room.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
    )
  )
);
