-- Skills manual scheduling is a dedicated workflow. Basic Medical schedules
-- remain owned by save_basic_medical_registration and must not use this RPC.
create or replace function public.create_manual_class_schedule(
  target_course_id uuid,
  target_room_id uuid,
  target_lecturer_id uuid,
  target_lecturer_2_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_note text,
  target_student_count integer
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  created_row public.class_schedules;
  course_code_val text;
  course_name_val text;
  course_room_type_id uuid;
  room_room_type_id uuid;
  nursing_skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select courses.course_code, courses.course_name, courses.room_type_id
  into course_code_val, course_name_val, course_room_type_id
  from public.courses as courses
  where courses.id = target_course_id
    and courses.is_active;

  if course_room_type_id is distinct from nursing_skills_room_type_id then
    raise exception 'SKILLS_MANUAL_SCHEDULE_REQUIRED' using errcode = '42501';
  end if;

  select rooms.room_type_id
  into room_room_type_id
  from public.rooms as rooms
  where rooms.id = target_room_id
    and rooms.is_active;

  if room_room_type_id is distinct from nursing_skills_room_type_id then
    raise exception 'SKILLS_MANUAL_SCHEDULE_REQUIRED' using errcode = '42501';
  end if;

  if not (select private.has_room_type(course_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  if not (select private.can_create_manual_schedule_for(
    target_room_id,
    array_remove(
      array[target_lecturer_id, target_lecturer_2_id]::uuid[],
      null
    )
  )) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id,
    lecturer_id, lecturer_2_id, schedule_date, start_time, end_time,
    source, schedule_status, note, student_count, created_by, published_by, published_at
  ) values (
    target_course_id, course_code_val, course_name_val, target_room_id,
    target_lecturer_id, target_lecturer_2_id, target_schedule_date, target_start_time, target_end_time,
    'manual', 'published', target_note, target_student_count, actor_id, actor_id, clock_timestamp()
  ) returning * into created_row;

  return created_row;
end;
$$;
revoke all on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer) from public, anon;
grant execute on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer) to authenticated;
