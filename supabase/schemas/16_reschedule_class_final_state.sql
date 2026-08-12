create or replace function public.reschedule_class(
  target_schedule_id uuid,
  target_schedule_date date
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row public.class_schedules;
  changed_row public.class_schedules;
  room_type_value uuid;
  room_type_code_value text;
  change_id uuid := gen_random_uuid();
  room_label text;
  actor_name text;
  lecturer_name text;
  schedule_code text;
  actor_id uuid := (select auth.uid());
begin
  if target_schedule_date is null then
    raise exception 'INVALID_SCHEDULE_DATE' using errcode = '22023';
  end if;

  select schedules.* into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select rooms.room_type_id, room_types.code,
         concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_type_value, room_type_code_value, room_label
  from public.rooms as rooms
  join public.room_types as room_types on room_types.id = rooms.room_type_id
  where rooms.id = before_row.room_id;

  select profiles.full_name into actor_name
  from public.profiles as profiles where profiles.id = actor_id;

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name
  from public.profiles as profiles
  where profiles.id in (before_row.lecturer_id, before_row.lecturer_2_id);

  schedule_code := to_char(
    before_row.created_at at time zone 'Asia/Ho_Chi_Minh',
    'YYMMDDHH24MISS'
  );

  if not (select private.can_modify_class_schedule(target_schedule_id, 'reschedule')) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  if target_schedule_date is distinct from before_row.schedule_date then
    if room_type_code_value = 'basic_medical' then
      -- Preserved baseline Basic Medical notification behavior: insert directly into email_notifications with approved subject format
      insert into public.email_notifications (
        notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
      )
      select
        'class_schedule_basic_medical_updated',
        recipients.id, recipients.email,
        concat('class_schedule_basic_medical_updated:', change_id, ':', before_row.id, ':', recipients.id),
        concat('[MedLabs Calendar] Đổi ngày học Y cơ sở · ', coalesce(before_row.course_code_snapshot, '')),
        jsonb_build_object(
          'schedule_id', before_row.id,
          'course_code', before_row.course_code_snapshot,
          'course_name', before_row.course_name_snapshot,
          'old_schedule_date', before_row.schedule_date,
          'schedule_date', changed_row.schedule_date,
          'start_time', before_row.start_time,
          'end_time', before_row.end_time,
          'room', room_label,
          'student_count', before_row.student_count,
          'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
          'request_code', schedule_code,
          'actor', coalesce(actor_name, 'Người dùng hệ thống')
        )
      from public.profiles as recipients
      where recipients.is_active
        and (
          recipients.id in (before_row.lecturer_id, before_row.lecturer_2_id)
          or exists (
            select 1 from public.user_roles as roles
            where roles.user_id = recipients.id
              and roles.role in ('admin', 'staff', 'viewer')
              and (
                roles.role = 'admin'
                or exists (
                  select 1 from public.profile_room_types as assignments
                  where assignments.profile_id = recipients.id
                    and assignments.room_type_id = room_type_value
                    and (
                      roles.role <> 'viewer'
                      or assignments.receive_schedule_emails
                    )
                )
              )
          )
        )
      on conflict (dedupe_key) do nothing;
    else
      -- Skills Lab outbox event
      insert into public.email_outbox_events (
        domain,
        event_type,
        aggregate_id,
        event_key,
        payload,
        recipients,
        delivery_mode_at_event
      )
      select
        'skills_lab_schedule',
        'class_schedule_rescheduled',
        before_row.id,
        concat('skills_lab:rescheduled:', change_id, ':', before_row.id),
        jsonb_build_object(
          'schedule_id', before_row.id,
          'course_code', before_row.course_code_snapshot,
          'course_name', before_row.course_name_snapshot,
          'old_schedule_date', before_row.schedule_date,
          'schedule_date', changed_row.schedule_date,
          'start_time', before_row.start_time,
          'end_time', before_row.end_time,
          'room', room_label,
          'student_count', before_row.student_count,
          'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
          'request_code', schedule_code,
          'actor', coalesce(actor_name, 'Người dùng hệ thống'),
          'room_type_code', room_type_code_value
        ),
        (
          select coalesce(jsonb_agg(jsonb_build_object('id', recipients.id, 'email', recipients.email)), '[]'::jsonb)
          from public.profiles as recipients
          where recipients.is_active
            and (
              recipients.id in (before_row.lecturer_id, before_row.lecturer_2_id)
              or recipients.id = before_row.created_by
              or exists (
                select 1 from public.user_roles as roles
                where roles.user_id = recipients.id
                  and roles.role in ('admin', 'staff', 'viewer')
                  and (
                    roles.role = 'admin'
                    or exists (
                      select 1 from public.profile_room_types as assignments
                      where assignments.profile_id = recipients.id
                        and assignments.room_type_id = room_type_value
                        and (
                          roles.role <> 'viewer'
                          or assignments.receive_schedule_emails
                        )
                    )
                  )
              )
            )
        ),
        (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
      on conflict (event_key) do nothing;
    end if;
  end if;

  return changed_row;
end;
$$;

revoke all on function public.reschedule_class(uuid, date) from public, anon;
grant execute on function public.reschedule_class(uuid, date) to authenticated;

