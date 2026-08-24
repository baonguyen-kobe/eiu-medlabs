-- Phase 3B: transactional operational bell notifications, lifecycle audit,
-- and domain-normalized email presentation.  This migration deliberately
-- observes the existing equipment workflow; it does not define a new state.

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  domain text not null check (btrim(domain) <> ''),
  notification_type text not null check (btrim(notification_type) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  href text,
  dedupe_key text not null unique check (btrim(dedupe_key) <> ''),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index user_notifications_recipient_created_idx
  on public.user_notifications(recipient_id, created_at desc);
create index user_notifications_recipient_unread_idx
  on public.user_notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public, anon, authenticated;
grant select on public.user_notifications to authenticated;
grant update(read_at) on public.user_notifications to authenticated;

create policy user_notifications_recipient_select on public.user_notifications
for select to authenticated using (recipient_id = (select auth.uid()));
create policy user_notifications_recipient_mark_read on public.user_notifications
for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_notifications'
    ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end;
$$;

create or replace function private.equipment_notification_status_label(target_status text)
returns text language sql stable security definer set search_path = '' as $$
  select case target_status
    when 'new' then 'Mới'
    when 'preparing' then 'Đã soạn'
    when 'handed_over' then 'Đã giao'
    when 'returned' then 'Đã trả'
    when 'completed' then 'Hoàn thành'
    when 'cancelled' then 'Đã hủy'
    else coalesce(target_status, '') end;
$$;

create or replace function private.notify_equipment_request_recipients(
  target_request_id uuid,
  target_notification_type text,
  target_title text,
  target_body text,
  include_participants boolean,
  include_management boolean,
  target_actor_id uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.equipment_requests%rowtype;
  inserted_count integer := 0;
begin
  target_actor_id := coalesce(target_actor_id, (select auth.uid()));
  select * into request_row from public.equipment_requests where id = target_request_id;
  if request_row.id is null then return 0; end if;

  with candidates as (
    select request_row.registrant_id as recipient_id, 'participant'::text as audience
    where include_participants and request_row.registrant_id is not null
    union all
    select request_row.responsible_lecturer_id, 'participant'::text
    where include_participants
      and request_row.responsible_lecturer_id is not null
    union all
    select profiles.id, 'manager'::text
    from public.profiles
    join public.user_roles roles on roles.user_id = profiles.id
    join public.class_schedules schedules on schedules.id = request_row.class_schedule_id
    join public.rooms rooms on rooms.id = schedules.room_id
    where include_management
      and profiles.is_active
      and (
        roles.role = 'admin'
        or (
          roles.role = 'staff'
          and exists (
            select 1 from public.profile_room_types scopes
            where scopes.profile_id = profiles.id
              and scopes.room_type_id = rooms.room_type_id
          )
        )
      )
  ), deduped as (
    select distinct on (candidates.recipient_id)
      candidates.recipient_id, candidates.audience
    from candidates
    join public.profiles profiles on profiles.id = candidates.recipient_id
      and profiles.is_active
    where candidates.recipient_id is distinct from target_actor_id
    order by candidates.recipient_id,
      case candidates.audience when 'manager' then 0 else 1 end
  ), inserted as (
    insert into public.user_notifications(
      recipient_id, actor_id, domain, notification_type, entity_type, entity_id,
      title, body, href, dedupe_key, metadata
    )
    select
      recipient_id,
      target_actor_id,
      request_row.request_domain::text,
      target_notification_type,
      'equipment_request',
      target_request_id,
      target_title,
      target_body,
      case when audience = 'manager'
        then concat('/equipment/requests?request=', target_request_id)
        when request_row.request_domain = 'basic_medical'
          then concat('/basic-medical/equipment-requests?request=', target_request_id)
        else concat('/equipment/mine?request=', target_request_id)
      end,
      concat('equipment_request:', target_request_id, ':', target_notification_type,
        ':', txid_current(), ':', recipient_id),
      coalesce(target_metadata, '{}'::jsonb) || jsonb_build_object('audience', audience)
    from deduped
    on conflict (dedupe_key) do nothing
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;
revoke all on function private.notify_equipment_request_recipients(uuid,text,text,text,boolean,boolean,uuid,jsonb)
from public, anon, authenticated;

create or replace function private.observe_equipment_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
  notification_type_value text;
  notification_title text;
  notification_body text;
  include_participants boolean := false;
  include_management boolean := false;
  transition_kind text := 'forward';
  old_status jsonb := jsonb_build_object('status', old.status);
  new_status jsonb := jsonb_build_object('status', new.status);
begin
  -- Cancellation and hard deletion already have their own semantic audits.
  if new.status = 'cancelled' or old.status = 'cancelled' then return new; end if;

  if old.handover_staff_confirmed_at is null and new.handover_staff_confirmed_at is not null then
    audit_action := 'equipment_request.handover_staff_confirmed';
    if new.status = 'handed_over' then
      notification_type_value := 'handover_completed';
      notification_title := 'Đã hoàn tất xác nhận giao thiết bị';
      notification_body := 'Phiếu đã đủ xác nhận và chuyển sang Đã giao.';
    else
      notification_type_value := 'handover_waiting_recipient';
      notification_title := 'Thiết bị đang chờ xác nhận nhận';
      notification_body := 'Kho đã xác nhận giao thiết bị. Vui lòng mở phiếu để ký xác nhận nhận thiết bị.';
    end if;
    include_participants := true;
  elsif old.handover_recipient_signed_at is null and new.handover_recipient_signed_at is not null then
    audit_action := 'equipment_request.handover_recipient_signed';
    if new.status = 'handed_over' then
      notification_type_value := 'handover_completed';
      notification_title := 'Đã hoàn tất xác nhận giao thiết bị';
      notification_body := 'Phiếu đã đủ xác nhận và chuyển sang Đã giao.';
      include_management := true;
    end if;
  elsif old.return_staff_confirmed_at is null and new.return_staff_confirmed_at is not null then
    audit_action := 'equipment_request.return_staff_confirmed';
    if new.status = 'completed' then
      notification_type_value := 'return_completed';
      notification_title := 'Phiếu thiết bị đã hoàn tất';
      notification_body := 'Đã đủ xác nhận trả thiết bị và phiếu đã được hoàn thành.';
    else
      notification_type_value := 'return_waiting_recipient';
      notification_title := 'Thiết bị đang chờ xác nhận trả';
      notification_body := 'Kho đã xác nhận bước trả thiết bị. Vui lòng mở phiếu để hoàn tất xác nhận trả.';
    end if;
    include_participants := true;
  elsif old.return_recipient_signed_at is null and new.return_recipient_signed_at is not null then
    audit_action := 'equipment_request.return_recipient_signed';
    if new.status = 'completed' then
      notification_type_value := 'return_completed';
      notification_title := 'Phiếu thiết bị đã hoàn tất';
      notification_body := 'Đã đủ xác nhận trả thiết bị và phiếu đã được hoàn thành.';
    else
      notification_type_value := 'return_waiting_management';
      notification_title := 'Người nhận đã xác nhận trả thiết bị';
      notification_body := 'Phiếu đang chờ bộ phận phụ trách xác nhận bước trả thiết bị.';
    end if;
    include_management := true;
  elsif old.status is distinct from new.status then
    audit_action := 'equipment_request.status_changed';
    if old.status = 'new' and new.status = 'preparing' then
      notification_type_value := 'prepared';
      notification_title := 'Thiết bị đã được soạn';
      notification_body := 'Phiếu thiết bị đã chuyển sang Đã soạn và sẵn sàng cho bước giao.';
      include_participants := true;
    elsif (case old.status when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2 when 'returned' then 3 when 'completed' then 4 end)
      > (case new.status when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2 when 'returned' then 3 when 'completed' then 4 end) then
      transition_kind := 'rollback';
      notification_type_value := 'status_rollback';
      notification_title := 'Trạng thái phiếu đã được điều chỉnh';
      notification_body := concat('Phiếu đã chuyển từ ', private.equipment_notification_status_label(old.status), ' về ', private.equipment_notification_status_label(new.status), '.');
      include_participants := true;
      include_management := true;
    end if;
  else
    return new;
  end if;

  if audit_action is null then return new; end if;
  perform private.write_audit(
    audit_action,
    'equipment_request',
    new.id,
    old_status,
    new_status,
    jsonb_build_object(
      'request_domain', new.request_domain,
      'transition', transition_kind
    )
  );
  if notification_type_value is not null then
    perform private.notify_equipment_request_recipients(
      new.id, notification_type_value, notification_title, notification_body,
      include_participants, include_management, (select auth.uid()),
      jsonb_build_object('old_status', old.status, 'new_status', new.status)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.observe_equipment_request_lifecycle() from public, anon, authenticated;

drop trigger if exists equipment_requests_lifecycle_observer on public.equipment_requests;
create trigger equipment_requests_lifecycle_observer
after update of status, handover_staff_confirmed_at, handover_recipient_signed_at,
  return_staff_confirmed_at, return_recipient_signed_at
on public.equipment_requests
for each row execute function private.observe_equipment_request_lifecycle();

create or replace function public.list_equipment_request_lifecycle_audit(target_request_id uuid)
returns table(
  created_at timestamptz,
  action text,
  actor_id uuid,
  actor_name text,
  old_status text,
  new_status text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.equipment_requests where id = target_request_id) then
    raise exception 'EQUIPMENT_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (select private.can_manage_equipment_request(target_request_id)) then
    raise exception 'EQUIPMENT_REQUEST_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  return query
  select logs.created_at, logs.action, logs.actor_id, profiles.full_name,
    logs.old_data ->> 'status', logs.new_data ->> 'status',
    jsonb_build_object(
      'request_domain', logs.metadata ->> 'request_domain',
      'transition', logs.metadata ->> 'transition'
    )
  from public.audit_logs logs
  left join public.profiles profiles on profiles.id = logs.actor_id
  where logs.entity_type = 'equipment_request'
    and logs.entity_id = target_request_id
    and logs.action in (
      'equipment_request.status_changed',
      'equipment_request.handover_staff_confirmed',
      'equipment_request.handover_recipient_signed',
      'equipment_request.return_staff_confirmed',
      'equipment_request.return_recipient_signed',
      'equipment_request.cancelled',
      'equipment_request.hard_deleted'
    )
  order by logs.created_at desc, logs.id desc;
end;
$$;
revoke all on function public.list_equipment_request_lifecycle_audit(uuid) from public, anon;
grant execute on function public.list_equipment_request_lifecycle_audit(uuid) to authenticated;

-- Keep the first late-approval email, but turn repeated pending edits into a
-- durable in-app update for the same stakeholders.
create or replace function private.suppress_repeated_late_equipment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.equipment_requests%rowtype;
begin
  if new.domain <> 'equipment_request' or new.event_type <> 'late_approval_requested' then
    return new;
  end if;
  select * into request_row from public.equipment_requests where id = new.aggregate_id;
  if request_row.id is null or request_row.late_approval_status <> 'pending' then
    return new;
  end if;
  if exists (
    select 1 from public.email_outbox_events events
    where events.domain = 'equipment_request'
      and events.aggregate_id = new.aggregate_id
      and events.event_type = 'late_approval_requested'
  ) then
    perform private.notify_equipment_request_recipients(
      request_row.id,
      'late_pending_updated',
      'Phiếu chờ duyệt đăng ký trễ đã được cập nhật',
      'Phiếu đăng ký thiết bị đang chờ duyệt đăng ký trễ vừa được điều chỉnh.',
      true, true, new.actor_id,
      jsonb_build_object('late_approval_status', 'pending')
    );
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.suppress_repeated_late_equipment_email() from public, anon, authenticated;
drop trigger if exists email_outbox_suppress_repeated_late_equipment_email on public.email_outbox_events;
create trigger email_outbox_suppress_repeated_late_equipment_email
before insert on public.email_outbox_events
for each row execute function private.suppress_repeated_late_equipment_email();

create or replace function private.format_skills_lab_email_subject(
  target_event_type text,
  target_payload jsonb,
  target_audience text
)
returns text language plpgsql stable security definer set search_path = '' as $$
declare prefix text := case when target_audience = 'admin' then '[Admin MedLabs Calendar]' else '[MedLabs Calendar]' end;
declare course_code text := coalesce(target_payload->>'course_code', '');
declare imported_rows text := coalesce(target_payload->>'imported_rows', '0');
declare lecturer_name text := coalesce(nullif(target_payload->>'lecturer', ''), nullif(target_payload->>'actor', ''), 'Giảng viên');
declare schedule_date text := '';
declare record_code text := coalesce(nullif(target_payload->>'request_code', ''), nullif(target_payload->>'record_code', ''));
declare identifying_tail text;
begin
  if nullif(target_payload->>'schedule_date', '') is not null then
    schedule_date := to_char((target_payload->>'schedule_date')::date, 'DD/MM/YYYY');
  end if;
  identifying_tail := concat_ws(' - ', lecturer_name, nullif(schedule_date, ''), nullif(course_code, ''), nullif(record_code, ''));
  if target_event_type = 'class_schedule_created' then return concat(prefix, '[Skills Lab][New] Lịch Skills Lab mới - ', identifying_tail); end if;
  if target_event_type = 'class_schedule_import_summary' then return concat(prefix, '[Skills Lab][Import] Cập nhật lịch sử import - ', imported_rows, ' lịch mới'); end if;
  if target_event_type = 'class_schedule_rescheduled' then return concat(prefix, '[Skills Lab][Adjusted] Đổi ngày học - ', identifying_tail); end if;
  if target_event_type = 'skills_lab_deleted' then return concat(prefix, '[Skills Lab][Deleted] Xóa lịch Skills Lab - ', concat_ws(' - ', nullif(course_code, ''), nullif(schedule_date, ''), nullif(record_code, ''))); end if;
  return concat(prefix, '[Skills Lab][New] Lịch Skills Lab - ', course_code);
end;
$$;
revoke all on function private.format_skills_lab_email_subject(text,jsonb,text) from public, anon, authenticated;
create or replace function private.format_skills_lab_email_subject(
  target_event_type text,
  target_payload jsonb
)
returns text language sql stable security definer set search_path = '' as $$
  select private.format_skills_lab_email_subject(target_event_type, target_payload, 'registrant');
$$;
revoke all on function private.format_skills_lab_email_subject(text,jsonb) from public, anon, authenticated;

create or replace function private.format_basic_medical_registration_subject(
  target_event_type text,
  target_payload jsonb,
  target_audience text
)
returns text language plpgsql stable security definer set search_path = '' as $$
declare prefix text := case when target_audience = 'admin' then '[Admin MedLabs Calendar]' else '[MedLabs Calendar]' end;
declare course_code text := coalesce(target_payload->>'course_code', '');
declare registrant_name text := coalesce(nullif(target_payload->>'registrant_name', ''), 'Giảng viên');
declare start_date text := '';
declare end_date text := '';
declare registration_code text := coalesce(nullif(target_payload->>'registration_code', ''), '');
declare date_range text;
declare identifying_tail text;
begin
  if nullif(target_payload->>'start_date', '') is not null then
    start_date := to_char((target_payload->>'start_date')::date, 'DD/MM/YYYY');
  end if;
  if nullif(target_payload->>'end_date', '') is not null then
    end_date := to_char((target_payload->>'end_date')::date, 'DD/MM/YYYY');
  end if;
  date_range := case when start_date = '' then '' when end_date = '' or end_date = start_date then start_date else concat(start_date, ' - ', end_date) end;
  identifying_tail := concat_ws(' - ', registrant_name, nullif(course_code, ''), nullif(date_range, ''), nullif(registration_code, ''));
  if target_event_type = 'created' then return concat(prefix, '[Y cơ sở][New] Có Phiếu Y cơ sở mới - ', identifying_tail); end if;
  if target_event_type = 'updated' then return concat(prefix, '[Y cơ sở][Adjusted] Điều chỉnh Phiếu Y cơ sở - ', identifying_tail); end if;
  if target_event_type = 'cancelled' then return concat(prefix, '[Y cơ sở][Cancelled] Hủy Phiếu Y cơ sở - ', identifying_tail); end if;
  return concat(prefix, '[Y cơ sở][New] Phiếu Y cơ sở - ', course_code);
end;
$$;
revoke all on function private.format_basic_medical_registration_subject(text,jsonb,text) from public, anon, authenticated;
create or replace function private.format_basic_medical_registration_subject(
  target_event_type text,
  target_payload jsonb
)
returns text language sql stable security definer set search_path = '' as $$
  select private.format_basic_medical_registration_subject(target_event_type, target_payload, 'registrant');
$$;
revoke all on function private.format_basic_medical_registration_subject(text,jsonb) from public, anon, authenticated;

create or replace function private.format_basic_medical_damage_subject(
  target_payload jsonb,
  target_audience text
)
returns text language plpgsql stable security definer set search_path = '' as $$
declare prefix text := case when target_audience = 'admin' then '[Admin MedLabs Calendar]' else '[MedLabs Calendar]' end;
declare room_label text := concat_ws(' ', nullif(btrim(target_payload->>'room_code'), ''), nullif(btrim(target_payload->>'room_name'), ''));
begin
  return concat(prefix, '[Y cơ sở][Alert] Thiết bị phòng ', room_label, ' được báo Hư');
end;
$$;
revoke all on function private.format_basic_medical_damage_subject(jsonb,text) from public, anon, authenticated;

create or replace function private.format_equipment_email_subject(
  target_event text, target_audience text, base_subject text
)
returns text language sql stable security definer set search_path = '' as $$
  select private.format_equipment_email_subject(target_event, target_audience, base_subject, 'nursing_skills');
$$;
create or replace function private.format_equipment_email_subject(
  target_event text, target_audience text, base_subject text, target_request_domain text
)
returns text language plpgsql stable security definer set search_path = '' as $$
declare prefix text := case when target_audience = 'admin' then '[Admin MedLabs Calendar]' else '[MedLabs Calendar]' end;
declare domain_label text := case when target_request_domain = 'basic_medical' then '[Y cơ sở]' else '[Skills Lab]' end;
declare deletion_event text := case when target_request_domain = 'basic_medical' then '[Cancelled] Hủy phiếu đăng ký thiết bị - ' else '[Deleted] Xóa phiếu đăng ký thiết bị - ' end;
begin
  if target_event = 'created' then
    return concat(prefix, domain_label, '[New] ', case when target_audience = 'admin' then 'Có đăng ký trang thiết bị mới - ' else 'Xác nhận đăng ký trang thiết bị - ' end, base_subject);
  end if;
  if target_event = 'updated' then return concat(prefix, domain_label, '[Adjusted] Điều chỉnh phiếu đăng ký thiết bị - ', base_subject); end if;
  if target_event = 'deleted' then return concat(prefix, domain_label, deletion_event, base_subject); end if;
  if target_event = 'late_approval_requested' then return concat(prefix, domain_label, '[Late] ', case when target_audience = 'admin' then 'Có phiếu chờ duyệt đăng ký trễ - ' else 'Gửi phiếu đăng ký thiết bị trễ - ' end, base_subject); end if;
  if target_event = 'late_approval_approved' then return concat(prefix, domain_label, '[Late] Đã duyệt đăng ký trễ - ', base_subject); end if;
  return concat(prefix, domain_label, '[Late] Từ chối đăng ký trễ - ', base_subject);
end;
$$;
revoke all on function private.format_equipment_email_subject(text,text,text) from public, anon, authenticated;
revoke all on function private.format_equipment_email_subject(text,text,text,text) from public, anon, authenticated;

create or replace function private.enqueue_basic_medical_damage_outbox_event(
  target_confirmation_id uuid, actor_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mode_val text := 'off'; conf_row record; items_json jsonb := '[]'::jsonb;
declare payload_val jsonb; recipients_val jsonb := '[]'::jsonb; event_key_val text; outbox_id uuid;
declare actor_name text := 'Người dùng hệ thống'; basic_medical_room_type_id uuid;
begin
  select coalesce(delivery_mode, 'off') into mode_val from public.email_delivery_settings where setting_key = 'primary';
  select id into basic_medical_room_type_id from public.room_types where code = 'basic_medical' limit 1;
  select coalesce(full_name, actor_name) into actor_name from public.profiles where id = actor_id;
  select confirmations.id, confirmations.session_id, confirmations.signed_at,
    confirmations.schedule_date_snapshot, confirmations.start_time_snapshot,
    confirmations.end_time_snapshot, confirmations.room_id_snapshot,
    rooms.room_code, rooms.room_name, rooms.building_code,
    schedules.course_code_snapshot, schedules.course_name_snapshot,
    reporter.full_name as reporter_name, sessions.teaching_lecturer_id,
    registrations.registrant_id
  into conf_row
  from public.basic_medical_session_confirmations confirmations
  join public.basic_medical_registration_sessions sessions on sessions.id = confirmations.session_id
  join public.basic_medical_registrations registrations on registrations.id = sessions.registration_id
  left join public.rooms rooms on rooms.id = confirmations.room_id_snapshot
  left join public.class_schedules schedules on schedules.id = confirmations.class_schedule_id_snapshot
  left join public.profiles reporter on reporter.id = confirmations.signer_id
  where confirmations.id = target_confirmation_id;
  if conf_row.id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'inventory_id', checks.inventory_id, 'item_name', checks.item_name_snapshot,
    'commercial_name', checks.commercial_name_snapshot, 'unit', checks.unit_snapshot,
    'newly_damaged_quantity', checks.newly_damaged_quantity, 'good_quantity', checks.good_after,
    'damaged_quantity', checks.damaged_after) order by checks.id), '[]'::jsonb)
  into items_json from public.basic_medical_session_equipment_checks checks
  where checks.confirmation_id = target_confirmation_id and checks.newly_damaged_quantity > 0;
  if jsonb_array_length(items_json) = 0 then return null; end if;
  payload_val := jsonb_build_object(
    'confirmation_id', conf_row.id, 'room_code', coalesce(conf_row.room_code, ''),
    'room_name', coalesce(conf_row.room_name, ''), 'building_code', coalesce(conf_row.building_code, ''),
    'reporter_name', coalesce(conf_row.reporter_name, actor_name), 'reported_at', conf_row.signed_at,
    'course_code', coalesce(conf_row.course_code_snapshot, ''), 'course_name', coalesce(conf_row.course_name_snapshot, ''),
    'schedule_date', conf_row.schedule_date_snapshot, 'start_time', conf_row.start_time_snapshot,
    'end_time', conf_row.end_time_snapshot, 'items', items_json);
  with candidates as (
    select profiles.id, lower(btrim(profiles.email)) as email, 'admin'::text as audience
    from public.profiles profiles join public.user_roles roles on roles.user_id = profiles.id
    where profiles.is_active and profiles.email like '%@%' and roles.role = 'admin'
    union all
    select profiles.id, lower(btrim(profiles.email)), 'admin'::text
    from public.profiles profiles join public.user_roles roles on roles.user_id = profiles.id
    where profiles.is_active and profiles.email like '%@%' and roles.role = 'staff'
      and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = basic_medical_room_type_id)
    union all
    select profiles.id, lower(btrim(profiles.email)), 'registrant'::text
    from public.profiles profiles where profiles.id = conf_row.registrant_id and profiles.is_active and profiles.email like '%@%'
    union all
    select profiles.id, lower(btrim(profiles.email)), 'lecturer'::text
    from public.profiles profiles where profiles.id = conf_row.teaching_lecturer_id and profiles.is_active and profiles.email like '%@%'
  ), deduped as (
    select distinct on (id) id, email, audience from candidates
    order by id, case audience when 'admin' then 0 when 'registrant' then 1 else 2 end
  ) select coalesce(jsonb_agg(jsonb_build_object('recipient_id', id, 'recipient_email', email, 'audience', audience)), '[]'::jsonb)
  into recipients_val from deduped;
  event_key_val := concat('basic_medical:damage:', target_confirmation_id);
  insert into public.email_outbox_events(domain,event_type,event_key,payload,recipients,delivery_mode_at_event,status)
  values ('basic_medical_damage','damage_reported',event_key_val,payload_val,recipients_val,coalesce(mode_val, 'off'),'pending')
  on conflict (event_key) do nothing returning id into outbox_id;
  return outbox_id;
end;
$$;
revoke all on function private.enqueue_basic_medical_damage_outbox_event(uuid,uuid) from public, anon, authenticated;

create or replace function public.process_email_outbox_events(batch_size integer default 25)
returns integer language plpgsql security definer set search_path = '' as $$
declare evt record; recipient record; processed_count integer := 0; notification_type_value text;
  fixed_subject text; recipient_subject text; base_subject text; recipient_id_value uuid;
  recipient_email_value text; recipient_audience text; notification_payload jsonb;
  is_equipment_request boolean; is_suppressed boolean;
begin
  for evt in (
    with candidates as (
      select id from public.email_outbox_events
      where status = 'pending' or (status = 'processing' and processing_started_at < now() - interval '10 minutes')
      order by created_at, id for update skip locked
      limit greatest(1, least(coalesce(batch_size, 25), 100))
    ), claimed as (
      update public.email_outbox_events event_row set status = 'processing', attempts = event_row.attempts + 1, processing_started_at = now()
      from candidates where event_row.id = candidates.id returning event_row.*
    ) select * from claimed
  ) loop
    is_equipment_request := evt.domain = 'equipment_request'; fixed_subject := null;
    if evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created','class_schedule_import_summary','class_schedule_rescheduled','skills_lab_deleted') then
      notification_type_value := evt.event_type;
    elsif evt.domain = 'basic_medical_registration' then notification_type_value := concat('basic_medical_registration_', evt.event_type);
    elsif evt.domain = 'basic_medical_damage' then notification_type_value := 'basic_medical_room_equipment_damaged';
    elsif evt.domain = 'basic_medical_schedule' then notification_type_value := case when evt.event_type = 'schedule_cancelled' then 'class_schedule_basic_medical_cancelled' else 'class_schedule_basic_medical_updated' end;
    else
      notification_type_value := concat('equipment_request_', evt.event_type); is_equipment_request := true;
      base_subject := concat(evt.payload->>'registrant_name', ' - ', to_char((evt.payload->>'schedule_date')::date, 'DD/MM/YYYY'), ' - ', evt.payload->>'course_code', ' - ', evt.payload->>'request_code');
    end if;
    is_suppressed := evt.delivery_mode_at_event = 'off';
    for recipient in select * from jsonb_to_recordset(evt.recipients) as item(recipient_id uuid,recipient_email text,audience text,id uuid,email text) loop
      recipient_id_value := coalesce(recipient.recipient_id, recipient.id);
      recipient_email_value := coalesce(recipient.recipient_email, recipient.email);
      if recipient_id_value is null or recipient_email_value is null then continue; end if;
      if not exists (select 1 from public.profiles where id = recipient_id_value) then continue; end if;
      recipient_audience := coalesce(recipient.audience, case when exists (select 1 from public.user_roles roles where roles.user_id = recipient_id_value and roles.role in ('admin','staff')) then 'admin' else 'registrant' end);
      if is_equipment_request then
        recipient_subject := private.format_equipment_email_subject(evt.event_type, recipient_audience, base_subject, coalesce(evt.payload->>'request_domain', 'nursing_skills'));
        notification_payload := jsonb_set(evt.payload, '{audience}', to_jsonb(recipient_audience));
      elsif evt.domain ilike 'skills_lab%' or evt.event_type in ('class_schedule_created','class_schedule_import_summary','class_schedule_rescheduled','skills_lab_deleted') then
        recipient_subject := private.format_skills_lab_email_subject(evt.event_type, evt.payload, recipient_audience); notification_payload := evt.payload;
      elsif evt.domain = 'basic_medical_registration' then
        recipient_subject := private.format_basic_medical_registration_subject(evt.event_type, evt.payload, recipient_audience); notification_payload := evt.payload;
      elsif evt.domain = 'basic_medical_damage' then
        recipient_subject := private.format_basic_medical_damage_subject(evt.payload, recipient_audience); notification_payload := jsonb_set(evt.payload, '{audience}', to_jsonb(recipient_audience));
      else
        recipient_subject := concat(case when recipient_audience = 'admin' then '[Admin MedLabs Calendar]' else '[MedLabs Calendar]' end,
          '[Y cơ sở]', case when evt.event_type = 'schedule_cancelled' then '[Cancelled] Hủy lịch Y cơ sở - ' else '[Adjusted] Điều chỉnh lịch Y cơ sở - ' end,
          coalesce(evt.payload->>'course_code', '')); notification_payload := evt.payload;
      end if;
      insert into public.email_notifications(notification_type,recipient_id,recipient_email,dedupe_key,subject,payload,delivery_mode_at_enqueue,status,last_error)
      values(notification_type_value,recipient_id_value,recipient_email_value,concat('outbox_notif:',evt.id,':',recipient_id_value),recipient_subject,notification_payload,case when is_suppressed then 'off' else evt.delivery_mode_at_event end,case when is_suppressed then 'suppressed' else 'pending' end,case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end)
      on conflict(dedupe_key) do nothing;
    end loop;
    update public.email_outbox_events set status = case when is_suppressed then 'suppressed' else 'processed' end, processed_at = now(), last_error = case when is_suppressed then 'Email được tạo khi chế độ gửi đang tắt.' else null end where id = evt.id;
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end;
$$;
revoke all on function public.process_email_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.process_email_outbox_events(integer) to service_role;
