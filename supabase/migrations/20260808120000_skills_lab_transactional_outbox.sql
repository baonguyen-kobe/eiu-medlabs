-- Migration: Skills Lab Transactional Outbox (SL-01 through SL-05)
-- Enforces durable outbox for manual creation (SL-01), import finalization (SL-02),
-- date reschedule (SL-03), and lecturer own delete pre-delete snapshot (SL-05).

set check_function_bodies = false;

-- 1. Helper function to format Skills Lab outbox subjects
create or replace function private.format_skills_lab_email_subject(
  target_event_type text,
  target_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  date_label text;
begin
  date_label := to_char((target_payload->>'schedule_date')::date, 'DD/MM/YYYY');
  if target_event_type = 'class_schedule_created' then
    return concat(
      '[MedLabs Calendar] Lịch phòng Skills Lab mới của ',
      coalesce(target_payload->>'lecturer', 'Chưa có giảng viên'),
      ' - ', date_label,
      ' - ', target_payload->>'course_code',
      ' - ', target_payload->>'request_code'
    );
  elsif target_event_type = 'class_schedule_import_summary' then
    return concat(
      '[MedLabs Calendar] Cập nhật Lịch sử dụng phòng Skills Lab mới · ',
      target_payload->>'imported_rows',
      ' lịch mới'
    );
  elsif target_event_type = 'class_schedule_rescheduled' then
    return concat(
      '[MedLabs Calendar] Đổi ngày học của ',
      coalesce(target_payload->>'lecturer', 'Chưa có giảng viên'),
      ' - ', target_payload->>'course_code',
      ' - ', date_label,
      ' - ', target_payload->>'request_code'
    );
  elsif target_event_type = 'skills_lab_deleted' then
    return concat(
      '[MedLabs Calendar] Giảng viên ',
      coalesce(target_payload->>'actor', target_payload->>'lecturer', 'Giảng viên'),
      ' xóa lớp Skills Lab - ',
      target_payload->>'course_code',
      ' - ', date_label,
      ' - ', target_payload->>'request_code'
    );
  end if;

  return concat('[MedLabs Calendar] Thông báo lịch Skills Lab - ', target_payload->>'course_code');
end;
$$;

revoke all on function private.format_skills_lab_email_subject(text, jsonb) from public, anon;

-- 2. Update process_email_outbox_events to process both equipment_request and skills_lab outbox events
create or replace function public.process_email_outbox_events(batch_size integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  evt record;
  processed_count integer := 0;
  rcp record;
  subject_text text;
  base_subject text;
  date_label text;
  notif_type text;
  dedupe_val text;
  target_recipient_id uuid;
  target_recipient_email text;
begin
  for evt in (
    with candidates as (
      select id from public.email_outbox_events
      where status = 'pending'
         or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
      order by created_at, id
      for update skip locked
      limit greatest(1, least(coalesce(batch_size, 25), 100))
    ),
    claimed as (
      update public.email_outbox_events e
      set status = 'processing',
          attempts = e.attempts + 1,
          processing_started_at = now()
      from candidates
      where e.id = candidates.id
      returning e.*
    )
    select * from claimed
  ) loop

    if evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created', 'class_schedule_import_summary', 'class_schedule_rescheduled', 'skills_lab_deleted') then
      notif_type := evt.event_type;
      subject_text := private.format_skills_lab_email_subject(evt.event_type, evt.payload);

      if evt.delivery_mode_at_event = 'off' then
        for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, id uuid, email text) loop
          target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
          target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
          dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

          insert into public.email_notifications (
            notification_type,
            recipient_id,
            recipient_email,
            dedupe_key,
            subject,
            payload,
            delivery_mode_at_enqueue,
            status,
            last_error
          ) values (
            notif_type,
            target_recipient_id,
            target_recipient_email,
            dedupe_val,
            subject_text,
            evt.payload,
            'off',
            'suppressed',
            'Email được tạo khi chế độ gửi đang tắt.'
          ) on conflict (dedupe_key) do nothing;
        end loop;

        update public.email_outbox_events
        set status = 'suppressed',
            processed_at = now(),
            last_error = 'Email được tạo khi chế độ gửi đang tắt.'
        where id = evt.id;
        processed_count := processed_count + 1;
        continue;
      end if;

      for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, id uuid, email text) loop
        target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
        target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
        dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

        insert into public.email_notifications (
          notification_type,
          recipient_id,
          recipient_email,
          dedupe_key,
          subject,
          payload,
          delivery_mode_at_enqueue
        ) values (
          notif_type,
          target_recipient_id,
          target_recipient_email,
          dedupe_val,
          subject_text,
          evt.payload,
          evt.delivery_mode_at_event
        ) on conflict (dedupe_key) do nothing;
      end loop;

      update public.email_outbox_events
      set status = 'processed',
          processed_at = now(),
          last_error = null
      where id = evt.id;

      processed_count := processed_count + 1;
      continue;
    end if;

    -- Default: Equipment Request outbox events
    date_label := to_char((evt.payload->>'schedule_date')::date, 'DD/MM/YYYY');
    base_subject := concat(evt.payload->>'registrant_name', ' - ', date_label, ' - ', evt.payload->>'course_code', ' - ', evt.payload->>'request_code');
    notif_type := concat('equipment_request_', evt.event_type);

    if evt.delivery_mode_at_event = 'off' then
      for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text) loop
        subject_text := private.format_equipment_email_subject(evt.event_type, rcp.audience, base_subject);
        dedupe_val := concat('outbox_notif:', evt.id, ':', rcp.recipient_id);

        insert into public.email_notifications (
          notification_type,
          recipient_id,
          recipient_email,
          dedupe_key,
          subject,
          payload,
          delivery_mode_at_enqueue,
          status,
          last_error
        ) values (
          notif_type,
          rcp.recipient_id,
          rcp.recipient_email,
          dedupe_val,
          subject_text,
          jsonb_set(evt.payload, '{audience}', to_jsonb(rcp.audience)),
          'off',
          'suppressed',
          'Email được tạo khi chế độ gửi đang tắt.'
        ) on conflict (dedupe_key) do nothing;
      end loop;

      update public.email_outbox_events
      set status = 'suppressed',
          processed_at = now(),
          last_error = 'Email được tạo khi chế độ gửi đang tắt.'
      where id = evt.id;
      processed_count := processed_count + 1;
      continue;
    end if;

    for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text) loop
      subject_text := private.format_equipment_email_subject(evt.event_type, rcp.audience, base_subject);
      dedupe_val := concat('outbox_notif:', evt.id, ':', rcp.recipient_id);

      insert into public.email_notifications (
        notification_type,
        recipient_id,
        recipient_email,
        dedupe_key,
        subject,
        payload,
        delivery_mode_at_enqueue
      ) values (
        notif_type,
        rcp.recipient_id,
        rcp.recipient_email,
        dedupe_val,
        subject_text,
        jsonb_set(evt.payload, '{audience}', to_jsonb(rcp.audience)),
        evt.delivery_mode_at_event
      ) on conflict (dedupe_key) do nothing;
    end loop;

    update public.email_outbox_events
    set status = 'processed',
        processed_at = now(),
        last_error = null
    where id = evt.id;

    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.process_email_outbox_events(integer) from public, anon;
