create extension if not exists pgcrypto with schema extensions;

alter type public.import_status add value if not exists 'completed_with_errors';
alter type public.import_row_status add value if not exists 'conflict';
alter type public.import_row_status add value if not exists 'system_error';
alter table public.import_batches
  add column if not exists conflict_rows integer not null default 0
  check (conflict_rows >= 0);

-- A queued email keeps the delivery mode that existed when it was created.
-- Existing unsent rows are deliberately suppressed because their original mode
-- cannot be proven during a rolling upgrade.
alter table public.email_notifications
  add column if not exists delivery_mode_at_enqueue text,
  add column if not exists provider_succeeded_at timestamptz,
  add column if not exists acknowledgement_error text;

update public.email_notifications
set delivery_mode_at_enqueue = case
  when status in ('sent', 'simulated') then case when status = 'simulated' then 'test' else 'live' end
  else 'off'
end
where delivery_mode_at_enqueue is null;

update public.email_notifications
set status = 'suppressed', processing_started_at = null,
    last_error = 'Đã dừng an toàn khi nâng cấp vì không xác định được chế độ gửi lúc tạo.'
where delivery_mode_at_enqueue = 'off' and status in ('pending', 'processing', 'failed');

alter table public.email_notifications
  alter column delivery_mode_at_enqueue set default 'off',
  alter column delivery_mode_at_enqueue set not null,
  add constraint email_notifications_delivery_mode_snapshot_valid
    check (delivery_mode_at_enqueue in ('off', 'test', 'live'));

alter table public.email_notifications drop constraint if exists email_notifications_status_valid;
alter table public.email_notifications add constraint email_notifications_status_valid check (
  status in ('pending', 'processing', 'sent', 'sent_unconfirmed', 'simulated', 'suppressed', 'failed')
);

create or replace function private.snapshot_email_delivery_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_mode text;
begin
  select settings.delivery_mode into selected_mode
  from public.email_delivery_settings as settings
  where settings.setting_key = 'primary';
  new.delivery_mode_at_enqueue := case
    when selected_mode in ('test', 'live') then selected_mode else 'off' end;
  if new.delivery_mode_at_enqueue = 'off' then
    new.status := 'suppressed';
    new.last_error := 'Đã bỏ qua vì hệ thống đang tắt gửi email tại thời điểm tạo.';
  end if;
  return new;
end;
$$;

-- The old per-account capability confused "skip Đã soạn" with handing over
-- before the planned receive time. Managers may hand over early in clock time,
-- but the workflow still requires Đã soạn first for everyone.
update public.profiles set allow_early_equipment_handover = false
where allow_early_equipment_handover;

create or replace function public.manager_confirm_equipment_status(
  target_request_id uuid,
  target_status text
)
returns public.equipment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.equipment_requests;
  changed_row public.equipment_requests;
  actor_id uuid := (select auth.uid());
  current_rank integer;
  target_rank integer;
begin
  if actor_id is null or not (select private.is_active_user())
    or not ((select private.has_role('admin')) or (select private.has_role('staff'))) then
    raise exception 'Chỉ Admin hoặc Chuyên viên được chuyển trạng thái phiếu.' using errcode = '42501';
  end if;
  if target_status not in ('new','preparing','handed_over','returned','completed') then
    raise exception 'Trạng thái phiếu không hợp lệ.' using errcode = '22023';
  end if;
  select * into current_row from public.equipment_requests where id = target_request_id for update;
  if current_row.id is null then raise exception 'Không tìm thấy phiếu thiết bị.' using errcode = 'P0002'; end if;

  current_rank := case current_row.status when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2 when 'returned' then 3 when 'completed' then 4 end;
  target_rank := case target_status when 'new' then 0 when 'preparing' then 1 when 'handed_over' then 2 when 'returned' then 3 when 'completed' then 4 end;
  perform set_config('app.equipment_confirmation_rpc', 'true', true);

  if target_rank < current_rank then
    update public.equipment_requests set
      status = target_status,
      handover_staff_confirmed_by = case when target_rank >= 2 then handover_staff_confirmed_by else null end,
      handover_staff_confirmed_at = case when target_rank >= 2 then handover_staff_confirmed_at else null end,
      handover_recipient_signature = case when target_rank >= 2 then handover_recipient_signature else null end,
      handover_recipient_signed_at = case when target_rank >= 2 then handover_recipient_signed_at else null end,
      handover_effective_at = case when target_rank >= 2 then handover_effective_at else null end,
      return_staff_confirmed_by = null, return_staff_confirmed_at = null,
      return_recipient_signature = null, return_recipient_signed_at = null,
      return_effective_at = null
    where id = target_request_id returning * into changed_row;
    return changed_row;
  end if;
  if target_status = current_row.status and target_status not in ('handed_over','returned') then return current_row; end if;
  if target_status = 'preparing' then
    update public.equipment_requests set status = 'preparing' where id = target_request_id returning * into changed_row;
  elsif target_status = 'handed_over' then
    if current_row.status = 'new' then
      raise exception 'Phải chuyển phiếu sang Đã soạn trước khi xác nhận Đã giao.' using errcode = '22023';
    end if;
    update public.equipment_requests set
      handover_staff_confirmed_by = actor_id, handover_staff_confirmed_at = clock_timestamp(),
      status = case when handover_recipient_signature is not null then 'handed_over' else status end
    where id = target_request_id returning * into changed_row;
  elsif target_status = 'returned' then
    if current_row.status not in ('handed_over','returned') then
      raise exception 'Phải xác nhận đã giao trước khi xác nhận trả.' using errcode = '22023';
    end if;
    update public.equipment_requests set
      return_staff_confirmed_by = actor_id, return_staff_confirmed_at = clock_timestamp(),
      status = case when return_recipient_signature is not null then 'completed' else status end
    where id = target_request_id returning * into changed_row;
  else
    raise exception 'Trạng thái Hoàn thành chỉ được tạo khi đủ hai xác nhận trả.' using errcode = '22023';
  end if;
  return changed_row;
