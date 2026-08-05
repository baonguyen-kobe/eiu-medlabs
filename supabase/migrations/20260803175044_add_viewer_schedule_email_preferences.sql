alter table public.profile_room_types
  add column if not exists receive_schedule_emails boolean not null default false;

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
  change_id uuid := gen_random_uuid();
  room_label text;
  actor_name text;
begin
  if target_schedule_date is null then
    raise exception 'INVALID_SCHEDULE_DATE' using errcode = '22023';
  end if;

  select schedules.*
  into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  select rooms.room_type_id, concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_type_value, room_label
  from public.rooms as rooms where rooms.id = before_row.room_id;
  select profiles.full_name into actor_name
  from public.profiles as profiles where profiles.id = (select auth.uid());
  if not (select private.has_room_type(room_type_value)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if before_row.lecturer_id is null and before_row.lecturer_2_id is null then
    if not (select private.is_active_user()) then
      raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;
  elsif not (
    (select private.has_role('admin'))
    or (select private.has_role('staff'))
    or (select private.has_role('importer'))
    or (select auth.uid()) in (before_row.lecturer_id, before_row.lecturer_2_id)
  ) then
    raise exception 'CLASS_DATE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  if target_schedule_date is distinct from before_row.schedule_date then
    insert into public.email_notifications (
      notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
    )
    select
      'class_schedule_rescheduled', recipients.id, recipients.email,
      concat('class_schedule_rescheduled:', change_id, ':', recipients.id),
      concat('[MedLabs Calendar] Đổi ngày học · ', before_row.course_code_snapshot),
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
        'actor', coalesce(actor_name, 'Người dùng hệ thống')
      )
    from public.profiles as recipients
    where recipients.is_active
      and (
        recipients.id in (before_row.lecturer_id, before_row.lecturer_2_id)
        or exists (
          select 1 from public.user_roles as roles
          where roles.user_id = recipients.id
            and roles.role in ('admin', 'staff', 'importer', 'viewer')
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
  end if;

  return changed_row;
exception
  when exclusion_violation then
    raise exception 'ROOM_OR_LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

create or replace function private.enqueue_manual_schedule_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_label text;
  room_type_value uuid;
  lecturer_name text;
  creator_name text;
begin
  if new.source <> 'manual' then return new; end if;

  select concat_ws(' · ', rooms.room_code, rooms.building_code), rooms.room_type_id
  into room_label, room_type_value
  from public.rooms as rooms where rooms.id = new.room_id;

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name from public.profiles as profiles
  where profiles.id in (new.lecturer_id, new.lecturer_2_id);

  select profiles.full_name into creator_name
  from public.profiles as profiles where profiles.id = new.created_by;

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
  )
  select
    'class_schedule_created', recipient.id, recipient.email,
    concat('class_schedule_created:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Lịch lớp mới · ', new.course_code_snapshot),
    jsonb_build_object(
      'schedule_id', new.id, 'source', 'manual',
      'course_code', new.course_code_snapshot, 'course_name', new.course_name_snapshot,
      'schedule_date', new.schedule_date, 'start_time', new.start_time,
      'end_time', new.end_time, 'room', coalesce(room_label, 'Chưa có phòng'),
      'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
      'student_count', new.student_count,
      'creator', coalesce(creator_name, 'Người tạo phiếu')
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id and roles.role in ('staff', 'admin', 'viewer')
        and (
          roles.role = 'admin'
          or exists (
            select 1 from public.profile_room_types as assignments
            where assignments.profile_id = recipient.id
              and assignments.room_type_id = room_type_value
              and (
                roles.role <> 'viewer'
                or assignments.receive_schedule_emails
              )
          )
        )
    )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function private.enqueue_import_summary_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_name text;
  schedule_rows jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' or new.imported_rows <= 0 then
    return new;
  end if;
  select profiles.full_name into creator_name from public.profiles as profiles where profiles.id = new.created_by;
  select coalesce(jsonb_agg(jsonb_build_object(
    'schedule_id', schedules.id, 'course_code', schedules.course_code_snapshot,
    'course_name', schedules.course_name_snapshot, 'schedule_date', schedules.schedule_date,
    'start_time', schedules.start_time, 'end_time', schedules.end_time,
    'room', concat_ws(' · ', rooms.room_code, rooms.building_code),
    'lecturer', coalesce(nullif(concat_ws(' · ', lecturers.full_name, lecturers_2.full_name), ''), 'Chưa có giảng viên'),
    'student_count', schedules.student_count
  ) order by schedules.schedule_date, schedules.start_time, schedules.id), '[]'::jsonb)
  into schedule_rows
  from public.class_schedules as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  left join public.profiles as lecturers on lecturers.id = schedules.lecturer_id
  left join public.profiles as lecturers_2 on lecturers_2.id = schedules.lecturer_2_id
  where schedules.import_batch_id = new.id and schedules.schedule_status <> 'cancelled';

  insert into public.email_notifications (
    notification_type, recipient_id, recipient_email, dedupe_key, subject, payload
  )
  select 'class_schedule_import_summary', recipient.id, recipient.email,
    concat('class_schedule_import_summary:', new.id, ':', recipient.id),
    concat('[MedLabs Calendar] Tổng hợp import · ', new.imported_rows, ' lịch mới'),
    jsonb_build_object(
      'batch_id', new.id, 'source', 'import', 'file_name', new.original_file_name,
      'creator', coalesce(creator_name, 'Người import'), 'completed_at', new.completed_at,
      'total_rows', new.total_rows, 'imported_rows', new.imported_rows,
      'warning_rows', new.warning_rows, 'error_rows', new.error_rows,
      'duplicate_rows', new.duplicate_rows, 'schedules', schedule_rows
    )
  from public.profiles as recipient
  where recipient.is_active
    and exists (
      select 1 from public.user_roles as roles
      where roles.user_id = recipient.id and roles.role in ('staff', 'admin', 'viewer')
        and (
          roles.role = 'admin'
          or exists (
            select 1 from public.profile_room_types as assignments
            where assignments.profile_id = recipient.id
              and assignments.room_type_id = new.room_type_id
              and (
                roles.role <> 'viewer'
                or assignments.receive_schedule_emails
              )
          )
        )
    )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
