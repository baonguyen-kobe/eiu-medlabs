create or replace view public.basic_medical_registration_list
with (security_invoker = true)
as
select registrations.id,
       registrations.created_at,
       registrations.start_date,
       registrations.end_date,
       registrations.academic_year,
       registrations.semester,
       registrations.student_count,
       courses.course_code,
       courses.course_name,
       rooms.room_code,
       rooms.building_code,
       rooms.room_name,
       registrants.full_name as registrant_name,
       responsible.full_name as responsible_name,
       completion.session_count,
       completion.confirmed_session_count,
       completion.is_completed,
       concat_ws(
         ' ', courses.course_code, courses.course_name,
         rooms.room_code, rooms.building_code, rooms.room_name,
         registrants.full_name, responsible.full_name
       ) as search_text
from public.basic_medical_registrations as registrations
join public.courses on courses.id = registrations.course_id
join public.rooms on rooms.id = registrations.room_id
join public.profiles as registrants on registrants.id = registrations.registrant_id
join public.profiles as responsible on responsible.id = registrations.responsible_lecturer_id
join public.basic_medical_registration_completion as completion
  on completion.registration_id = registrations.id;

grant select on public.basic_medical_registration_list to authenticated, service_role;
