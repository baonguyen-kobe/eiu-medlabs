alter table public.courses
  add column if not exists room_type_id uuid references public.room_types(id) on delete restrict;

update public.courses as courses
set room_type_id = coalesce(
  (
    select rooms.room_type_id
    from public.class_schedules as schedules
    join public.rooms as rooms on rooms.id = schedules.room_id
    where schedules.course_id = courses.id
    group by rooms.room_type_id
    order by count(*) desc, rooms.room_type_id
    limit 1
  ),
  (
    select rooms.room_type_id
    from public.basic_medical_registrations as registrations
    join public.rooms as rooms on rooms.id = registrations.room_id
    where registrations.course_id = courses.id
    group by rooms.room_type_id
    order by count(*) desc, rooms.room_type_id
    limit 1
  ),
  '40000000-0000-0000-0000-000000000001'::uuid
)
where courses.room_type_id is null;

alter table public.courses
  alter column room_type_id set default '40000000-0000-0000-0000-000000000001'::uuid,
  alter column room_type_id set not null;

create index if not exists courses_room_type_id_idx
  on public.courses (room_type_id, is_active, course_name);
