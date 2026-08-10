-- Migration: 20260809100000_basic_medical_schedule_outbox.sql
-- Checkpoint B: Basic Medical Schedule Transactional Outbox (YC-L04 & YC-L05)

-- 1. Create private helper for enqueuing Basic Medical schedule outbox events
create or replace function private.enqueue_basic_medical_schedule_outbox_event(
  target_schedule_id uuid,
  target_event_type text,
  actor_id uuid,
  target_mutation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  basic_medical_room_type_id uuid;
  schedule_row public.class_schedules%rowtype;
  room_row public.rooms%rowtype;
  actor_name text := 'Người dùng hệ thống';
  lecturer_1_name text := null;
  lecturer_1_email text := null;
  lecturer_2_name text := null;
  lecturer_2_email text := null;
  delivery_mode_val text := 'live';
  outbox_event_id uuid;
  evt_key text;
  payload_json jsonb;
  recipients_json jsonb;
begin
  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if basic_medical_room_type_id is null then
    return null;
  end if;

  select * into schedule_row from public.class_schedules where id = target_schedule_id;
  if schedule_row.id is null then
    return null;
  end if;

  select * into room_row from public.rooms where id = schedule_row.room_id;
  if room_row.room_type_id <> basic_medical_room_type_id then
    return null;
  end if;

  select delivery_mode into delivery_mode_val from public.email_delivery_settings limit 1;
  if delivery_mode_val is null then
    delivery_mode_val := 'live';
  end if;

  if actor_id is not null then
    select coalesce(full_name, 'Người dùng hệ thống') into actor_name
    from public.profiles where id = actor_id;
  end if;

  if schedule_row.lecturer_id is not null then
    select full_name, email into lecturer_1_name, lecturer_1_email
    from public.profiles where id = schedule_row.lecturer_id;
  end if;

  if schedule_row.lecturer_2_id is not null then
    select full_name, email into lecturer_2_name, lecturer_2_email
    from public.profiles where id = schedule_row.lecturer_2_id;
  end if;

  if target_event_type = 'schedule_cancelled' then
    evt_key := concat('basic_medical:schedule:', target_schedule_id, ':cancelled');
  else
    evt_key := concat('basic_medical:schedule:', target_schedule_id, ':updated:', coalesce(target_mutation_id, gen_random_uuid()));
  end if;

  payload_json := jsonb_build_object(
    'schedule_id', schedule_row.id,
    'actor_id', actor_id,
    'actor', actor_name,
    'course_id', schedule_row.course_id,
    'course_code', schedule_row.course_code_snapshot,
    'course_name', schedule_row.course_name_snapshot,
    'schedule_date', schedule_row.schedule_date,
    'start_time', schedule_row.start_time,
    'end_time', schedule_row.end_time,
    'room_id', schedule_row.room_id,
    'room', concat(room_row.room_code, ' · ', room_row.building_code),
    'room_code', room_row.room_code,
    'room_name', room_row.room_name,
    'building_code', room_row.building_code,
    'student_count', schedule_row.student_count,
    'lecturer_id', schedule_row.lecturer_id,
    'lecturer_name', lecturer_1_name,
    'lecturer_email', lecturer_1_email,
    'lecturer_2_id', schedule_row.lecturer_2_id,
    'lecturer_2_name', lecturer_2_name,
    'lecturer_2_email', lecturer_2_email,
    'lecturer', (
      select string_agg(name, ' · ')
      from unnest(array[lecturer_1_name, lecturer_2_name]) as name
      where name is not null
    ),
    'schedule_status', schedule_row.schedule_status
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipient_id', r.id,
        'recipient_email', r.email,
        'audience', r.audience
      )
    ),
    '[]'::jsonb
  ) into recipients_json
  from (
    select distinct on (p.id)
      p.id,
      p.email,
      case
        when p.id in (schedule_row.lecturer_id, schedule_row.lecturer_2_id) then 'lecturer'
        when exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role::text = 'admin') then 'admin'
        when exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role::text = 'staff') then 'staff'
        else 'viewer'
      end as audience
    from public.profiles p
    where p.is_active
      and p.email is not null
      and position('@' in p.email) > 0
      and (
        p.id in (schedule_row.lecturer_id, schedule_row.lecturer_2_id)
        or exists (
          select 1 from public.user_roles ur
          where ur.user_id = p.id
            and (
              ur.role::text = 'admin'
              or (
                ur.role::text in ('staff', 'viewer')
                and exists (
                  select 1 from public.profile_room_types prt
                  where prt.profile_id = p.id
                    and prt.room_type_id = basic_medical_room_type_id
                    and (ur.role::text <> 'viewer' or prt.receive_schedule_emails)
                )
              )
            )
        )
      )
  ) r;

  insert into public.email_outbox_events (
    domain,
    event_type,
    aggregate_id,
    event_key,
    payload,
    recipients,
    delivery_mode_at_event,
    status
  ) values (
    'basic_medical_schedule',
    target_event_type,
    target_schedule_id,
    evt_key,
    payload_json,
    recipients_json,
    delivery_mode_val,
    'pending'
  ) on conflict (event_key) do nothing
  returning id into outbox_event_id;

  return outbox_event_id;
