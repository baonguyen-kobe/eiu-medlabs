-- Machine 2 Batch A (M2-01..03): Teaching Assistant role contracts.
-- Keep the authorization boundary in RPCs.  UI access is never sufficient.

-- M2-01: a scoped Teaching Assistant can create a Skills Lab manual schedule.
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
  room_type_val uuid;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select courses.course_code, courses.course_name, courses.room_type_id
  into course_code_val, course_name_val, room_type_val
  from public.courses as courses
  where courses.id = target_course_id;

  if not (select private.has_room_type(room_type_val)) then
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

-- M2-02: preserve the transactional-outbox implementation while replacing
-- the retired importer role with Teaching Assistant.  Fail closed if the
-- expected historical implementation is not present.
do $$
declare
  definition text;
  legacy_role_check constant text := 'or (select private.has_role(''importer''))';
begin
  select pg_get_functiondef(
    'public.create_equipment_request_with_items(uuid,text,uuid,timestamptz,timestamptz,text,text,jsonb)'::regprocedure
  ) into definition;

  if position(legacy_role_check in definition) = 0 then
    raise exception 'Expected legacy equipment-request role check was not found.';
  end if;

  definition := replace(
    definition,
    legacy_role_check,
    'or (select private.has_role(''teaching_assistant''))'
  );
  execute definition;
end;
$$;

-- M2-03: keep Basic Medical creation aligned with the application policy.
-- Lecturer and Teaching Assistant require the Basic Medical scope plus the
-- explicit capability flag; admin/scoped-staff management remains unchanged.
do $$
declare
  definition text;
  legacy_authorization constant text := E'  if not (select private.can_manage_basic_medical())\n    and not (select private.has_role(''teaching_assistant'')) then';
  scoped_creator_authorization constant text := E'  if actor_id is null\n    or not (select private.is_active_user())\n    or not (\n      (select private.can_manage_basic_medical())\n      or (\n        ((select private.has_role(''lecturer'')) or (select private.has_role(''teaching_assistant'')))\n        and (select private.has_room_type(''40000000-0000-0000-0000-000000000002''::uuid))\n        and exists (\n          select 1\n          from public.profiles as profiles\n          where profiles.id = actor_id\n            and profiles.allow_basic_medical_access\n        )\n      )\n    ) then';
begin
  select pg_get_functiondef(
    'public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb)'::regprocedure
  ) into definition;
  definition := replace(definition, E'\r\n', E'\n');

  if position(legacy_authorization in definition) = 0 then
    raise exception 'Expected legacy Basic Medical Teaching Assistant authorization was not found.';
  end if;

  definition := replace(definition, legacy_authorization, scoped_creator_authorization);
  execute definition;
end;
$$;
