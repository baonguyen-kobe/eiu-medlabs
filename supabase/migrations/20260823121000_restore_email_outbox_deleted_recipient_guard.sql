-- Preserve durable outbox processing when a recipient profile was deleted.

create or replace function public.process_email_outbox_events(batch_size integer default 25)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  evt record;
  recipient record;
  processed_count integer := 0;
  notification_type_value text;
  fixed_subject text;
  recipient_subject text;
  base_subject text;
  recipient_id_value uuid;
  recipient_email_value text;
  notification_payload jsonb;
  is_equipment_request boolean;
  is_suppressed boolean;
begin
  for evt in (
    with candidates as (
      select id from public.email_outbox_events
      where status = 'pending' or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
      order by created_at, id
      for update skip locked
      limit greatest(1, least(coalesce(batch_size, 25), 100))
    ), claimed as (
      update public.email_outbox_events event_row
      set status = 'processing', attempts = event_row.attempts + 1, processing_started_at = now()
      from candidates where event_row.id = candidates.id returning event_row.*
    ) select * from claimed
  ) loop
    is_equipment_request := evt.domain = 'equipment_request';
    fixed_subject := null;
    if evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created','class_schedule_import_summary','class_schedule_rescheduled','skills_lab_deleted') then
      notification_type_value := evt.event_type;
      fixed_subject := private.format_skills_lab_email_subject(evt.event_type, evt.payload);
    elsif evt.domain = 'basic_medical_registration' then
      notification_type_value := concat('basic_medical_registration_', evt.event_type);
      fixed_subject := private.format_basic_medical_registration_subject(evt.event_type, evt.payload);
    elsif evt.domain = 'basic_medical_damage' then
      notification_type_value := 'basic_medical_room_equipment_damaged';
      fixed_subject := private.format_basic_medical_damage_subject(evt.payload);
    elsif evt.domain = 'basic_medical_schedule' then
      notification_type_value := case when evt.event_type = 'schedule_cancelled' then 'class_schedule_basic_medical_cancelled' else 'class_schedule_basic_medical_updated' end;
      fixed_subject := case when evt.event_type = 'schedule_cancelled' then concat('[MedLabs Calendar] Hủy lịch Y cơ sở · ', evt.payload->>'course_code') else concat('[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · ', evt.payload->>'course_code') end;
    else
      notification_type_value := concat('equipment_request_', evt.event_type);
      is_equipment_request := true;
      base_subject := concat(evt.payload->>'registrant_name', ' - ', to_char((evt.payload->>'schedule_date')::date, 'DD/MM/YYYY'), ' - ', evt.payload->>'course_code', ' - ', evt.payload->>'request_code');
    end if;

    is_suppressed := evt.delivery_mode_at_event = 'off';
    for recipient in select * from jsonb_to_recordset(evt.recipients) as item(recipient_id uuid,recipient_email text,audience text,id uuid,email text) loop
      recipient_id_value := coalesce(recipient.recipient_id, recipient.id);
      recipient_email_value := coalesce(recipient.recipient_email, recipient.email);
      if recipient_id_value is null or recipient_email_value is null then continue; end if;
      if not exists (select 1 from public.profiles where id = recipient_id_value) then continue; end if;
      recipient_subject := case when is_equipment_request then private.format_equipment_email_subject(evt.event_type, coalesce(recipient.audience, 'registrant'), base_subject, coalesce(evt.payload->>'request_domain', 'nursing_skills')) else fixed_subject end;
      notification_payload := case when is_equipment_request then jsonb_set(evt.payload, '{audience}', to_jsonb(coalesce(recipient.audience, 'registrant'))) else evt.payload end;
      insert into public.email_notifications(notification_type,recipient_id,recipient_email,dedupe_key,subject,payload,delivery_mode_at_enqueue,status,last_error)
      values(notification_type_value,recipient_id_value,recipient_email_value,concat('outbox_notif:',evt.id,':',recipient_id_value),recipient_subject,notification_payload,case when is_suppressed then 'off' else evt.delivery_mode_at_event end,case when is_suppressed then 'suppressed' else 'pending' end,case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end)
      on conflict(dedupe_key) do nothing;
    end loop;
    update public.email_outbox_events
    set status = case when is_suppressed then 'suppressed' else 'processed' end,
        processed_at = now(),
        last_error = case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end
    where id = evt.id;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;
revoke all on function public.process_email_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.process_email_outbox_events(integer) to service_role;