end;
$$;

revoke all on function private.enqueue_basic_medical_schedule_outbox_event(uuid, text, uuid, uuid) from public, anon, authenticated;


-- 2. Extend process_email_outbox_events to handle basic_medical_schedule domain
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

    -- Branch 1: Skills Lab domain
    if evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created', 'class_schedule_import_summary', 'class_schedule_rescheduled', 'skills_lab_deleted') then
      notif_type := evt.event_type;
      subject_text := private.format_skills_lab_email_subject(evt.event_type, evt.payload);

      if evt.delivery_mode_at_event = 'off' then
        for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, id uuid, email text) loop
          target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
          target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
          dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

          if exists (select 1 from public.profiles where id = target_recipient_id) then
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
          end if;
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

        if exists (select 1 from public.profiles where id = target_recipient_id) then
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
        end if;
      end loop;

      update public.email_outbox_events
      set status = 'processed',
          processed_at = now(),
          last_error = null
      where id = evt.id;

      processed_count := processed_count + 1;
      continue;

    -- Branch 2: Basic Medical Registration domain
    elsif evt.domain = 'basic_medical_registration' then
      notif_type := concat('basic_medical_registration_', evt.event_type);
      subject_text := private.format_basic_medical_registration_subject(evt.event_type, evt.payload);

      if evt.delivery_mode_at_event = 'off' then
        for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, id uuid, email text) loop
          target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
          target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
          dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

          if exists (select 1 from public.profiles where id = target_recipient_id) then
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
          end if;
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

        if exists (select 1 from public.profiles where id = target_recipient_id) then
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
        end if;
      end loop;

      update public.email_outbox_events
      set status = 'processed',
          processed_at = now(),
          last_error = null
      where id = evt.id;

      processed_count := processed_count + 1;
      continue;

    -- Branch 3: Basic Medical Equipment Damage domain
    elsif evt.domain = 'basic_medical_damage' then
      notif_type := 'basic_medical_room_equipment_damaged';
      subject_text := private.format_basic_medical_damage_subject(evt.payload);

      if evt.delivery_mode_at_event = 'off' then
        for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, id uuid, email text) loop
          target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
          target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
          dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

          if exists (select 1 from public.profiles where id = target_recipient_id) then
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
          end if;
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

        if exists (select 1 from public.profiles where id = target_recipient_id) then
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
        end if;
      end loop;

      update public.email_outbox_events
      set status = 'processed',
          processed_at = now(),
          last_error = null
      where id = evt.id;

      processed_count := processed_count + 1;
      continue;

    -- Branch 4: Basic Medical Schedule domain (YC-L04 & YC-L05)
    elsif evt.domain = 'basic_medical_schedule' then
      if evt.event_type = 'schedule_cancelled' then
        notif_type := 'class_schedule_basic_medical_cancelled';
        subject_text := concat('[MedLabs Calendar] Hủy lịch Y cơ sở · ', evt.payload->>'course_code');
      else
        notif_type := 'class_schedule_basic_medical_updated';
        subject_text := concat('[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · ', evt.payload->>'course_code');
      end if;

      if evt.delivery_mode_at_event = 'off' then
        for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text, id uuid, email text) loop
          target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
          target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
          dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

          if exists (select 1 from public.profiles where id = target_recipient_id) then
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
          end if;
        end loop;

        update public.email_outbox_events
        set status = 'suppressed',
            processed_at = now(),
            last_error = 'Email được tạo khi chế độ gửi đang tắt.'
        where id = evt.id;
        processed_count := processed_count + 1;
        continue;
      end if;

      for rcp in select * from jsonb_to_recordset(evt.recipients) as r(recipient_id uuid, recipient_email text, audience text, id uuid, email text) loop
        target_recipient_id := coalesce(rcp.recipient_id, rcp.id);
        target_recipient_email := coalesce(rcp.recipient_email, rcp.email);
        dedupe_val := concat('outbox_notif:', evt.id, ':', target_recipient_id);

        if exists (select 1 from public.profiles where id = target_recipient_id) then
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
        end if;
      end loop;

      update public.email_outbox_events
      set status = 'processed',
          processed_at = now(),
          last_error = null
      where id = evt.id;

      processed_count := processed_count + 1;
      continue;

    end if;

    -- Branch 5: Equipment Request outbox events (DEFAULT - UNCHANGED)
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