grant execute on function public.process_email_outbox_events(integer) to authenticated;

-- 3. SL-01: Update private.enqueue_manual_schedule_email to route outbox event via email_outbox_events
create or replace function private.enqueue_manual_schedule_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_label text;
  room_type_value uuid;
  room_type_code_value text;
  lecturer_name text;
  creator_name text;
  schedule_code text;
begin
  if new.source <> 'manual' then return new; end if;

  select concat_ws(' · ', rooms.room_code, rooms.building_code),
         rooms.room_type_id, room_types.code
  into room_label, room_type_value, room_type_code_value
  from public.rooms as rooms
  join public.room_types as room_types on room_types.id = rooms.room_type_id
  where rooms.id = new.room_id;

  -- Phiếu Y cơ sở không dùng luồng này
  if room_type_code_value = 'basic_medical' then return new; end if;

  select pg_catalog.string_agg(profiles.full_name, ' · ' order by profiles.full_name)
  into lecturer_name from public.profiles as profiles
  where profiles.id in (new.lecturer_id, new.lecturer_2_id);

  select profiles.full_name into creator_name
  from public.profiles as profiles where profiles.id = new.created_by;

  schedule_code := to_char(
    new.created_at at time zone 'Asia/Ho_Chi_Minh',
    'YYMMDDHH24MISS'
  );

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
    'class_schedule_created',
    new.id,
    concat('skills_lab:manual_created:', new.id),
    jsonb_build_object(
      'schedule_id', new.id,
      'source', 'manual',
      'course_code', new.course_code_snapshot,
      'course_name', new.course_name_snapshot,
      'schedule_date', new.schedule_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'room', coalesce(room_label, 'Chưa có phòng'),
      'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
      'student_count', new.student_count,
      'creator', coalesce(creator_name, 'Người tạo phiếu'),
      'request_code', schedule_code,
      'room_type_code', room_type_code_value
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', recipient.id, 'email', recipient.email)), '[]'::jsonb)
      from public.profiles as recipient
      where recipient.is_active
        and (
          recipient.id in (new.created_by, new.lecturer_id, new.lecturer_2_id)
          or exists (
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
        )
    ),
    (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
  on conflict (event_key) do nothing;

  perform public.process_email_outbox_events(50);
  return new;
end;
$$;

-- 4. SL-02: Update private.enqueue_import_summary_email to route outbox event via email_outbox_events
create or replace function private.enqueue_import_summary_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_name text;
  schedule_rows jsonb;
  room_type_code_value text;
begin
  if new.status not in ('completed', 'completed_with_errors')
     or old.status in ('completed', 'completed_with_errors')
     or new.imported_rows <= 0 then
    return new;
  end if;

  select profiles.full_name into creator_name
  from public.profiles as profiles where profiles.id = new.created_by;

  select room_types.code into room_type_code_value
  from public.room_types as room_types where room_types.id = new.room_type_id;

  if room_type_code_value = 'basic_medical' then return new; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'schedule_id', schedules.id,
    'course_code', schedules.course_code_snapshot,
    'course_name', schedules.course_name_snapshot,
    'schedule_date', schedules.schedule_date,
    'start_time', schedules.start_time,
    'end_time', schedules.end_time,
    'room', concat_ws(' · ', rooms.room_code, rooms.building_code),
    'lecturer', coalesce(nullif(concat_ws(' · ', lecturers.full_name, lecturers_2.full_name), ''), 'Chưa có giảng viên'),
    'student_count', schedules.student_count
  ) order by schedules.schedule_date, schedules.start_time, schedules.course_code_snapshot, schedules.id), '[]'::jsonb)
  into schedule_rows
  from (
    select * from public.class_schedules
    where import_batch_id = new.id and schedule_status <> 'cancelled'
    order by schedule_date, start_time, course_code_snapshot, id
    limit 50
  ) as schedules
  join public.rooms as rooms on rooms.id = schedules.room_id
  left join public.profiles as lecturers on lecturers.id = schedules.lecturer_id
  left join public.profiles as lecturers_2 on lecturers_2.id = schedules.lecturer_2_id;

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
    'skills_lab_import',
    'class_schedule_import_summary',
    new.id,
    concat('skills_lab:import:', new.id, ':success'),
    jsonb_build_object(
      'batch_id', new.id,
      'source', 'import',
      'file_name', new.original_file_name,
      'creator', coalesce(creator_name, 'Người import'),
      'completed_at', new.completed_at,
      'total_rows', new.total_rows,
      'imported_rows', new.imported_rows,
      'warning_rows', new.warning_rows,
      'error_rows', new.error_rows,
      'duplicate_rows', new.duplicate_rows,
      'schedules', schedule_rows,
      'room_type_code', room_type_code_value
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', recipient.id, 'email', recipient.email)), '[]'::jsonb)
      from public.profiles as recipient
      where recipient.is_active
        and (
          recipient.id = new.created_by
          or exists (
            select 1
            from public.class_schedules as related_schedules
            where related_schedules.import_batch_id = new.id
              and related_schedules.schedule_status <> 'cancelled'
              and recipient.id in (
                related_schedules.lecturer_id,
                related_schedules.lecturer_2_id
              )
          )
          or exists (
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
        )
    ),
    (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
  on conflict (event_key) do nothing;

  perform public.process_email_outbox_events(50);
  return new;
end;
$$;

-- 5. SL-03: Update public.reschedule_class to route outbox event via email_outbox_events
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
      case when room_type_code_value = 'basic_medical'
        then 'basic_medical_schedule'
        else 'skills_lab_schedule' end,
      case when room_type_code_value = 'basic_medical'
        then 'class_schedule_basic_medical_updated'
        else 'class_schedule_rescheduled' end,
      before_row.id,
      concat(
        case when room_type_code_value = 'basic_medical'
          then 'basic_medical:rescheduled:'
          else 'skills_lab:rescheduled:' end,
        change_id, ':', before_row.id
      ),
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
            or (
              room_type_code_value <> 'basic_medical'
              and recipients.id = before_row.created_by
            )
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

    perform public.process_email_outbox_events(50);
  end if;

  return changed_row;
exception
  when exclusion_violation then
    raise exception 'ROOM_OR_LECTURER_SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.reschedule_class(uuid, date) from public, anon;
grant execute on function public.reschedule_class(uuid, date) to authenticated;

-- 6. SL-05: Dedicated RPC for deleting Skills Lab class schedule
create or replace function public.delete_skills_lab_class_schedule(
  target_schedule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  room_type_value uuid;
  room_type_code_value text;
  room_label text;
  actor_name text;
  lecturer_name text;
  schedule_code text;
  is_manager boolean;
  is_eligible_lecturer boolean;
  is_eligible_ta boolean;
begin
  if actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  select schedules.* into before_row
  from public.class_schedules as schedules
  where schedules.id = target_schedule_id
    and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if before_row.basic_medical_registration_id is not null then
    raise exception 'BASIC_MEDICAL_SCHEDULE_MUTATION_FORBIDDEN' using errcode = '42501';
  end if;

  select rooms.room_type_id, room_types.code,
         concat_ws(' · ', rooms.room_code, rooms.building_code)
  into room_type_value, room_type_code_value, room_label
  from public.rooms as rooms
  join public.room_types as room_types on room_types.id = rooms.room_type_id
  where rooms.id = before_row.room_id;

  if not (select private.has_room_type(room_type_value)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  is_manager := (select private.has_role('admin')) or (select private.has_role('staff'));

  is_eligible_lecturer := (
    room_type_code_value = 'nursing_skills'
    and before_row.created_by = actor_id
    and (select private.has_role('lecturer'))
  );

  is_eligible_ta := (
    before_row.created_by = actor_id
    and (select private.has_role('teaching_assistant'))
  );

  if not (is_manager or is_eligible_lecturer or is_eligible_ta) then
    raise exception 'CLASS_DELETE_FORBIDDEN' using errcode = '42501';
  end if;

  -- SL-05: If Lecturer own delete on Skills Lab class (not admin/staff), record pre-delete outbox event BEFORE deleting
  if room_type_code_value = 'nursing_skills' and not is_manager then
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
      'skills_lab_deleted',
      before_row.id,
      concat('skills_lab:lecturer_deleted:', before_row.id),
      jsonb_build_object(
        'schedule_id', before_row.id,
        'course_code', before_row.course_code_snapshot,
        'course_name', before_row.course_name_snapshot,
        'schedule_date', before_row.schedule_date,
        'start_time', before_row.start_time,
        'end_time', before_row.end_time,
        'room', room_label,
        'student_count', before_row.student_count,
        'lecturer', coalesce(lecturer_name, 'Chưa có giảng viên'),
        'request_code', schedule_code,
        'actor', coalesce(actor_name, 'Giảng viên')
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'email', r.email)), '[]'::jsonb)
        from public.profiles as r
        where r.is_active
          and (
            r.id in (actor_id, before_row.lecturer_id, before_row.lecturer_2_id)
            or exists (
              select 1 from public.user_roles as roles
              where roles.user_id = r.id and roles.role in ('admin', 'staff')
                and (
                  roles.role = 'admin'
                  or exists (
                    select 1 from public.profile_room_types as assignments
                    where assignments.profile_id = r.id
                      and assignments.room_type_id = room_type_value
                  )
                )
            )
          )
      ),
      (select delivery_mode from public.email_delivery_settings where setting_key = 'primary')
    on conflict (event_key) do nothing;
  end if;

  -- Delete schedule row
  delete from public.class_schedules where id = target_schedule_id;

  perform public.process_email_outbox_events(50);
  return true;
end;
$$;

revoke all on function public.delete_skills_lab_class_schedule(uuid) from public, anon;
grant execute on function public.delete_skills_lab_class_schedule(uuid) to authenticated;

-- 7. Close direct physical DELETE on class_schedules for authenticated role
revoke delete on public.class_schedules from authenticated;
