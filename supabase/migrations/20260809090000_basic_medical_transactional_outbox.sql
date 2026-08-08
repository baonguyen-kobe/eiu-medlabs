-- Migration: 20260809090000_basic_medical_transactional_outbox.sql
-- Description: Transactional outbox for Basic Medical registration (create/adjust/cancel) and equipment damage reporting.

set check_function_bodies = false;

-- 1. Subject formatter for Basic Medical registration events
create or replace function private.format_basic_medical_registration_subject(
  target_event_type text,
  target_payload jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefix_label text;
  registrant_name text := coalesce(target_payload->>'registrant_name', 'Người dùng hệ thống');
  course_code text := coalesce(target_payload->>'course_code', '');
  start_date text := to_char((target_payload->>'start_date')::date, 'DD/MM/YYYY');
  end_date text := to_char((target_payload->>'end_date')::date, 'DD/MM/YYYY');
  registration_code text := coalesce(target_payload->>'registration_code', target_payload->>'registration_id', '');
  date_range text;
begin
  if start_date = end_date or target_payload->>'end_date' is null then
    date_range := start_date;
  else
    date_range := concat(start_date, ' - ', end_date);
  end if;

  if target_event_type = 'created' then
    prefix_label := 'Có đăng ký phòng TNTH mới';
  elsif target_event_type = 'updated' then
    prefix_label := 'Điều chỉnh phiếu đăng ký phòng TNTH';
  elsif target_event_type = 'cancelled' then
    prefix_label := 'Xóa phiếu đăng ký phòng TNTH';
  else
    prefix_label := 'Thông báo phiếu đăng ký phòng TNTH';
  end if;

  return concat('[MedLabs Calendar] ', prefix_label, ' · ', registrant_name, ' - ', course_code, ' - ', date_range, ' - ', registration_code);
end;
$$;
revoke all on function private.format_basic_medical_registration_subject(text, jsonb) from public, anon, authenticated;

-- 2. Subject formatter for Basic Medical equipment damage events
create or replace function private.format_basic_medical_damage_subject(
  target_payload jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  room_code text := coalesce(target_payload->>'room_code', '');
  room_name text := coalesce(target_payload->>'room_name', '');
  room_label text;
begin
  if nullif(btrim(room_name), '') is not null then
    room_label := concat(room_code, ' ', room_name);
  else
    room_label := room_code;
  end if;
  return concat('[MedLabs Calendar] Thiết bị phòng ', room_label, ' được báo Hư');
end;
$$;
revoke all on function private.format_basic_medical_damage_subject(jsonb) from public, anon, authenticated;

-- 3. Private enqueue function for Basic Medical registration outbox events
create or replace function private.enqueue_basic_medical_registration_outbox_event(
  target_registration_id uuid,
  target_event_type text,
  actor_id uuid,
  mutation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mode_val text := 'off';
  reg_row record;
  sessions_json jsonb := '[]'::jsonb;
  payload_val jsonb;
  recipients_val jsonb := '[]'::jsonb;
  event_key_val text;
  outbox_id uuid;
  actor_name text := 'Người dùng hệ thống';
  basic_medical_room_type_id uuid;
begin
  select coalesce(delivery_mode, 'off') into mode_val
  from public.email_delivery_settings
  limit 1;
  if mode_val is null then mode_val := 'off'; end if;

  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if actor_id is not null then
    select full_name into actor_name
    from public.profiles
    where id = actor_id;
    if actor_name is null then actor_name := 'Người dùng hệ thống'; end if;
  end if;

  select r.id, r.registration_code, r.academic_year, r.semester,
         r.start_date, r.end_date, r.student_count, r.note, r.created_at,
         r.registrant_id, r.responsible_lecturer_id,
         c.course_code, c.course_name,
         rm.room_code, rm.room_name, rm.building_code,
         p_reg.full_name as registrant_name, p_reg.email as registrant_email,
         p_resp.full_name as responsible_name, p_resp.email as responsible_email
  into reg_row
  from public.basic_medical_registrations r
  left join public.courses c on c.id = r.course_id
  left join public.rooms rm on rm.id = r.room_id
  left join public.profiles p_reg on p_reg.id = r.registrant_id
  left join public.profiles p_resp on p_resp.id = r.responsible_lecturer_id
  where r.id = target_registration_id;

  if reg_row.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', s.id,
      'class_schedule_id', s.class_schedule_id,
      'lesson_title', s.lesson_title,
      'session_number', s.session_number,
      'schedule_date', cs.schedule_date,
      'start_time', cs.start_time,
      'end_time', cs.end_time,
      'room', concat_ws(' · ', rm.room_code, rm.building_code),
      'lecturer', p_teach.full_name,
      'student_count', cs.student_count
    ) order by cs.schedule_date, cs.start_time, s.session_number, s.id
  ), '[]'::jsonb) into sessions_json
  from public.basic_medical_registration_sessions s
  left join public.class_schedules cs on cs.id = s.class_schedule_id
  left join public.rooms rm on rm.id = cs.room_id
  left join public.profiles p_teach on p_teach.id = s.teaching_lecturer_id
  where s.registration_id = target_registration_id;

  payload_val := jsonb_build_object(
    'registration_id', reg_row.id,
    'registration_code', coalesce(reg_row.registration_code, reg_row.id::text),
    'event', target_event_type,
    'course_code', coalesce(reg_row.course_code, ''),
    'course_name', coalesce(reg_row.course_name, ''),
    'academic_year', reg_row.academic_year,
    'semester', reg_row.semester,
    'start_date', reg_row.start_date,
    'end_date', reg_row.end_date,
    'student_count', reg_row.student_count,
    'note', reg_row.note,
    'room', concat_ws(' · ', reg_row.room_code, reg_row.building_code),
    'registrant_name', coalesce(reg_row.registrant_name, 'Người dùng hệ thống'),
    'responsible_name', coalesce(reg_row.responsible_name, 'Người dùng hệ thống'),
    'actor', actor_name,
    'schedules', sessions_json
  );

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'recipient_id', p.id,
    'recipient_email', lower(btrim(p.email))
  )), '[]'::jsonb) into recipients_val
  from public.profiles p
  where p.is_active
    and p.email is not null
    and p.email like '%@%'
    and (
      p.id = reg_row.registrant_id
      or p.id = reg_row.responsible_lecturer_id
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = p.id and ur.role = 'admin'
      )
      or (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = p.id and ur.role = 'staff'
        )
        and exists (
          select 1 from public.profile_room_types prt
          where prt.profile_id = p.id and prt.room_type_id = basic_medical_room_type_id
        )
      )
    );

  if target_event_type = 'created' then
    event_key_val := concat('basic_medical:registration:', target_registration_id, ':created');
  elsif target_event_type = 'cancelled' then
    event_key_val := concat('basic_medical:registration:', target_registration_id, ':cancelled');
  elsif target_event_type = 'updated' then
    event_key_val := concat('basic_medical:registration:', target_registration_id, ':updated:', coalesce(mutation_id, gen_random_uuid()));
  else
    event_key_val := concat('basic_medical:registration:', target_registration_id, ':', target_event_type, ':', gen_random_uuid());
  end if;

  insert into public.email_outbox_events (
    domain, event_type, event_key, payload, recipients, delivery_mode_at_event, status
  ) values (
    'basic_medical_registration', target_event_type, event_key_val, payload_val, recipients_val, mode_val, 'pending'
  ) on conflict (event_key) do nothing
  returning id into outbox_id;

  return outbox_id;