revoke all on function public.process_email_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.process_email_outbox_events(integer) to service_role;


-- 3. Update public.update_class_schedule_details to enqueue YC-L04 outbox event on actual change
create or replace function public.update_class_schedule_details(
  target_schedule_id uuid,
  target_schedule_date date,
  target_start_time time,
  target_end_time time,
  target_room_id uuid,
  target_student_count integer,
  target_lecturer_ids uuid[] default '{}'::uuid[]
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  changed_row public.class_schedules;
  source_room_type uuid;
  target_room_type uuid;
  normalized_ids uuid[] := coalesce(target_lecturer_ids, '{}'::uuid[]);
  is_admin boolean := (select private.has_role('admin'));
  is_staff boolean := (select private.has_role('staff'));
  is_teaching_assistant boolean := (select private.has_role('teaching_assistant'));
  can_import_owner boolean := false;
  can_manage_details boolean := false;
  basic_medical_room_type_id uuid;
  has_actual_change boolean := false;
  mutation_id_val uuid;
begin
  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if not (select private.can_modify_class_schedule(target_schedule_id, 'details')) then
    raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into before_row from public.class_schedules schedules
  where schedules.id = target_schedule_id and schedules.schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select rooms.room_type_id into source_room_type from public.rooms rooms where rooms.id = before_row.room_id;

  can_import_owner := before_row.source = 'import'
    and (select private.can_import_schedules(source_room_type))
    and exists (
      select 1 from public.import_batches batches
      where batches.id = before_row.import_batch_id and batches.created_by = actor_id
    );

  select rooms.room_type_id into target_room_type
  from public.rooms rooms
  where rooms.id = target_room_id and rooms.is_active;

  if target_room_type is null then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  if is_admin then
    can_manage_details := true;
  elsif is_staff then
    can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
  elsif is_teaching_assistant then
    can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type)) and before_row.created_by = actor_id;
  elsif can_import_owner then
    can_manage_details := (select private.has_room_type(source_room_type)) and (select private.has_room_type(target_room_type));
  end if;

  if not can_manage_details then
    if not coalesce(actor_id in (before_row.lecturer_id, before_row.lecturer_2_id), false) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
    if target_start_time is distinct from before_row.start_time
      or target_end_time is distinct from before_row.end_time
      or target_room_id is distinct from before_row.room_id
      or target_student_count is distinct from before_row.student_count
      or normalized_ids is distinct from array_remove(array[before_row.lecturer_id, before_row.lecturer_2_id], null) then
      raise exception 'CLASS_DETAILS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if target_schedule_date is null or target_start_time is null or target_end_time <= target_start_time
    or target_student_count is null or target_student_count < 1 or target_room_id is null
    or cardinality(normalized_ids) > 2
    or cardinality(normalized_ids) <> cardinality(array(select distinct unnest(normalized_ids))) then
    raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023';
  end if;

  if not is_admin and (not (select private.has_room_type(source_room_type)) or not (select private.has_room_type(target_room_type))) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(normalized_ids) lecturer_id where not exists (
      select 1 from public.profiles profiles where profiles.id = lecturer_id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = lecturer_id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = lecturer_id and scopes.room_type_id = target_room_type)
    )
  ) then
    raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501';
  end if;

  if (select private.has_role('lecturer')) and not (is_admin or is_staff or is_teaching_assistant or can_import_owner)
    and actor_id <> all(normalized_ids) then
    raise exception 'LECTURER_MUST_REMAIN_ASSIGNED' using errcode = '42501';
  end if;

  -- Actual-change guard for YC-L04
  if before_row.schedule_date is distinct from target_schedule_date
    or before_row.start_time is distinct from target_start_time
    or before_row.end_time is distinct from target_end_time
    or before_row.room_id is distinct from target_room_id
    or before_row.student_count is distinct from target_student_count
    or before_row.lecturer_id is distinct from (case when cardinality(normalized_ids) >= 1 then normalized_ids[1] else null end)
    or before_row.lecturer_2_id is distinct from (case when cardinality(normalized_ids) >= 2 then normalized_ids[2] else null end) then
    has_actual_change := true;
  end if;

  update public.class_schedules
  set schedule_date = target_schedule_date,
      start_time = target_start_time,
      end_time = target_end_time,
      room_id = target_room_id,
      student_count = target_student_count,
      lecturer_id = (case when cardinality(normalized_ids) >= 1 then normalized_ids[1] else null end),
      lecturer_2_id = (case when cardinality(normalized_ids) >= 2 then normalized_ids[2] else null end),
      updated_at = now()
  where id = target_schedule_id
  returning * into changed_row;

  -- Enqueue YC-L04 outbox event if actual change occurred on a Basic Medical schedule
  if has_actual_change and target_room_type = basic_medical_room_type_id then
    mutation_id_val := gen_random_uuid();
    perform private.enqueue_basic_medical_schedule_outbox_event(
      changed_row.id,
      'schedule_updated',
      actor_id,
      mutation_id_val
    );
  end if;

  return changed_row;
