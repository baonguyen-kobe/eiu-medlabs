drop trigger if exists class_schedules_email_outbox on public.class_schedules;
create trigger class_schedules_email_outbox
after insert on public.class_schedules
for each row
when (new.basic_medical_registration_id is null)
execute function private.enqueue_manual_schedule_email();

create or replace function public.save_basic_medical_registration(
  target_registration_id uuid,
  target_academic_year text,
  target_semester text,
  target_start_date date,
  target_end_date date,
  target_course_id uuid,
  target_room_id uuid,
  target_student_count integer,
  target_responsible_lecturer_id uuid,
  target_note text,
  target_sessions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  registration_id_value uuid;
  registration_owner_id uuid;
  course_code_value text;
  course_name_value text;
  session_row record;
  session_number_value integer := 0;
  schedule_id_value uuid;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
begin
  if actor_id is null
    or not (select private.is_active_user())
    or not exists (
      select 1 from public.user_roles as roles
      where roles.user_id = actor_id
        and roles.role in ('admin', 'staff', 'importer')
    )
    or not (select private.has_room_type(basic_medical_room_type_id)) then
    raise exception 'Bạn không có quyền lưu phiếu Y cơ sở.' using errcode = '42501';
  end if;

  if target_academic_year !~ '^\d{4}-\d{4}$'
    or substring(target_academic_year from 6 for 4)::integer
      <> substring(target_academic_year from 1 for 4)::integer + 1 then
    raise exception 'Năm học phải gồm hai năm liên tiếp, ví dụ 2026-2027.' using errcode = '22023';
  end if;
  if target_semester not in ('HK1', 'HK2', 'HK3', 'HK4') then
    raise exception 'Học kỳ không hợp lệ.' using errcode = '22023';
  end if;
  if target_start_date is null or target_end_date is null or target_end_date < target_start_date then
    raise exception 'Khoảng ngày đăng ký không hợp lệ.' using errcode = '22023';
  end if;
  if target_student_count is null or target_student_count < 1 then
    raise exception 'Số lượng sinh viên phải là số nguyên dương.' using errcode = '22023';
  end if;
  if target_sessions is null
    or jsonb_typeof(target_sessions) <> 'array'
    or jsonb_array_length(target_sessions) < 1
    or jsonb_array_length(target_sessions) > 500 then
    raise exception 'Danh sách buổi học phải có từ 1 đến 500 buổi.' using errcode = '22023';
  end if;

  select courses.course_code, courses.course_name
  into course_code_value, course_name_value
  from public.courses as courses
  where courses.id = target_course_id
    and courses.is_active
    and courses.room_type_id = basic_medical_room_type_id;
  if course_code_value is null then
    raise exception 'Môn học Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rooms as rooms
    where rooms.id = target_room_id
      and rooms.is_active
      and rooms.room_type_id = basic_medical_room_type_id
  ) then
    raise exception 'Phòng Y cơ sở không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles as profiles
    where profiles.id = target_responsible_lecturer_id
      and profiles.is_active
      and lower(btrim(coalesce(profiles.title, ''))) = 'giảng viên'
      and exists (
        select 1 from public.profile_room_types as assignments
        where assignments.profile_id = profiles.id
          and assignments.room_type_id = basic_medical_room_type_id
      )
  ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(target_sessions) as session(
      schedule_date date,
      start_time time,
      end_time time,
      lesson_title text,
      teaching_lecturer_id uuid
    )
    left join public.profiles as profiles on profiles.id = session.teaching_lecturer_id
    where session.schedule_date is null
      or session.schedule_date < target_start_date
      or session.schedule_date > target_end_date
      or session.start_time is null
      or session.start_time < time '07:00'
      or session.end_time is null
      or session.end_time > time '21:00'
      or session.end_time <= session.start_time
      or nullif(btrim(session.lesson_title), '') is null
      or profiles.id is null
      or not profiles.is_active
      or lower(btrim(coalesce(profiles.title, ''))) <> 'giảng viên'
      or not exists (
        select 1 from public.profile_room_types as assignments
        where assignments.profile_id = profiles.id
          and assignments.room_type_id = basic_medical_room_type_id
      )
  ) then
    raise exception 'Danh sách buổi học có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  if target_registration_id is null then
    insert into public.basic_medical_registrations (
      academic_year, semester, start_date, end_date, course_id, room_id,
      student_count, registrant_id, responsible_lecturer_id, note, created_by
    ) values (
      target_academic_year, target_semester, target_start_date, target_end_date,
      target_course_id, target_room_id, target_student_count, actor_id,
      target_responsible_lecturer_id, nullif(btrim(target_note), ''), actor_id
    ) returning id, created_by into registration_id_value, registration_owner_id;
  else
    select registrations.created_by
    into registration_owner_id
    from public.basic_medical_registrations as registrations
    where registrations.id = target_registration_id
    for update;

    if registration_owner_id is null then
      raise exception 'Không tìm thấy phiếu Y cơ sở.' using errcode = 'P0002';
    end if;
    if registration_owner_id <> actor_id
      and not (select private.has_role('admin'))
      and not (select private.has_role('staff')) then
      raise exception 'Bạn không có quyền điều chỉnh phiếu Y cơ sở.' using errcode = '42501';
    end if;

    update public.basic_medical_registrations
    set academic_year = target_academic_year,
        semester = target_semester,
        start_date = target_start_date,
        end_date = target_end_date,
        course_id = target_course_id,
        room_id = target_room_id,
        student_count = target_student_count,
        responsible_lecturer_id = target_responsible_lecturer_id,
        note = nullif(btrim(target_note), '')
    where id = target_registration_id;

    delete from public.class_schedules
    where basic_medical_registration_id = target_registration_id;
    registration_id_value := target_registration_id;
  end if;

  for session_row in
    select session.*
    from jsonb_to_recordset(target_sessions) as session(
      schedule_date date,
      start_time time,
      end_time time,
      lesson_title text,
      teaching_lecturer_id uuid
    )
  loop
    session_number_value := session_number_value + 1;
    insert into public.class_schedules (
      course_id, course_code_snapshot, course_name_snapshot, room_id,
      lecturer_id, lecturer_2_id, schedule_date, start_time, end_time,
      source, schedule_status, note, student_count, created_by,
      published_by, published_at, basic_medical_registration_id
    ) values (
      target_course_id, course_code_value, course_name_value, target_room_id,
      session_row.teaching_lecturer_id, null, session_row.schedule_date,
      session_row.start_time, session_row.end_time, 'manual', 'published',
      nullif(btrim(target_note), ''), target_student_count,
      registration_owner_id, actor_id, now(), registration_id_value
    ) returning id into schedule_id_value;

    insert into public.basic_medical_registration_sessions (
      registration_id, class_schedule_id, lesson_title,
      teaching_lecturer_id, session_number
    ) values (
      registration_id_value, schedule_id_value,
      btrim(session_row.lesson_title), session_row.teaching_lecturer_id,
      session_number_value
    );
  end loop;

  return registration_id_value;
end;
$$;

revoke execute on function public.save_basic_medical_registration(uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb) from public, anon;
grant execute on function public.save_basic_medical_registration(uuid, text, text, date, date, uuid, uuid, integer, uuid, text, jsonb) to authenticated;