end;
$$;
revoke all on function private.enqueue_basic_medical_registration_outbox_event(uuid, text, uuid, uuid) from public, anon, authenticated;

-- 4. Private enqueue function for Basic Medical equipment damage outbox events
create or replace function private.enqueue_basic_medical_damage_outbox_event(
  target_confirmation_id uuid,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  mode_val text := 'off';
  conf_row record;
  items_json jsonb := '[]'::jsonb;
  payload_val jsonb;
  recipients_val jsonb := '[]'::jsonb;
  event_key_val text;
  outbox_id uuid;
  actor_name text := 'Người dùng hệ thống';
  basic_medical_room_type_id uuid;
begin
  select coalesce(delivery_mode, 'off') into mode_val
  from public.email_delivery_settings
  limit 1;
  if mode_val is null then mode_val := 'off'; end if;

  select id into basic_medical_room_type_id
  from public.room_types
  where code = 'basic_medical'
  limit 1;

  if actor_id is not null then
    select full_name into actor_name
    from public.profiles
    where id = actor_id;
    if actor_name is null then actor_name := 'Người dùng hệ thống'; end if;
  end if;

  select c.id, c.session_id, c.signed_at, c.schedule_date_snapshot,
         c.start_time_snapshot, c.end_time_snapshot, c.room_id_snapshot,
         rm.room_code, rm.room_name, rm.building_code,
         cs.course_code_snapshot, cs.course_name_snapshot,
         p_signer.full_name as reporter_name
  into conf_row
  from public.basic_medical_session_confirmations c
  left join public.rooms rm on rm.id = c.room_id_snapshot
  left join public.class_schedules cs on cs.id = c.class_schedule_id_snapshot
  left join public.profiles p_signer on p_signer.id = c.signer_id
  where c.id = target_confirmation_id;

  if conf_row.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'inventory_id', chk.inventory_id,
      'item_name', chk.item_name_snapshot,
      'commercial_name', chk.commercial_name_snapshot,
      'unit', chk.unit_snapshot,
      'newly_damaged_quantity', chk.newly_damaged_quantity,
      'good_quantity', chk.good_after,
      'damaged_quantity', chk.damaged_after
    ) order by chk.id
  ), '[]'::jsonb) into items_json
  from public.basic_medical_session_equipment_checks chk
  where chk.confirmation_id = target_confirmation_id
    and chk.newly_damaged_quantity > 0;

  if jsonb_array_length(items_json) = 0 then
    return null;
  end if;

  payload_val := jsonb_build_object(
    'confirmation_id', conf_row.id,
    'room_code', coalesce(conf_row.room_code, ''),
    'room_name', coalesce(conf_row.room_name, ''),
    'building_code', coalesce(conf_row.building_code, ''),
    'reporter_name', coalesce(conf_row.reporter_name, actor_name),
    'reported_at', conf_row.signed_at,
    'course_code', coalesce(conf_row.course_code_snapshot, ''),
    'course_name', coalesce(conf_row.course_name_snapshot, ''),
    'schedule_date', conf_row.schedule_date_snapshot,
    'start_time', conf_row.start_time_snapshot,
    'end_time', conf_row.end_time_snapshot,
    'items', items_json
  );

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'recipient_id', p.id,
    'recipient_email', lower(btrim(p.email))
  )), '[]'::jsonb) into recipients_val
  from public.profiles p
  where p.is_active
    and p.email is not null
    and p.email like '%@%'
    and (
      exists (
        select 1 from public.user_roles ur
        where ur.user_id = p.id and ur.role = 'admin'
      )
      or (
        exists (
          select 1 from public.user_roles ur
          where ur.user_id = p.id and ur.role = 'staff'
        )
        and exists (
          select 1 from public.profile_room_types prt
          where prt.profile_id = p.id and prt.room_type_id = basic_medical_room_type_id
        )
      )
    );

  event_key_val := concat('basic_medical:damage:', target_confirmation_id);

  insert into public.email_outbox_events (
    domain, event_type, event_key, payload, recipients, delivery_mode_at_event, status
  ) values (
    'basic_medical_damage', 'damage_reported', event_key_val, payload_val, recipients_val, mode_val, 'pending'
  ) on conflict (event_key) do nothing
  returning id into outbox_id;

  return outbox_id;
