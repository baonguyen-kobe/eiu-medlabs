-- Add semester column to public.class_schedules
alter table public.class_schedules
  add column if not exists semester text;

alter table public.class_schedules
  drop constraint if exists class_schedules_semester_check;

alter table public.class_schedules
  add constraint class_schedules_semester_check
  check (semester is null or semester in ('HK1', 'HK2', 'HK3', 'HK4'));

-- Drop old 9-argument overload
drop function if exists public.create_manual_class_schedule(
  uuid, uuid, uuid, uuid, date, time, time, text, integer
);

-- Update create_manual_class_schedule with required target_semester
create or replace function public.create_manual_class_schedule(
  target_course_id uuid,
  target_room_id uuid,
  target_lecturer_id uuid,
  target_lecturer_2_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_note text,
  target_student_count integer,
  target_semester text
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

  if target_semester is null or target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
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
    source, schedule_status, note, student_count, semester, created_by, published_by, published_at
  ) values (
    target_course_id, course_code_val, course_name_val, target_room_id,
    target_lecturer_id, target_lecturer_2_id, target_schedule_date, target_start_time, target_end_time,
    'manual', 'published', target_note, target_student_count, target_semester, actor_id, actor_id, clock_timestamp()
  ) returning * into created_row;

  return created_row;
end;
$$;

revoke all on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer,text) from public, anon;
grant execute on function public.create_manual_class_schedule(uuid,uuid,uuid,uuid,date,time,time,text,integer,text) to authenticated;

-- Drop old 18-argument overload of create_import_schedule_row
drop function if exists public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text, integer
);

-- Update create_import_schedule_row with target_semester
create or replace function public.create_import_schedule_row(
  target_batch_id uuid,target_row_number integer,target_hash text,target_raw jsonb,
  target_normalized jsonb,target_status public.import_row_status,target_errors jsonb,
  target_warnings jsonb,target_course_id uuid,target_course_code text,target_course_name text,
  target_room_id uuid,target_lecturer_id uuid,target_date date,target_start time,target_end time,
  target_note text,target_student_count integer,target_semester text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  batch_room_type_id uuid;
  selected_room_type_id uuid;
  canonical_hash text;
  nursing_skills_room_type_id constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if target_status not in ('imported','warning') then raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode='22023'; end if;
  if target_student_count is null or target_student_count<1 then raise exception 'INVALID_STUDENT_COUNT' using errcode='22023'; end if;
  if target_date is null or target_start is null or target_end is null or target_end<=target_start then
    raise exception 'INVALID_IMPORT_SCHEDULE' using errcode='22023';
  end if;
  select batches.room_type_id into batch_room_type_id from public.import_batches batches
  where batches.id=target_batch_id and batches.created_by=caller_id and batches.status='importing';
  if batch_room_type_id is null then raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode='42501'; end if;
  if not (select private.can_import_schedules(batch_room_type_id)) then
    raise exception 'IMPORT_PERMISSION_REQUIRED' using errcode='42501';
  end if;
  if batch_room_type_id = nursing_skills_room_type_id then
    if target_semester is null or target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
      raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode='22023';
    end if;
  elsif target_semester is not null and target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode='22023';
  end if;
  select rooms.room_type_id into selected_room_type_id from public.rooms rooms where rooms.id=target_room_id;
  if selected_room_type_id is null or selected_room_type_id<>batch_room_type_id
    or not (select private.has_room_type(selected_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode='42501';
  end if;
  if target_lecturer_id is not null and not (
    (select private.profile_has_room_type(target_lecturer_id,selected_room_type_id))
    and exists (select 1 from public.user_roles roles where roles.user_id=target_lecturer_id and roles.role='lecturer')
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode='42501'; end if;
  canonical_hash:=private.import_schedule_hash(target_course_code,target_room_id,target_date,target_start,target_end);
  if target_hash is distinct from canonical_hash then raise exception 'INVALID_IMPORT_HASH' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(canonical_hash,0));
  if exists (
    select 1 from public.class_schedules schedules where schedules.schedule_status<>'cancelled'
      and schedules.room_id=target_room_id and schedules.schedule_date=target_date
      and schedules.start_time=target_start and schedules.end_time=target_end
      and upper(btrim(schedules.course_code_snapshot))=upper(btrim(target_course_code))
  ) then raise exception 'IMPORT_ROW_DUPLICATE' using errcode='23505'; end if;
  insert into public.class_schedules(
    course_id,course_code_snapshot,course_name_snapshot,room_id,lecturer_id,class_code,
    schedule_date,start_time,end_time,source,source_row_id,import_batch_id,schedule_status,note,
    student_count,semester,created_by,published_by,published_at
  ) values (
    target_course_id,target_course_code,target_course_name,target_room_id,target_lecturer_id,null,
    target_date,target_start,target_end,'import',null,target_batch_id,'published',target_note,
    target_student_count,target_semester,caller_id,caller_id,now()
  ) returning id into schedule_id;
  insert into public.import_rows(
    import_batch_id,row_number,source_row_id,normalized_row_hash,raw_data,normalized_data,
    validation_status,errors,warnings,class_schedule_id
  ) values (
    target_batch_id,target_row_number,null,canonical_hash,coalesce(target_raw,'{}'::jsonb),
    coalesce(target_normalized,'{}'::jsonb),target_status,coalesce(target_errors,'[]'::jsonb),
    coalesce(target_warnings,'[]'::jsonb),schedule_id
  );
  return schedule_id;
exception when exclusion_violation then raise exception 'SCHEDULE_CONFLICT' using errcode='23P01';
end;
$$;

revoke all on function public.create_import_schedule_row(uuid,integer,text,jsonb,jsonb,public.import_row_status,jsonb,jsonb,uuid,text,text,uuid,uuid,date,time,time,text,integer,text) from public, anon;
grant execute on function public.create_import_schedule_row(uuid,integer,text,jsonb,jsonb,public.import_row_status,jsonb,jsonb,uuid,text,text,uuid,uuid,date,time,time,text,integer,text) to authenticated;