end;
$$;

drop trigger if exists email_notifications_snapshot_delivery_mode on public.email_notifications;
create trigger email_notifications_snapshot_delivery_mode
before insert on public.email_notifications
for each row execute function private.snapshot_email_delivery_mode();

-- Preserve operational history when recurring patterns are refreshed.
create or replace function private.materialize_shift_pattern(
  target_pattern_id uuid,
  target_horizon_end date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pattern public.staff_shift_patterns;
  materialize_from date;
  materialize_to date;
  occurrence_date date;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('medlabs:shift-pattern:' || target_pattern_id::text, 0)
  );
  select * into pattern from public.staff_shift_patterns
  where id = target_pattern_id for update;
  if pattern.id is null or not pattern.is_active then return; end if;

  materialize_from := greatest(
    pattern.effective_from,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date
  );
  materialize_to := least(pattern.effective_to, coalesce(target_horizon_end, pattern.effective_to));
  if materialize_from > materialize_to then return; end if;

  for occurrence_date in
    select generated.day_value::date
    from generate_series(materialize_from::timestamp, materialize_to::timestamp, interval '1 day') generated(day_value)
    where extract(isodow from generated.day_value)::smallint = pattern.weekday
    order by generated.day_value
  loop
    begin
      insert into public.staff_shifts (
        staff_id, shift_date, start_time, end_time, shift_type,
        shift_template_id, shift_pattern_id, note, status,
        registration_source, created_by
      ) values (
        pattern.staff_id, occurrence_date, pattern.start_time, pattern.end_time,
        pattern.shift_type, null, pattern.id, pattern.note, 'scheduled',
        'generated', pattern.created_by
      )
      on conflict (shift_pattern_id, shift_date) where shift_pattern_id is not null
      do update set
        staff_id = excluded.staff_id,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        shift_type = excluded.shift_type,
        note = excluded.note,
        updated_at = now()
      where staff_shifts.registration_source = 'generated'
        and staff_shifts.status = 'scheduled';
    exception
      when exclusion_violation then
        -- A manual/admin shift owns this occurrence. Skip it without aborting
        -- this pattern or the remaining patterns in the cron refresh.
        null;
    end;
  end loop;
end;
$$;

-- Both source and destination room scopes are authoritative. Importer is not
-- a global manager and may only edit schedules it created/imported itself.
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
  is_importer boolean := (select private.has_role('importer'));
  can_manage_details boolean := false;