end;
$$;
revoke all on function private.enqueue_basic_medical_damage_outbox_event(uuid, uuid) from public, anon, authenticated;

-- 5. Extend public.process_email_outbox_events with Basic Medical domain branches
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

    end if;

    -- Branch 4: Equipment Request outbox events (DEFAULT - UNCHANGED)
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

-- 6. Update save_basic_medical_registration RPC with outbox enqueue call
create or replace function public.save_basic_medical_registration(
  target_registration_id uuid default null,
  target_academic_year text default null,
  target_semester text default null,
  target_start_date date default null,
  target_end_date date default null,
  target_course_id uuid default null,
  target_room_id uuid default null,
  target_student_count integer default null,
  target_responsible_lecturer_id uuid default null,
  target_note text default null,
  target_sessions jsonb default '[]'::jsonb
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
  existing_session record;
  schedule_id_value uuid;
  basic_medical_room_type_id constant uuid := '40000000-0000-0000-0000-000000000002'::uuid;
  event_type_val text;
  mutation_id_val uuid;
begin
  perform set_config('app.basic_medical_registration_mutation', 'true', true);

  if not (select private.can_manage_basic_medical())
    and not (select private.has_role('teaching_assistant')) then
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
      and exists (
        select 1 from public.user_roles as lecturer_roles
        where lecturer_roles.user_id = profiles.id
          and lecturer_roles.role = 'lecturer'
      )
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
      or not exists (
        select 1 from public.user_roles as lecturer_roles
        where lecturer_roles.user_id = profiles.id
          and lecturer_roles.role = 'lecturer'
      )
      or not exists (
        select 1 from public.profile_room_types as assignments
        where assignments.profile_id = profiles.id
          and assignments.room_type_id = basic_medical_room_type_id
      )
  ) then
    raise exception 'Danh sách buổi học có dữ liệu không hợp lệ.' using errcode = '22023';
  end if;

  if target_registration_id is null then
    event_type_val := 'created';
    mutation_id_val := null;
    insert into public.basic_medical_registrations (
      academic_year, semester, start_date, end_date, course_id, room_id,
      student_count, registrant_id, responsible_lecturer_id, note, created_by
    ) values (
      target_academic_year, target_semester, target_start_date, target_end_date,
      target_course_id, target_room_id, target_student_count, actor_id,
      target_responsible_lecturer_id, nullif(btrim(target_note), ''), actor_id
    ) returning id, created_by into registration_id_value, registration_owner_id;
  else
    event_type_val := 'updated';
    mutation_id_val := gen_random_uuid();
    select registrations.created_by
    into registration_owner_id
    from public.basic_medical_registrations as registrations
    where registrations.id = target_registration_id
    for update;

    if registration_owner_id is null then
      raise exception 'Không tìm thấy phiếu Y cơ sở.' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.basic_medical_registrations as cancelled
      where cancelled.id = target_registration_id
        and cancelled.cancelled_at is not null
    ) then
      raise exception 'Phiếu Y cơ sở đã hủy không thể điều chỉnh.' using errcode = '55000';
    end if;
    if registration_owner_id <> actor_id
      and not (select private.can_manage_basic_medical()) then
      raise exception 'Bạn không có quyền điều chỉnh phiếu Y cơ sở.' using errcode = '42501';
    end if;

    registration_id_value := target_registration_id;

    -- Delete only removed/materially changed sessions before inserting their replacements.
    delete from public.class_schedules as schedules
    using public.basic_medical_registration_sessions as sessions
    where sessions.registration_id = target_registration_id
      and schedules.id = sessions.class_schedule_id
      and not exists (
        select 1
        from jsonb_array_elements(target_sessions)
          with ordinality as target_item(value, session_number)
        where target_item.session_number::integer = sessions.session_number
          and schedules.room_id = target_room_id
          and schedules.schedule_date = (target_item.value->>'schedule_date')::date
          and schedules.start_time = (target_item.value->>'start_time')::time
          and schedules.end_time = (target_item.value->>'end_time')::time
          and schedules.lecturer_id = (target_item.value->>'teaching_lecturer_id')::uuid
          and schedules.schedule_status = 'published'
      );

    update public.basic_medical_registrations
    set academic_year = target_academic_year,
        semester = target_semester,
        start_date = target_start_date,
        end_date = target_end_date,
        course_id = target_course_id,
        room_id = target_room_id,
        student_count = target_student_count,
        responsible_lecturer_id = target_responsible_lecturer_id,
        note = nullif(btrim(target_note), ''),
        updated_at = clock_timestamp()
    where id = target_registration_id;
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

    select sessions.id, sessions.class_schedule_id
    into existing_session
    from public.basic_medical_registration_sessions as sessions
    where sessions.registration_id = registration_id_value
      and sessions.session_number = session_number_value;

    if existing_session.id is not null then
      update public.class_schedules
      set course_id = target_course_id,
          course_code_snapshot = course_code_value,
          course_name_snapshot = course_name_value,
          note = nullif(btrim(target_note), ''),
          student_count = target_student_count
      where id = existing_session.class_schedule_id;

      update public.basic_medical_registration_sessions
      set lesson_title = btrim(session_row.lesson_title),
          teaching_lecturer_id = session_row.teaching_lecturer_id
      where id = existing_session.id;
    else
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
    end if;
  end loop;

  perform private.enqueue_basic_medical_registration_outbox_event(
    registration_id_value,
    event_type_val,
    actor_id,
    mutation_id_val
  );

  return registration_id_value;