exception when exclusion_violation then
  raise exception 'SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) from public, anon;
grant execute on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) to authenticated;


-- 4. Create public.cancel_class_schedule RPC for Admin cancellation (YC-L05)
create or replace function public.cancel_class_schedule(
  target_schedule_id uuid
)
returns public.class_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.class_schedules;
  changed_row public.class_schedules;
  room_type_val uuid;
  basic_medical_room_type_id uuid;
begin
  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if actor_id is null or not (select private.has_role('admin')) then
    raise exception 'ADMIN_ROLE_REQUIRED' using errcode = '42501';
  end if;

  select * into before_row from public.class_schedules
  where id = target_schedule_id
    and schedule_status <> 'cancelled'
  for update;

  if before_row.id is null then
    raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select room_type_id into room_type_val from public.rooms where id = before_row.room_id;

  update public.class_schedules
  set schedule_status = 'cancelled',
      cancelled_by = actor_id,
      cancelled_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = target_schedule_id
  returning * into changed_row;

  -- Enqueue YC-L05 outbox event using PRE-CANCEL state for Basic Medical schedules
  if room_type_val = basic_medical_room_type_id then
    perform private.enqueue_basic_medical_schedule_outbox_event(
      before_row.id,
      'schedule_cancelled',
      actor_id,
      null
    );
  end if;

  return changed_row;
end;
$$;

revoke all on function public.cancel_class_schedule(uuid) from public, anon;
grant execute on function public.cancel_class_schedule(uuid) to authenticated;
