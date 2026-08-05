drop policy if exists class_schedules_scoped_insert on public.class_schedules;
create policy class_schedules_scoped_insert on public.class_schedules
for insert to authenticated
with check (
  (
    (select private.can_manage_class_room(room_id))
    or (
      (select private.has_role('lecturer'))
      and (select private.can_access_room(room_id))
      and exists (
        select 1 from public.rooms as lecturer_room
        where lecturer_room.id = room_id
          and lecturer_room.room_type_id = '40000000-0000-0000-0000-000000000001'::uuid
      )
    )
  )
  and created_by = (select auth.uid())
  and schedule_status = 'published'
  and published_by = (select auth.uid())
  and published_at is not null
  and cancelled_at is null
  and cancelled_by is null
  and student_count >= 1
  and (
    lecturer_id is null
    or exists (
      select 1 from public.rooms as selected_room
      where selected_room.id = room_id
        and (select private.profile_has_room_type(lecturer_id, selected_room.room_type_id))
        and exists (
          select 1 from public.user_roles as lecturer_role
          where lecturer_role.user_id = lecturer_id and lecturer_role.role = 'lecturer'
        )
    )
  )
  and (
    lecturer_2_id is null
    or exists (
      select 1 from public.rooms as selected_room
      where selected_room.id = room_id
        and (select private.profile_has_room_type(lecturer_2_id, selected_room.room_type_id))
        and exists (
          select 1 from public.user_roles as lecturer_role
          where lecturer_role.user_id = lecturer_2_id and lecturer_role.role = 'lecturer'
        )
    )
  )
);