end;
$$;
revoke all on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) from public, anon;
grant execute on function public.save_basic_medical_registration(uuid,text,text,date,date,uuid,uuid,integer,uuid,text,jsonb) to authenticated;

-- 7. Update cancel_basic_medical_registration RPC with outbox enqueue call
create or replace function public.cancel_basic_medical_registration(
  target_registration_id uuid,
  target_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_row public.basic_medical_registrations%rowtype;
  cancelled_schedule_count integer := 0;
begin
  if not (select private.can_manage_basic_medical()) then
    raise exception 'BASIC_MEDICAL_MANAGER_REQUIRED' using errcode = '42501';
  end if;
  select * into target_row from public.basic_medical_registrations
  where id = target_registration_id for update;
  if target_row.id is null then
    raise exception 'BASIC_MEDICAL_REGISTRATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_row.cancelled_at is not null then
    return jsonb_build_object('id', target_row.id, 'already_cancelled', true, 'cancelled_schedules', 0);
  end if;

  perform private.enqueue_basic_medical_registration_outbox_event(
    target_registration_id,
    'cancelled',
    actor_id,
    null
  );

  perform set_config('app.basic_medical_registration_mutation', 'true', true);
  update public.class_schedules schedules
  set schedule_status = 'cancelled', cancelled_by = actor_id,
      cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where schedules.basic_medical_registration_id = target_registration_id
    and schedules.schedule_status not in ('cancelled', 'completed')
    and schedules.schedule_date >= (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics cancelled_schedule_count = row_count;

  update public.basic_medical_session_confirmations confirmations
  set invalidated_at = coalesce(confirmations.invalidated_at, clock_timestamp()),
      invalidated_reason = coalesce(confirmations.invalidated_reason, 'Buổi học Y cơ sở đã được hủy.')
  from public.basic_medical_registration_sessions sessions
  join public.class_schedules schedules on schedules.id = sessions.class_schedule_id
  where confirmations.registration_id_snapshot = target_registration_id
    and confirmations.session_id = sessions.id
    and schedules.schedule_status = 'cancelled'
    and confirmations.invalidated_at is null;

  update public.basic_medical_registrations
  set cancelled_at = clock_timestamp(), cancelled_by = actor_id,
      cancel_reason = nullif(btrim(target_reason), ''), updated_at = clock_timestamp()
  where id = target_registration_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data, metadata)
  values (
    actor_id, 'basic_medical.registration_cancelled', 'basic_medical_registration',
    target_registration_id,
    jsonb_build_object('cancelled_at', null),
    jsonb_build_object('cancelled_at', clock_timestamp(), 'reason', nullif(btrim(target_reason), '')),
    jsonb_build_object('cancelled_schedules', cancelled_schedule_count)
  );

  return jsonb_build_object(
    'id', target_registration_id,
    'already_cancelled', false,
    'cancelled_schedules', cancelled_schedule_count
  );
end;
$$;
revoke all on function public.cancel_basic_medical_registration(uuid, text) from public, anon;
grant execute on function public.cancel_basic_medical_registration(uuid, text) to authenticated;

-- 8. Update confirm_basic_medical_session RPC with damage outbox enqueue call
create or replace function public.confirm_basic_medical_session(
  target_session_id uuid,
  target_signature_data text,
  target_checks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  signed_at_value timestamptz := clock_timestamp();
  local_signed_at timestamp;
  earliest_confirmation_at timestamp;
  session_row record;
  inventory_row record;
  confirmation_id_value uuid;
  inventory_count integer;
  newly_damaged integer;
  signature_bytes bytea;
  damaged_items jsonb := '[]'::jsonb;
begin
  if actor_id is null or not (select private.is_active_user()) then
    raise exception 'Phiên đăng nhập đã hết hạn.' using errcode = '42501';
  end if;
  if target_signature_data is null
    or length(target_signature_data) not between 100 and 400000
    or target_signature_data not like 'data:image/png;base64,%' then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end if;
  begin
    signature_bytes := decode(split_part(target_signature_data, ',', 2), 'base64');
  exception when others then
    raise exception 'Chữ ký điện tử không hợp lệ.' using errcode = '22023';
  end;
  if substring(signature_bytes from 1 for 8) <> decode('iVBORw0KGgo=', 'base64') then
    raise exception 'Chữ ký phải là ảnh PNG.' using errcode = '22023';
  end if;
  if target_checks is null or jsonb_typeof(target_checks) <> 'array' then
    raise exception 'Danh sách tình trạng thiết bị không hợp lệ.' using errcode = '22023';
  end if;

  select sessions.id, sessions.registration_id, sessions.class_schedule_id,
         sessions.teaching_lecturer_id, schedules.schedule_date,
         schedules.start_time, schedules.end_time, schedules.room_id,
         schedules.schedule_status, rooms.room_code, rooms.room_name,
         rooms.building_code
  into session_row
  from public.basic_medical_registration_sessions as sessions
  join public.class_schedules as schedules on schedules.id = sessions.class_schedule_id
  join public.rooms as rooms on rooms.id = schedules.room_id
  where sessions.id = target_session_id
  for update of sessions, schedules;

  if session_row.id is null or session_row.schedule_status = 'cancelled' then
    raise exception 'Không tìm thấy buổi học có thể xác nhận.' using errcode = 'P0002';
  end if;
  if session_row.teaching_lecturer_id <> actor_id then
    raise exception 'Chỉ Giảng viên giảng dạy/hướng dẫn của buổi được ký xác nhận.' using errcode = '42501';
  end if;
  local_signed_at := signed_at_value at time zone 'Asia/Ho_Chi_Minh';
  earliest_confirmation_at :=
    session_row.schedule_date + session_row.end_time - interval '1 hour';
  if local_signed_at < earliest_confirmation_at then
    raise exception 'Chỉ được xác nhận từ %.',
      to_char(earliest_confirmation_at, 'HH24:MI DD/MM/YYYY')
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.basic_medical_session_confirmations
    where session_id = target_session_id and invalidated_at is null
  ) then
    raise exception 'Buổi học đã được xác nhận.' using errcode = '23505';
  end if;

  select count(*)::integer into inventory_count
  from public.basic_medical_room_inventory as inventory
  join public.basic_medical_equipment_catalog as catalog
    on catalog.id = inventory.catalog_item_id
  where inventory.room_id = session_row.room_id
    and inventory.is_active
    and catalog.is_active;

  if jsonb_array_length(target_checks) <> inventory_count
    or exists (
      select 1
      from jsonb_array_elements(target_checks) as item
      where coalesce(item->>'inventory_id', '') !~
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         or coalesce(item->>'newly_damaged_quantity', '') !~ '^\d+$'
    )
    or (
      select count(distinct item->>'inventory_id')
      from jsonb_array_elements(target_checks) as item
    ) <> inventory_count
    or exists (
      select 1
      from jsonb_array_elements(target_checks) as item
      left join public.basic_medical_room_inventory as inventory
        on inventory.id = (item->>'inventory_id')::uuid
       and inventory.room_id = session_row.room_id
       and inventory.is_active
      left join public.basic_medical_equipment_catalog as catalog
        on catalog.id = inventory.catalog_item_id and catalog.is_active
      where inventory.id is null or catalog.id is null
    ) then
    raise exception 'Danh sách tình trạng thiết bị không khớp với phòng.' using errcode = '22023';
  end if;

  insert into public.basic_medical_session_confirmations (
    session_id, registration_id_snapshot, class_schedule_id_snapshot,
    signer_id, signature_data, schedule_date_snapshot,
    start_time_snapshot, end_time_snapshot, room_id_snapshot,
    teaching_lecturer_id_snapshot, signed_at
  ) values (
    session_row.id, session_row.registration_id, session_row.class_schedule_id,
    actor_id, target_signature_data, session_row.schedule_date,
    session_row.start_time, session_row.end_time, session_row.room_id,
    session_row.teaching_lecturer_id, signed_at_value
  ) returning id into confirmation_id_value;

  for inventory_row in
    select inventory.*, catalog.item_name, catalog.commercial_name, catalog.unit
    from public.basic_medical_room_inventory as inventory
    join public.basic_medical_equipment_catalog as catalog
      on catalog.id = inventory.catalog_item_id
    where inventory.room_id = session_row.room_id
      and inventory.is_active
      and catalog.is_active
    order by inventory.id
    for update of inventory
  loop
    select (item->>'newly_damaged_quantity')::integer
    into newly_damaged
    from jsonb_array_elements(target_checks) as item
    where (item->>'inventory_id')::uuid = inventory_row.id;

    if newly_damaged is null or newly_damaged < 0
      or newly_damaged > inventory_row.good_quantity then
      raise exception 'Số lượng hư mới của % không hợp lệ.', inventory_row.item_name
        using errcode = '22023';
    end if;

    insert into public.basic_medical_session_equipment_checks (
      confirmation_id, inventory_id, item_name_snapshot,
      commercial_name_snapshot, unit_snapshot, total_before,
      good_before, damaged_before, newly_damaged_quantity,
      good_after, damaged_after
    ) values (
      confirmation_id_value, inventory_row.id, inventory_row.item_name,
      inventory_row.commercial_name, inventory_row.unit,
      inventory_row.total_quantity, inventory_row.good_quantity,
      inventory_row.damaged_quantity, newly_damaged,
      inventory_row.good_quantity - newly_damaged,
      inventory_row.damaged_quantity + newly_damaged
    );

    if newly_damaged > 0 then
      update public.basic_medical_room_inventory
      set good_quantity = good_quantity - newly_damaged,
          damaged_quantity = damaged_quantity + newly_damaged,
          last_damage_reporter_id = actor_id,
          last_damage_reported_at = signed_at_value
      where id = inventory_row.id;

      insert into public.basic_medical_equipment_condition_logs (
        inventory_id, confirmation_id, event_type,
        total_before, good_before, damaged_before,
        total_after, good_after, damaged_after,
        quantity_delta, actor_id, note
      ) values (
        inventory_row.id, confirmation_id_value, 'damage_report',
        inventory_row.total_quantity, inventory_row.good_quantity,
        inventory_row.damaged_quantity, inventory_row.total_quantity,
        inventory_row.good_quantity - newly_damaged,
        inventory_row.damaged_quantity + newly_damaged,
        newly_damaged, actor_id,
        'Giảng viên báo hư khi xác nhận buổi học.'
      );

      damaged_items := damaged_items || jsonb_build_array(jsonb_build_object(
        'inventory_id', inventory_row.id,
        'item_name', inventory_row.item_name,
        'commercial_name', inventory_row.commercial_name,
        'unit', inventory_row.unit,
        'newly_damaged_quantity', newly_damaged,
        'good_quantity', inventory_row.good_quantity - newly_damaged,
        'damaged_quantity', inventory_row.damaged_quantity + newly_damaged
      ));
    end if;
  end loop;

  if jsonb_array_length(damaged_items) > 0 then
    perform private.enqueue_basic_medical_damage_outbox_event(confirmation_id_value, actor_id);
  end if;

  return jsonb_build_object(
    'confirmation_id', confirmation_id_value,
    'signed_at', signed_at_value,
    'room_id', session_row.room_id,
    'room_code', session_row.room_code,
    'room_name', session_row.room_name,
    'building_code', session_row.building_code,
    'damaged_items', damaged_items
  );
end;
$$;
revoke all on function public.confirm_basic_medical_session(uuid, text, jsonb) from public, anon;
grant execute on function public.confirm_basic_medical_session(uuid, text, jsonb) to authenticated;