begin
  select * into before_row from public.class_schedules schedules
  where schedules.id = target_schedule_id and schedules.schedule_status <> 'cancelled'
  for update;
  if before_row.id is null then raise exception 'CLASS_NOT_AVAILABLE' using errcode = 'P0001'; end if;
  select rooms.room_type_id into source_room_type from public.rooms rooms where rooms.id = before_row.room_id;

  select rooms.room_type_id into target_room_type
  from public.rooms rooms where rooms.id = target_room_id and rooms.is_active;
  if target_room_type is null then raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501'; end if;

  if is_admin then
    can_manage_details := true;
  elsif is_staff then
    can_manage_details := (select private.has_room_type(source_room_type))
      and (select private.has_room_type(target_room_type));
  elsif is_importer then
    can_manage_details := (select private.has_room_type(source_room_type))
      and (select private.has_room_type(target_room_type))
      and (
        before_row.created_by = actor_id
        or exists (
          select 1 from public.import_batches batches
          where batches.id = before_row.import_batch_id and batches.created_by = actor_id
        )
      );
  end if;

  if not can_manage_details then
    if not coalesce(actor_id in (before_row.lecturer_id, before_row.lecturer_2_id), false) then
      raise exception 'CLASS_UPDATE_FORBIDDEN' using errcode = '42501';
    end if;
    if target_start_time is distinct from before_row.start_time
      or target_end_time is distinct from before_row.end_time
      or target_room_id is distinct from before_row.room_id
      or target_student_count is distinct from before_row.student_count
      or normalized_ids is distinct from array_remove(array[before_row.lecturer_id, before_row.lecturer_2_id], null)
    then raise exception 'CLASS_DETAILS_UPDATE_FORBIDDEN' using errcode = '42501'; end if;
  end if;

  if target_schedule_date is null or target_start_time is null or target_end_time <= target_start_time
    or target_student_count is null or target_student_count < 1 or target_room_id is null
    or cardinality(normalized_ids) > 2
    or cardinality(normalized_ids) <> cardinality(array(select distinct unnest(normalized_ids)))
  then raise exception 'INVALID_CLASS_DETAILS' using errcode = '22023'; end if;

  if not is_admin and (
    not (select private.has_room_type(source_room_type))
    or not (select private.has_room_type(target_room_type))
  ) then raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501'; end if;

  if exists (
    select 1 from unnest(normalized_ids) selected_lecturer_id
    where not exists (
      select 1 from public.profiles profiles
      where profiles.id = selected_lecturer_id and profiles.is_active
        and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
        and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = target_room_type)
    )
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501'; end if;

  update public.class_schedules set
    schedule_date = target_schedule_date, start_time = target_start_time, end_time = target_end_time,
    room_id = target_room_id, student_count = target_student_count,
    lecturer_id = normalized_ids[1], lecturer_2_id = normalized_ids[2], updated_at = now()
  where id = target_schedule_id returning * into changed_row;
  return changed_row;
exception when exclusion_violation then
  raise exception 'SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

-- Validation shared by create/update protects direct RPC and table writes.
create or replace function private.validate_equipment_request_content()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  skills_room_type constant uuid := '40000000-0000-0000-0000-000000000001'::uuid;
begin
  if new.semester not in ('HK1','HK2','HK3','HK4') then
    raise exception 'Học kỳ phải là HK1, HK2, HK3 hoặc HK4.' using errcode = '22023';
  end if;
  if length(coalesce(new.note, '')) > 2000 then
    raise exception 'Ghi chú không được vượt quá 2000 ký tự.' using errcode = '22023';
  end if;
  if length(coalesce(new.late_registration_reason, '')) > 1000 then
    raise exception 'Lý do đăng ký trễ không được vượt quá 1000 ký tự.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles profiles
    where profiles.id = new.responsible_lecturer_id and profiles.is_active
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
      and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = skills_room_type)
  ) then
    raise exception 'Giảng viên phụ trách không hợp lệ.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists equipment_requests_validate_content on public.equipment_requests;
create trigger equipment_requests_validate_content
before insert or update on public.equipment_requests
for each row execute function private.validate_equipment_request_content();

-- Canonical schedule-import hash is verified inside the SECURITY DEFINER RPC.
create or replace function private.import_schedule_business_key(
  target_course_code text, target_room_id uuid, target_date date,
  target_start time, target_end time
)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat(
    length(upper(btrim(coalesce(target_course_code, '')))), ':', upper(btrim(coalesce(target_course_code, ''))),
    length(target_room_id::text), ':', target_room_id::text,
    length(target_date::text), ':', target_date::text,
    length(to_char(target_start, 'HH24:MI:SS')), ':', to_char(target_start, 'HH24:MI:SS'),
    length(to_char(target_end, 'HH24:MI:SS')), ':', to_char(target_end, 'HH24:MI:SS')
  );
$$;

create or replace function private.import_schedule_hash(
  target_course_code text, target_room_id uuid, target_date date,
  target_start time, target_end time
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(private.import_schedule_business_key(
    target_course_code, target_room_id, target_date, target_start, target_end
  ), 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.create_import_schedule_row(
  target_batch_id uuid, target_row_number integer, target_hash text,
  target_raw jsonb, target_normalized jsonb, target_status public.import_row_status,
  target_errors jsonb, target_warnings jsonb, target_course_id uuid,
  target_course_code text, target_course_name text, target_room_id uuid,
  target_lecturer_id uuid, target_date date, target_start time, target_end time,
  target_note text, target_student_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  schedule_id uuid;
  batch_room_type_id uuid;
  selected_room_type_id uuid;
  canonical_hash text;
begin
  if not (select private.can_create_schedule_entries()) then raise exception 'SCHEDULE_CREATOR_ROLE_REQUIRED' using errcode = '42501'; end if;
  if target_status not in ('imported', 'warning') then raise exception 'INVALID_IMPORT_ROW_STATUS' using errcode = '22023'; end if;
  if target_student_count is null or target_student_count < 1 then raise exception 'INVALID_STUDENT_COUNT' using errcode = '22023'; end if;
  if target_date is null or target_start is null or target_end is null or target_end <= target_start then
    raise exception 'INVALID_IMPORT_SCHEDULE' using errcode = '22023';
  end if;

  select batches.room_type_id into batch_room_type_id from public.import_batches batches
  where batches.id = target_batch_id and batches.created_by = caller_id and batches.status = 'importing';
  if batch_room_type_id is null then raise exception 'IMPORT_BATCH_NOT_WRITABLE' using errcode = '42501'; end if;
  select rooms.room_type_id into selected_room_type_id from public.rooms rooms where rooms.id = target_room_id and rooms.is_active;
  if selected_room_type_id is null or selected_room_type_id <> batch_room_type_id
    or not (select private.has_room_type(selected_room_type_id)) then
    raise exception 'ROOM_TYPE_SCOPE_REQUIRED' using errcode = '42501';
  end if;
  if target_lecturer_id is not null and not exists (
    select 1 from public.profiles profiles
    where profiles.id = target_lecturer_id and profiles.is_active
      and exists (select 1 from public.user_roles roles where roles.user_id = profiles.id and roles.role = 'lecturer')
      and exists (select 1 from public.profile_room_types scopes where scopes.profile_id = profiles.id and scopes.room_type_id = selected_room_type_id)
  ) then raise exception 'LECTURER_ROOM_TYPE_MISMATCH' using errcode = '42501'; end if;

  canonical_hash := private.import_schedule_hash(target_course_code, target_room_id, target_date, target_start, target_end);
  if target_hash is distinct from canonical_hash then raise exception 'INVALID_IMPORT_HASH' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(canonical_hash, 0));
  if exists (
    select 1 from public.class_schedules schedules
    where schedules.schedule_status <> 'cancelled'
      and schedules.room_id = target_room_id and schedules.schedule_date = target_date
      and schedules.start_time = target_start and schedules.end_time = target_end
      and upper(btrim(schedules.course_code_snapshot)) = upper(btrim(target_course_code))
  ) then raise exception 'IMPORT_ROW_DUPLICATE' using errcode = '23505'; end if;

  insert into public.class_schedules (
    course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id,
    class_code, schedule_date, start_time, end_time, source, source_row_id,
    import_batch_id, schedule_status, note, student_count, created_by, published_by, published_at
  ) values (
    target_course_id, target_course_code, target_course_name, target_room_id, target_lecturer_id,
    null, target_date, target_start, target_end, 'import', null, target_batch_id,
    'published', target_note, target_student_count, caller_id, caller_id, now()
  ) returning id into schedule_id;
  insert into public.import_rows (
    import_batch_id, row_number, source_row_id, normalized_row_hash, raw_data,
    normalized_data, validation_status, errors, warnings, class_schedule_id
  ) values (
    target_batch_id, target_row_number, null, canonical_hash,
    coalesce(target_raw, '{}'::jsonb), coalesce(target_normalized, '{}'::jsonb),
    target_status, coalesce(target_errors, '[]'::jsonb), coalesce(target_warnings, '[]'::jsonb), schedule_id
  );
  return schedule_id;
exception when exclusion_violation then
  raise exception 'SCHEDULE_CONFLICT' using errcode = '23P01';
end;
$$;

revoke all on function private.snapshot_email_delivery_mode() from public, anon, authenticated;
revoke all on function private.materialize_shift_pattern(uuid, date) from public, anon, authenticated;
revoke all on function private.validate_equipment_request_content() from public, anon, authenticated;
revoke all on function private.import_schedule_business_key(text, uuid, date, time, time) from public, anon, authenticated;
revoke all on function private.import_schedule_hash(text, uuid, date, time, time) from public, anon, authenticated;

revoke all on function public.manager_confirm_equipment_status(uuid, text) from public, anon;
grant execute on function public.manager_confirm_equipment_status(uuid, text) to authenticated;

revoke all on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) from public, anon;
grant execute on function public.update_class_schedule_details(uuid, date, time, time, uuid, integer, uuid[]) to authenticated;

revoke all on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text, integer
) from public, anon;
grant execute on function public.create_import_schedule_row(
  uuid, integer, text, jsonb, jsonb, public.import_row_status, jsonb, jsonb,
  uuid, text, text, uuid, uuid, date, time, time, text, integer
) to authenticated;
